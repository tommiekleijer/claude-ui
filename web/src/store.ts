import { createContext } from 'react';
import { create, StoreApi, useStore as useZustandStore } from 'zustand';
import type {
  Attachment,
  ChatItem,
  ClientEvent,
  Effort,
  Limits,
  ManageInfo,
  ModelOption,
  SavedTabs,
  ServerEvent,
  SessionSummary,
  TaskInfo,
  ToolItem,
  UsageReport,
  Usage,
  Thema,
} from '../../shared/protocol';
import { native, UpdateState } from './native';

export type PermissionRequest = Extract<ServerEvent, { type: 'permission_request' }>;
export type QuestionRequest = Extract<ServerEvent, { type: 'question' }>;
export type Dirs = Extract<ServerEvent, { type: 'dirs' }>;
export type Notice = { id: number; text: string };
/** resumed: automatisch opnieuw ingepland omdat het werd onderbroken door 'Nu versturen'. */
export type QueuedMessage = { id: number; text: string; attachments: Attachment[]; resumed?: boolean };
export type SubActivity = { id: string; kind: 'tool' | 'text'; label: string };

/** Gedeeld over alle tabbladen. */
type AppState = {
  apiKeyPresent: boolean;
  root: string;
  recent: string[];
  sessions: SessionSummary[];
  notices: Notice[];
  pickerOpen: boolean;
  dirs: Dirs | null;
  models: ModelOption[];
  limits: Limits;
  tabIds: number[];
  activeId: number;
  manageOpen: boolean;
  usageReport: UsageReport | null;
  usageOpen: boolean;
  sidebarOpen: boolean;
  opacity: number;
  thema: Thema;
  /** Systeemmeldingen als Claude klaar is of iets van je nodig heeft in een chat waar je niet zit. */
  meldingen: boolean;
  /** Eigen accentkleur (#rrggbb); null = het standaard paars van Vertex. */
  accent: string | null;
  settingsOpen: boolean;
  /** Status van het zoeken naar een nieuwe versie (alleen in de app). */
  update: UpdateState | null;
  /** Geselecteerde chattekst die als citaat in het invoerveld moet; de Composer neemt hem over en zet dit weer op null. */
  quote: string | null;
  /** Breedte (px) van de ingeklapte terminal rechts. */
  dockWidth: number;
  terminalAvailable: boolean;
  /** Open terminals in de app (shells en de echte Claude Code voor interactieve /-commands). */
  terminals: TerminalInfo[];
  activeTerminal: string | null;
  /** Terminalpaneel ingeklapt naar rechts of groot in beeld. */
  terminalMinimized: boolean;
};

export type TerminalInfo = {
  id: string;
  /** Tabblad (verbinding) waarop de terminal draait; bepaalt ook de projectmap. */
  tabId: number;
  /** Echte Claude Code met deze argumenten (bv. ['/mcp']). */
  args?: string[];
  /** Gewone shell; met een commando dat bij het starten wordt ingetypt ('' = lege shell). */
  shell?: string;
  title: string;
  onClose?: () => void;
};

/** Per tabblad: elk tabblad heeft een eigen verbinding en dus een eigen Claude-sessie. */
type TabState = {
  connected: boolean;
  apiKeySource: string | null;
  cwd: string | null;
  sessionId: string | null;
  items: ChatItem[];
  running: boolean;
  model: string | null;
  permissionMode: string | null;
  costUsd: number | null;
  usage: Usage | null;
  permissions: PermissionRequest[];
  selectedModel: string | null;
  effort: Effort | null;
  context: { percentage: number; totalTokens: number; maxTokens: number } | null;
  queue: QueuedMessage[];
  forceNext: boolean;
  lastSent: Omit<QueuedMessage, 'id'> | null;
  tasks: TaskInfo[];
  subActivity: Record<string, SubActivity[]>;
  manage: ManageInfo | null;
  taskOutput: { taskId: string; output: string } | null;
  subagentView: { toolUseId: string; items: ChatItem[] | null } | null;
  subagentLive: Record<string, ChatItem[]>;
  /** Claude is klaar terwijl je in een ander tabblad zat; weg zodra je het tabblad opent. */
  unread: boolean;
  questions: QuestionRequest[];
  /** Een /-command dat alleen in de terminal werkt; de app biedt aan het daar te openen. */
  terminalHint: string | null;
  /** Voorspeld volgend bericht van de SDK; grijs in het lege invoerveld, Tab neemt hem over. */
  promptSuggestion: string | null;
};

type State = AppState & TabState;

type Tab = { id: number; store: StoreApi<TabState>; socket: WebSocket | null; closed: boolean };

const emptyTab = (): TabState => ({
  connected: false,
  apiKeySource: null,
  cwd: null,
  sessionId: null,
  items: [],
  running: false,
  model: null,
  permissionMode: null,
  costUsd: null,
  usage: null,
  permissions: [],
  selectedModel: null,
  effort: null,
  context: null,
  queue: [],
  forceNext: false,
  lastSent: null,
  tasks: [],
  subActivity: {},
  manage: null,
  taskOutput: null,
  subagentView: null,
  subagentLive: {},
  unread: false,
  questions: [],
  terminalHint: null,
  promptSuggestion: null,
});

/** Vertex kiest licht/donker via data-thema op <html>; zonder attribuut volgt het het systeem. */
const applyThema = (thema: Thema) => {
  if (thema === 'systeem') {
    delete document.documentElement.dataset.thema;
  } else {
    document.documentElement.dataset.thema = thema;
  }
  window.dispatchEvent(new Event('thema'));
};

const applyOpacity = (opacity: number) => document.documentElement.style.setProperty('--alpha', String(opacity / 100));

// Weergave-instellingen staan in de config van de backend (de poort, en dus de opslag van het venster, wisselt per start).
let saveUiTimer: ReturnType<typeof setTimeout> | undefined;
const saveUi = () => {
  clearTimeout(saveUiTimer);
  saveUiTimer = setTimeout(() => {
    const { opacity, sidebarOpen, dockWidth, thema, meldingen, accent } = useApp.getState();
    send({ type: 'save_ui', opacity, sidebarOpen, dockWidth, thema, meldingen, accent });
  }, 300);
};

/** Breedte van de ingeklapte terminal; begrensd zodat de chat altijd bruikbaar blijft. */
const clampDock = (width: number) => Math.round(Math.min(Math.max(width, 280), window.innerWidth - 420));

/** Tijdens slepen: alleen de CSS-variabele, zonder React-render, zodat het soepel blijft. */
export const previewDockWidth = (width: number) =>
  document.documentElement.style.setProperty('--dock-width', `${clampDock(width)}px`);

export const setDockWidth = (width: number, save = true) => {
  if (!Number.isFinite(width)) {
    return;
  }
  const dockWidth = clampDock(width);
  useApp.setState({ dockWidth });
  document.documentElement.style.setProperty('--dock-width', `${dockWidth}px`);
  if (save) {
    saveUi();
  }
};

export const toggleSidebar = () => {
  useApp.setState({ sidebarOpen: !useApp.getState().sidebarOpen });
  saveUi();
};

/** Dekking van de achtergrond in procenten (30–100); alleen in de app-versie is het venster echt doorzichtig. */
export const setOpacity = (opacity: number) => {
  useApp.setState({ opacity });
  applyOpacity(opacity);
  saveUi();
};

/** Tekstkleur op de accentkleur: wit, of bijna zwart als het accent zo licht is dat wit slecht leest. */
const textOnAccent = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5 ? '#1a1b1e' : '#ffffff';
};

/** De rest van de accentkleuren (zacht, verloop, schaduw) leidt global.scss af van --eigen-accent. */
const applyAccent = (accent: string | null) => {
  const root = document.documentElement;
  if (accent && /^#[0-9a-f]{6}$/i.test(accent)) {
    root.dataset.accent = 'aan';
    root.style.setProperty('--eigen-accent', accent);
    root.style.setProperty('--tekst-op-accent', textOnAccent(accent));
  } else {
    delete root.dataset.accent;
    root.style.removeProperty('--eigen-accent');
    root.style.removeProperty('--tekst-op-accent');
  }
  window.dispatchEvent(new Event('thema'));
};

export const setAccent = (accent: string | null) => {
  useApp.setState({ accent });
  applyAccent(accent);
  saveUi();
};

export const quoteInComposer = (text: string) => useApp.setState({ quote: text });
export const clearQuote = () => useApp.setState({ quote: null });

export const openSettings = () => useApp.setState({ settingsOpen: true });
export const closeSettings = () => useApp.setState({ settingsOpen: false });

export const setMeldingen = (meldingen: boolean) => {
  useApp.setState({ meldingen });
  saveUi();
};

export const setThema = (thema: Thema) => {
  useApp.setState({ thema });
  applyThema(thema);
  saveUi();
};

export const useApp = create<AppState>()(() => ({
  apiKeyPresent: false,
  root: '',
  recent: [],
  sessions: [],
  notices: [],
  pickerOpen: false,
  dirs: null,
  models: [],
  limits: {},
  tabIds: [],
  activeId: 0,
  manageOpen: false,
  usageReport: null,
  usageOpen: false,
  sidebarOpen: true,
  opacity: 100,
  thema: 'systeem',
  meldingen: true,
  accent: null,
  settingsOpen: false,
  update: null,
  quote: null,
  dockWidth: 460,
  terminalAvailable: false,
  terminals: [],
  activeTerminal: null,
  terminalMinimized: true,
}));

const tabs = new Map<number, Tab>();
let nextTabId = 1;
let restored = false;

export const getTab = (id: number) => tabs.get(id);

/** Toetsaanslag in de ingebouwde terminal: app-sneltoetsen laten die met rust (vim, nano, less, …). */
export const isTerminalKey = (event: KeyboardEvent) => Boolean((event.target as Element | null)?.closest?.('.xterm'));

/** Het tabblad waarin een stuk chat getoond wordt; 0 = het actieve tabblad. */
export const TabIdContext = createContext(0);
const activeTab = () => tabs.get(useApp.getState().activeId) as Tab;

/** Leest uit de gedeelde staat plus die van het actieve tabblad. */
export function useStore<T>(selector: (state: State) => T): T {
  const app = useApp();
  const tab = tabs.get(app.activeId) ?? fallbackTab;
  return useZustandStore(tab.store, (t) => selector({ ...app, ...t }));
}

/** Leest uit een bepaald tabblad (voor de tabbalk). */
export const useTabState = <T,>(id: number, selector: (state: TabState) => T): T =>
  useZustandStore((tabs.get(id) ?? fallbackTab).store, selector);

const fallbackTab: Tab = { id: 0, store: create<TabState>()(emptyTab), socket: null, closed: true };

const sendTo = (tab: Tab, event: ClientEvent) => {
  if (tab.socket?.readyState === WebSocket.OPEN) {
    tab.socket.send(JSON.stringify(event));
  }
};

export const send = (event: ClientEvent) => sendTo(activeTab(), event);

let noticeId = 0;
export const notify = (text: string) =>
  useApp.setState((s) => ({ notices: [...s.notices, { id: ++noticeId, text }] }));
export const dismissNotice = (id: number) =>
  useApp.setState((s) => ({ notices: s.notices.filter((n) => n.id !== id) }));
export const setPickerOpen = (pickerOpen: boolean) => useApp.setState({ pickerOpen });

const setTab = (partial: Partial<TabState> | ((s: TabState) => Partial<TabState>)) => activeTab().store.setState(partial);

const resetConversation: Partial<TabState> = {
  items: [],
  sessionId: null,
  costUsd: null,
  usage: null,
  permissions: [],
  running: false,
  context: null,
  tasks: [],
  subActivity: {},
  promptSuggestion: null,
};

let queueId = 0;
export const enqueue = (text: string, attachments: Attachment[]) =>
  setTab((s) => ({ queue: [...s.queue, { id: ++queueId, text, attachments }] }));
export const dequeue = (id: number) => setTab((s) => ({ queue: s.queue.filter((q) => q.id !== id) }));
export const setLastSent = (lastSent: Omit<QueuedMessage, 'id'>) => setTab({ lastSent });
/**
 * Zet het bericht vooraan; na de onderbreking gaat het als eerste.
 * Het bericht dat werd onderbroken komt er direct achter, zodat het alsnog antwoord krijgt.
 */
export const prioritize = (id: number) => {
  const tab = activeTab();
  const s = tab.store.getState();
  const item = s.queue.find((q) => q.id === id);
  if (!item) {
    return;
  }
  // Direct versturen met voorrang; het onderbroken bericht komt vooraan de wachtrij en gaat daarna alsnog.
  sendTo(tab, { type: 'send', text: item.text, attachments: item.attachments, force: s.running });
  const interrupted = s.running && s.lastSent ? [{ ...s.lastSent, id: ++queueId, resumed: true }] : [];
  tab.store.setState({
    queue: [...interrupted, ...s.queue.filter((q) => q.id !== id)],
    lastSent: { text: item.text, attachments: item.attachments },
    running: true,
    promptSuggestion: null,
    items: [
      ...s.items,
      { kind: 'user', id: `local-${Date.now()}`, text: item.text, attachments: item.attachments.filter((a) => a.kind !== 'image').map((a) => a.name), images: imageUrls(item.attachments) },
    ],
  });
};

/** Meegestuurde afbeeldingen als data-URL, om in de chat te tonen. */
export const imageUrls = (attachments: Attachment[]) =>
  attachments.filter((a) => a.kind === 'image').map((a) => `data:${a.mediaType};base64,${a.data}`);

export const addUserItem = (text: string, attachments: Attachment[]) =>
  setTab((s) => ({
    items: [
      ...s.items,
      {
        kind: 'user',
        id: `local-${Date.now()}`,
        text,
        attachments: attachments.filter((a) => a.kind !== 'image').map((a) => a.name),
        images: imageUrls(attachments),
      },
    ],
    running: true,
    promptSuggestion: null,
  }));

/** Opent het gesprek van de subagent die door deze Agent-tool is gestart. */
export const openSubagent = (toolUseId: string) => {
  setTab({ subagentView: { toolUseId, items: null } });
  send({ type: 'subagent', toolUseId });
};
export const refreshSubagent = (toolUseId: string) => send({ type: 'subagent', toolUseId });
export const closeSubagent = () => setTab({ subagentView: null });
export const closeTaskOutput = () => setTab({ taskOutput: null });
/** Opent het usage-overzicht en haalt verse cijfers op. */
export const openUsage = () => {
  useApp.setState({ usageOpen: true });
  send({ type: 'usage' });
};
export const closeUsage = () => useApp.setState({ usageOpen: false });
export const setManageOpen = (manageOpen: boolean) => useApp.setState({ manageOpen });

/** Zet tekst in het invoerveld van het actieve tabblad (bv. een slash-command). */
export const insertInComposer = (text: string) => window.dispatchEvent(new CustomEvent('composer-insert', { detail: text }));
export const focusComposer = () => window.dispatchEvent(new Event('composer-focus'));

export const answerQuestion = (id: string, answers: Record<string, string> | null, chat = false) => {
  send({ type: 'question_response', id, answers, chat });
  setTab((s) => ({ questions: s.questions.filter((q) => q.id !== id) }));
  if (chat) {
    focusComposer();
  }
};

/** Voert een `!`-commando uit; de uitvoer verschijnt als Bash-kaart en gaat mee met je volgende bericht. */
export const runShellCommand = (command: string) => {
  const id = `shell-${Date.now()}`;
  send({ type: 'shell', id, command });
  setTab((s) => ({ items: [...s.items, { kind: 'tool', id, name: 'Bash', input: { command }, done: false }] }));
};

type PtyEvent = Extract<ServerEvent, { type: 'pty_data' | 'pty_exit' | 'pty_started' }>;
const ptyListeners = new Map<string, (event: PtyEvent) => void>();
export const onPty = (id: string, listener: (event: PtyEvent) => void) => {
  ptyListeners.set(id, listener);
  return () => {
    ptyListeners.delete(id);
  };
};
export const sendToTab = (tabId: number, event: ClientEvent) => {
  const tab = tabs.get(tabId);
  if (tab) {
    sendTo(tab, event);
  }
};

/** Na inloggen in de terminal: MCP-servers die op inloggen wachtten opnieuw verbinden. */
export const refreshMcpAfterLogin = () => {
  for (const server of activeTab().store.getState().manage?.mcp ?? []) {
    if (server.status === 'needs-auth' || server.status === 'failed') {
      send({ type: 'mcp_reconnect', name: server.name });
    }
  }
  send({ type: 'manage' });
};

let terminalCounter = 0;
const addTerminal = (terminal: Omit<TerminalInfo, 'id' | 'tabId'>) => {
  const id = `pty-${Date.now()}-${++terminalCounter}`;
  useApp.setState((s) => ({
    terminals: [...s.terminals, { ...terminal, id, tabId: s.activeId }],
    activeTerminal: id,
    // Nieuwe terminals openen direct als paneel rechts; groot maken kan met de knop.
    terminalMinimized: true,
  }));
  return id;
};

/** Opent de echte Claude Code in een terminal in de app, bv. openTerminal(['/mcp']). */
export const openTerminal = (args: string[], onClose?: () => void) =>
  addTerminal({ args, title: `claude ${args.join(' ')}`.trim(), onClose });

/** Nieuwe lege shell in de projectmap van het actieve tabblad (het +-knopje). */
export const openShell = () => addTerminal({ shell: '', title: 'Terminal' });

/** Voert een aangeklikt commando uit; in de actieve shell van dit tabblad als die er is, anders in een nieuwe. */
export const runInTerminal = (command: string) => {
  const { terminals, activeTerminal, activeId } = useApp.getState();
  const current = terminals.find((t) => t.id === activeTerminal);
  if (current?.shell !== undefined && current.tabId === activeId) {
    sendToTab(current.tabId, { type: 'pty_input', id: current.id, data: `${command}\r` });
    return;
  }
  addTerminal({ shell: command, title: command });
};

export const setTerminalMinimized = (terminalMinimized: boolean) => useApp.setState({ terminalMinimized });
export const activateTerminal = (activeTerminal: string) => useApp.setState({ activeTerminal });
export const setTerminalTitle = (id: string, title: string) =>
  useApp.setState((s) => ({ terminals: s.terminals.map((t) => (t.id === id ? { ...t, title } : t)) }));

/** Knop in de tabbalk: paneel tonen, of een eerste shell openen als er nog geen terminal is. */
export const toggleTerminalPanel = () => {
  const { terminals, terminalMinimized } = useApp.getState();
  if (terminals.length === 0) {
    openShell();
  } else {
    setTerminalMinimized(!terminalMinimized);
  }
};

type ImageEvent = Extract<ServerEvent, { type: 'image' }>;
const imageWaiters = new Map<string, (event: ImageEvent) => void>();
/** Leest een afbeelding (pad relatief aan het project van het actieve tabblad) voor in de chat. */
export const readImage = (path: string) =>
  new Promise<ImageEvent>((resolve) => {
    const id = `img-${Date.now()}-${Math.random()}`;
    imageWaiters.set(id, resolve);
    send({ type: 'read_image', id, path });
  });
export const closeTerminal = (id?: string) => {
  const { terminals, activeTerminal } = useApp.getState();
  const target = terminals.find((t) => t.id === (id ?? activeTerminal));
  if (!target) {
    return;
  }
  sendToTab(target.tabId, { type: 'pty_kill', id: target.id });
  target.onClose?.();
  const rest = terminals.filter((t) => t.id !== target.id);
  const index = terminals.indexOf(target);
  useApp.setState({
    terminals: rest,
    activeTerminal: activeTerminal === target.id ? (rest[Math.max(0, index - 1)]?.id ?? null) : activeTerminal,
  });
};
export const clearTerminalHint = () => setTab({ terminalHint: null });

/** /clear: een nieuwe sessie in dit tabblad. */
export const clearConversation = () => {
  send({ type: 'new_session' });
  setTab({ ...resetConversation, queue: [], tasks: [], subActivity: {} });
};

export const removePermission = (id: string) =>
  setTab((s) => ({ permissions: s.permissions.filter((p) => p.id !== id) }));

// Wachtrij afwerken zodra Claude klaar is, ook als het tabblad niet zichtbaar is.
const processQueue = (tab: Tab) => {
  const { running, connected, queue } = tab.store.getState();
  const [next] = queue;
  if (running || !connected || !next) {
    return;
  }
  const text = next.resumed ? `Ga verder met deze eerdere vraag, die werd onderbroken: ${next.text}` : next.text;
  sendTo(tab, { type: 'send', text, attachments: next.attachments });
  tab.store.setState((s) => ({
    lastSent: { text: next.text, attachments: next.attachments },
    queue: s.queue.filter((q) => q.id !== next.id),
    forceNext: false,
    running: true,
    promptSuggestion: null,
    // Een hervat bericht staat al in de chat; alleen nieuwe berichten krijgen een eigen bericht.
    items: next.resumed
      ? s.items
      : [...s.items, { kind: 'user', id: `local-${Date.now()}`, text: next.text, attachments: next.attachments.filter((a) => a.kind !== 'image').map((a) => a.name), images: imageUrls(next.attachments) }],
  }));
};

const updateItem = (items: ChatItem[], id: string, update: (item: ChatItem) => ChatItem) =>
  items.map((item) => (item.id === id ? update(item) : item));

/** Naam van de chat zoals in de tabbalk: titel of eerste bericht, met de repo erbij. */
const tabLabel = (tab: Tab) => {
  const { sessionId, items, cwd } = tab.store.getState();
  const first = items.find((i) => i.kind === 'user');
  const title =
    (sessionId ? useApp.getState().sessions.find((s) => s.sessionId === sessionId)?.title : undefined) ||
    (first?.kind === 'user' ? first.text : '') ||
    'Nieuwe chat';
  const repo = cwd?.split('/').pop();
  return `${repo ? `${repo}: ` : ''}${title.slice(0, 80)}`;
};

/** Systeemmelding, behalve als je die chat al in beeld hebt in het actieve venster. */
const notifyUser = (tab: Tab, title: string, body: string) => {
  if (!native || !useApp.getState().meldingen) {
    return;
  }
  if (useApp.getState().activeId === tab.id && document.hasFocus()) {
    return;
  }
  native.notify(title, body, tab.id);
};

native?.onFocusTab((tabId) => activateTab(tabId));
void native?.updates.state().then((update) => useApp.setState({ update }));
native?.updates.onState((update) => {
  useApp.setState({ update });
  if (update.status === 'available') {
    notify(`Nieuwe versie ${update.version} beschikbaar: zie Instellingen.`);
  }
});

const applyEvent = (tab: Tab, event: ServerEvent) => {
  const set = tab.store.setState;
  switch (event.type) {
    case 'hello':
      useApp.setState({
        apiKeyPresent: event.apiKeyPresent,
        recent: event.recent,
        root: event.root,
        models: event.models,
        limits: event.limits,
        terminalAvailable: event.terminal,
      });
      if (!restored) {
        useApp.setState({ opacity: event.ui.opacity, sidebarOpen: event.ui.sidebarOpen, thema: event.ui.thema, meldingen: event.ui.meldingen, accent: event.ui.accent ?? null });
        applyOpacity(event.ui.opacity);
        applyThema(event.ui.thema);
        applyAccent(event.ui.accent ?? null);
        setDockWidth(event.ui.dockWidth, false);
      }
      if (!restored) {
        restored = true;
        restoreTabs(tab, event.tabs);
      }
      if (useApp.getState().activeId === tab.id && !tab.store.getState().cwd) {
        useApp.setState({ pickerOpen: true });
      }
      return;
    case 'root':
      useApp.setState({ root: event.root, recent: event.recent });
      return;
    case 'settings':
      set((s) => ({ selectedModel: event.model, effort: event.effort, permissionMode: event.mode ?? s.permissionMode }));
      return;
    case 'limits':
      useApp.setState({ limits: event.limits });
      return;
    case 'usage_report':
      useApp.setState({ usageReport: event.report });
      return;
    case 'context':
      set({ context: { percentage: event.percentage, totalTokens: event.totalTokens, maxTokens: event.maxTokens } });
      return;
    case 'dirs':
      useApp.setState({ dirs: event });
      return;
    case 'project':
      set({ ...resetConversation, cwd: event.cwd });
      useApp.setState({ recent: event.recent, pickerOpen: false });
      return;
    case 'sessions':
      useApp.setState({ sessions: event.sessions });
      return;
    case 'history':
      set({ ...resetConversation, sessionId: event.sessionId, items: event.items });
      return;
    case 'init':
      set({
        sessionId: event.sessionId,
        model: event.model,
        permissionMode: event.permissionMode,
        apiKeySource: event.apiKeySource,
      });
      return;
    case 'text_start':
      set((s) =>
        s.items.some((i) => i.id === event.id)
          ? s
          : { items: [...s.items, { kind: 'assistant', id: event.id, text: '', streaming: true }] },
      );
      return;
    case 'text_delta':
      set((s) => ({
        items: updateItem(s.items, event.id, (i) => (i.kind === 'assistant' ? { ...i, text: i.text + event.text } : i)),
      }));
      return;
    case 'text_end':
      set((s) => ({
        items: updateItem(s.items, event.id, (i) => (i.kind === 'assistant' ? { ...i, streaming: false } : i)),
      }));
      return;
    case 'tool_start': {
      const tool: ToolItem = { kind: 'tool', id: event.id, name: event.name, input: event.input, done: false };
      set((s) => ({ items: [...s.items.filter((i) => i.id !== event.id), tool] }));
      return;
    }
    case 'tool_end':
      set((s) => ({
        items: updateItem(s.items, event.id, (i) =>
          i.kind === 'tool' ? { ...i, output: event.output, isError: event.isError, done: true } : i,
        ),
      }));
      return;
    case 'permission_request':
      set((s) => ({ permissions: [...s.permissions, event] }));
      notifyUser(tab, 'Claude wacht op toestemming', event.title || event.toolName);
      return;
    case 'permission_cancelled':
      set((s) => ({ permissions: s.permissions.filter((p) => p.id !== event.id) }));
      return;
    case 'result':
      set((s) => ({
        costUsd: event.costUsd,
        usage: event.usage,
        items: [
          ...s.items.map((i) => (i.kind === 'assistant' && i.streaming ? { ...i, streaming: false } : i)),
          ...(event.isError
            ? [{ kind: 'marker' as const, id: `marker-${Date.now()}`, text: event.errorText || 'Taak gestopt' }]
            : []),
        ],
      }));
      return;
    case 'running':
      if (event.running === false && tab.store.getState().running) {
        notifyUser(tab, 'Claude is klaar', tabLabel(tab));
      }
      set((s) => ({
        unread: s.unread || (s.running && !event.running && useApp.getState().activeId !== tab.id),
        running: event.running,
        promptSuggestion: event.running ? null : s.promptSuggestion,
        permissions: event.running ? s.permissions : [],
        items: event.running ? s.items : s.items.map((i) => (i.kind === 'tool' && !i.done ? { ...i, done: true } : i)),
      }));
      return;
    case 'prompt_suggestion':
      set((s) => (s.running ? s : { promptSuggestion: event.suggestion }));
      return;
    case 'turn_started':
      set((s) => ({ items: [...s.items, { kind: 'marker', id: `turn-${Date.now()}`, text: event.reason }] }));
      return;
    case 'tasks':
      set({ tasks: event.tasks });
      return;
    case 'sub_activity':
      set((s) => {
        const list = s.subActivity[event.parentId] ?? [];
        if (list.some((a) => a.id === event.id)) {
          return s;
        }
        return { subActivity: { ...s.subActivity, [event.parentId]: [...list, event].slice(-200) } };
      });
      return;
    case 'manage':
      set({ manage: { mcp: event.mcp, commands: event.commands, agents: event.agents } });
      return;
    case 'subagent':
      set((s) => ({
        subagentLive: event.live ? { ...s.subagentLive, [event.toolUseId]: event.items } : s.subagentLive,
        subagentView:
          s.subagentView?.toolUseId === event.toolUseId ? { toolUseId: event.toolUseId, items: event.items } : s.subagentView,
      }));
      return;
    case 'task_output':
      set({ taskOutput: { taskId: event.taskId, output: event.output } });
      return;
    case 'question':
      set((s) => ({ questions: [...s.questions, event] }));
      notifyUser(tab, 'Claude heeft een vraag', tabLabel(tab));
      return;
    case 'question_cancelled':
      set((s) => ({ questions: s.questions.filter((q) => q.id !== event.id) }));
      return;
    case 'shell_result':
      set((s) => ({
        items: updateItem(s.items, event.id, (i) =>
          i.kind === 'tool'
            ? { ...i, output: event.output || '(geen output)', isError: event.exitCode !== 0, done: true }
            : i,
        ),
      }));
      return;
    case 'needs_terminal':
      // Interactief /-command: in het actieve tabblad meteen in de terminal openen, anders een melding bij het tabblad.
      if (useApp.getState().activeId === tab.id && useApp.getState().terminalAvailable) {
        const [command, ...rest] = event.command.split(/\s+/);
        openTerminal([[command, ...rest].join(' ')], event.command.startsWith('/mcp') ? refreshMcpAfterLogin : undefined);
      } else {
        set({ terminalHint: event.command });
      }
      return;
    case 'image':
      imageWaiters.get(event.id)?.(event);
      imageWaiters.delete(event.id);
      return;
    case 'pty_data':
    case 'pty_exit':
    case 'pty_started':
      ptyListeners.get(event.id)?.(event);
      return;
    case 'error':
      notify(event.message);
      return;
  }
};

const connect = (tab: Tab) => {
  if (tab.closed) {
    return;
  }
  const socket = new WebSocket(`ws://${location.host}/ws`);
  tab.socket = socket;
  socket.onopen = () => {
    tab.store.setState({ connected: true });
    const { cwd, sessionId } = tab.store.getState();
    if (cwd) {
      sendTo(tab, { type: 'open_project', cwd });
      if (sessionId) {
        sendTo(tab, { type: 'resume_session', sessionId, cwd });
      }
    }
  };
  socket.onmessage = (message) => applyEvent(tab, JSON.parse(String(message.data)) as ServerEvent);
  socket.onclose = () => {
    tab.store.setState({ connected: false });
    setTimeout(() => connect(tab), 2000);
  };
};

/** Nieuw tabblad, eventueel meteen met een project en sessie. */
export const openTab = (init: { cwd?: string; sessionId?: string | null } = {}, activate = true) => {
  const store = create<TabState>()(() => ({ ...emptyTab(), cwd: init.cwd ?? null, sessionId: init.sessionId ?? null }));
  const tab: Tab = { id: nextTabId++, store, socket: null, closed: false };
  tabs.set(tab.id, tab);
  store.subscribe(() => {
    processQueue(tab);
    scheduleSave();
  });
  useApp.setState((s) => ({
    tabIds: [...s.tabIds, tab.id],
    activeId: activate ? tab.id : s.activeId,
    pickerOpen: activate && !init.cwd ? true : s.pickerOpen,
  }));
  connect(tab);
  return tab;
};

/** Verplaatst een tabblad naar vóór (of, met after, ná) een ander tabblad. */
export const moveTab = (id: number, targetId: number, after: boolean) => {
  if (id === targetId) {
    return;
  }
  useApp.setState((s) => {
    const rest = s.tabIds.filter((t) => t !== id);
    const index = rest.indexOf(targetId) + (after ? 1 : 0);
    return { tabIds: [...rest.slice(0, index), id, ...rest.slice(index)] };
  });
};

export const activateTab = (id: number) => {
  if (tabs.has(id)) {
    tabs.get(id)?.store.setState({ unread: false });
    useApp.setState({ activeId: id, pickerOpen: !tabs.get(id)?.store.getState().cwd });
  }
};

export const closeTab = (id: number) => {
  const tab = tabs.get(id);
  if (!tab) {
    return;
  }
  tab.closed = true;
  tab.socket?.close();
  tabs.delete(id);
  const { tabIds, activeId } = useApp.getState();
  const index = tabIds.indexOf(id);
  const rest = tabIds.filter((t) => t !== id);
  if (rest.length === 0) {
    useApp.setState({ tabIds: rest });
    openTab();
    return;
  }
  useApp.setState({ tabIds: rest, activeId: activeId === id ? rest[Math.max(0, index - 1)] : activeId });
  if (activeId === id) {
    activateTab(useApp.getState().activeId);
  }
  scheduleSave();
};

const isEmpty = (tab: Tab) => tab.store.getState().items.length === 0;

/** Opent een project: in het actieve tabblad als dat leeg is, anders in een nieuw tabblad. */
export const openProject = (cwd: string) => {
  const tab = activeTab();
  if (isEmpty(tab)) {
    sendTo(tab, { type: 'open_project', cwd });
  } else {
    openTab({ cwd });
  }
  useApp.setState({ pickerOpen: false });
};

/** Opent een sessie: springt naar het tabblad als hij al open is, anders zoals bij openProject. */
export const openSession = (session: SessionSummary) => {
  for (const tab of tabs.values()) {
    if (tab.store.getState().sessionId === session.sessionId) {
      activateTab(tab.id);
      return;
    }
  }
  const tab = activeTab();
  if (isEmpty(tab) && !tab.store.getState().running) {
    sendTo(tab, { type: 'resume_session', sessionId: session.sessionId, cwd: session.cwd });
  } else {
    openTab({ cwd: session.cwd, sessionId: session.sessionId });
  }
};

/** Nieuwe chat in hetzelfde project als het actieve tabblad. */
export const newSessionTab = () => {
  const tab = activeTab();
  const { cwd, running } = tab.store.getState();
  if (isEmpty(tab) && !running) {
    sendTo(tab, { type: 'new_session' });
    tab.store.setState({ ...resetConversation, queue: [] });
    return;
  }
  openTab(cwd ? { cwd } : {});
};

const restoreTabs = (first: Tab, saved: SavedTabs) => {
  const [head, ...others] = saved.tabs;
  if (!head) {
    return;
  }
  first.store.setState({ cwd: head.cwd, sessionId: head.sessionId });
  sendTo(first, { type: 'open_project', cwd: head.cwd });
  if (head.sessionId) {
    sendTo(first, { type: 'resume_session', sessionId: head.sessionId, cwd: head.cwd });
  }
  const created = others.map((t) => openTab({ cwd: t.cwd, sessionId: t.sessionId }, false));
  const all = [first, ...created];
  useApp.setState({ activeId: (all[saved.active] ?? first).id, pickerOpen: false });
};

let saveTimer: ReturnType<typeof setTimeout> | undefined;
const scheduleSave = () => {
  if (!restored) {
    return;
  }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const { tabIds, activeId } = useApp.getState();
    const open = tabIds.flatMap((id) => {
      const state = tabs.get(id)?.store.getState();
      return state?.cwd ? [{ id, cwd: state.cwd, sessionId: state.sessionId }] : [];
    });
    const active = Math.max(0, open.findIndex((t) => t.id === activeId));
    send({ type: 'save_tabs', tabs: open.map(({ cwd, sessionId }) => ({ cwd, sessionId })), active });
  }, 500);
};
useApp.subscribe(scheduleSave);
