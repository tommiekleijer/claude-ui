import { native } from './native';
import { isTerminalKey, setShortcuts, useApp } from './store';

const mac = native?.platform === 'darwin';

type Shortcut = { id: string; label: string; standaard: string; ookInTerminal?: boolean };

/**
 * Combinaties als 'Mod+Shift+Tab': Mod is Ctrl of (op de Mac) Cmd, de toets komt uit event.key (letters als hoofdletter).
 * Op de Mac betekent 'Ctrl' alleen Ctrl; de wisseltoets gebruikt dat, want Cmd+` wisselt daar tussen vensters.
 */
export const SHORTCUTS = [
  { id: 'toggleFocus', label: 'Wisselen tussen chat en terminal', standaard: mac ? 'Ctrl+`' : 'Mod+`', ookInTerminal: true },
  { id: 'newTab', label: 'Nieuw tabblad', standaard: 'Mod+T' },
  { id: 'closeTab', label: 'Tabblad sluiten', standaard: 'Mod+W' },
  { id: 'reopenTab', label: 'Gesloten tabblad heropenen', standaard: 'Mod+Shift+T' },
  { id: 'toggleSidebar', label: 'Zijbalk in- of uitklappen', standaard: 'Mod+B' },
  { id: 'nextTab', label: 'Volgend tabblad', standaard: 'Mod+Tab' },
  { id: 'previousTab', label: 'Vorig tabblad', standaard: 'Mod+Shift+Tab' },
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ id: `tab${n}` as `tab${number}`, label: `Naar tabblad ${n}`, standaard: `Mod+${n}` })),
  { id: 'lastTab', label: 'Naar laatste tabblad', standaard: 'Mod+9' },
  { id: 'cycleMode', label: 'Permissiemodus wisselen', standaard: 'Shift+Tab' },
  { id: 'search', label: 'Zoeken in de chat', standaard: 'Mod+F' },
  { id: 'effortUp', label: 'Effort hoger', standaard: 'Mod+ArrowUp' },
  { id: 'effortDown', label: 'Effort lager', standaard: 'Mod+ArrowDown' },
] as const satisfies readonly Shortcut[];

export type ShortcutId = (typeof SHORTCUTS)[number]['id'];

const definition = (id: ShortcutId): Shortcut => SHORTCUTS.find((s) => s.id === id) as Shortcut;

export const shortcutCombo = (id: ShortcutId, overrides = useApp.getState().shortcuts) => overrides[id] ?? definition(id).standaard;

/** Chromium op Wayland geeft bij Ctrl+` key 'Unidentified'; dan de toets uit event.code halen (US-indeling). */
const CODE_KEYS: Record<string, string> = {
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
};

const keyOf = (event: KeyboardEvent) =>
  event.key === 'Unidentified' ? (CODE_KEYS[event.code] ?? event.code.replace(/^(Key|Digit)/, '')) : event.key;

export const comboFromEvent = (event: KeyboardEvent) => {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) {
    return null;
  }
  const key = keyOf(event);
  return [
    mac && event.ctrlKey && !event.metaKey ? 'Ctrl' : event.ctrlKey || event.metaKey ? 'Mod' : '',
    event.altKey ? 'Alt' : '',
    event.shiftKey ? 'Shift' : '',
    key.length === 1 ? key.toUpperCase() : key,
  ]
    .filter(Boolean)
    .join('+');
};

/** Ctrl op de Mac doet ook wat Cmd doet, net als voorheen. */
const asMod = (combo: string) => combo.replace(/^Ctrl\+/, 'Mod+');

/** App-sneltoetsen laten de ingebouwde terminal met rust (vim, nano, less, …), behalve de toets om eruit te wisselen. */
export const matchesShortcut = (event: KeyboardEvent, id: ShortcutId) => {
  const pressed = comboFromEvent(event);
  const combo = shortcutCombo(id);
  return (!isTerminalKey(event) || Boolean(definition(id).ookInTerminal)) && pressed !== null && (pressed === combo || asMod(pressed) === combo);
};

const KEY_LABELS: Record<string, string> = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', ' ': 'Spatie' };

const splitCombo = (combo: string) => {
  // De toets zelf kan '+' zijn ('Mod++').
  const split = combo.lastIndexOf('+', combo.length - 2);
  return { modifiers: split === -1 ? [] : combo.slice(0, split).split('+'), key: combo.slice(split + 1) };
};

export const formatCombo = (combo: string) => {
  const { modifiers, key } = splitCombo(combo);
  return [...modifiers.map((part) => (part === 'Mod' ? (mac ? 'Cmd' : 'Ctrl') : part)), KEY_LABELS[key] ?? key].join('+');
};

export const useShortcut = (id: ShortcutId) => useApp((s) => formatCombo(shortcutCombo(id, s.shortcuts)));

/** Combinaties die het Electron-menu (electron/main.ts) of de editor al afhandelt. */
const RESERVED: Record<string, string> = {
  'Mod+C': 'Kopiëren',
  'Mod+V': 'Plakken',
  'Mod+X': 'Knippen',
  'Mod+Z': 'Ongedaan maken',
  'Mod+Y': 'Opnieuw',
  'Mod+Shift+Z': 'Opnieuw',
  'Mod+A': 'Alles selecteren',
  'Mod+=': 'Inzoomen',
  'Mod++': 'Inzoomen',
  'Mod+Shift++': 'Inzoomen',
  'Mod+-': 'Uitzoomen',
  'Mod+0': 'Zoom herstellen',
  'Mod+Shift+I': 'Ontwikkelaarstools',
  F11: 'Volledig scherm',
};

/** Legt een combinatie vast (null = terug naar standaard); geeft een melding terug als hij niet mag of een andere actie hem al gebruikt. */
export const assignShortcut = (id: ShortcutId, combo: string | null) => {
  const target = combo ?? definition(id).standaard;
  const { modifiers, key } = splitCombo(target);
  // Zonder Ctrl, Cmd of Alt zou de toets tijdens het typen afgaan.
  if (!modifiers.some((part) => ['Mod', 'Ctrl', 'Alt'].includes(part)) && target !== 'Shift+Tab' && !/^F\d+$/.test(key)) {
    return `Gebruik Ctrl${mac ? ', Cmd' : ''} of Alt in de combinatie; alleen Shift+Tab en F-toetsen mogen zonder.`;
  }
  if (RESERVED[asMod(target)]) {
    return `${formatCombo(target)} is al in gebruik voor '${RESERVED[asMod(target)]}'.`;
  }
  const conflict = SHORTCUTS.find((s) => s.id !== id && asMod(shortcutCombo(s.id)) === asMod(target));
  if (conflict) {
    return `${formatCombo(target)} is al in gebruik voor '${conflict.label}'.`;
  }
  const { [id]: _, ...rest } = useApp.getState().shortcuts;
  setShortcuts(target === definition(id).standaard ? rest : { ...rest, [id]: target });
  return null;
};
