import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { ArrowLeftRight, ClipboardPaste, Copy, Maximize2, Minimize2, Plus, SquareTerminal, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { native } from '../../native';
import {
  activateTerminal,
  closeTerminal,
  focusComposer,
  focusTerminal,
  isTerminalKey,
  onPty,
  openShell,
  sendToTab,
  previewDockWidth,
  setDockWidth,
  setTerminalMinimized,
  setTerminalTitle,
  TerminalInfo,
  toggleDockSide,
  useApp,
} from '../../store';
import { matchesShortcut } from '../../shortcuts';
import { Icoonknop } from '../../vertex';
import styles from './TerminalDialog.module.scss';

// xterm kent geen CSS-variabelen: de kleuren komen uit de Vertex-tokens en worden bij wisselen van licht/donker opnieuw gezet.
const xtermThema = () => {
  const css = getComputedStyle(document.documentElement);
  const k = (naam: string) => css.getPropertyValue(naam).trim();
  return {
    background: k('--hoogte-1-vlak'),
    foreground: k('--tekst-hoofd'),
    cursor: k('--accent-standaard'),
    cursorAccent: k('--hoogte-1-vlak'),
    selectionBackground: k('--accent-zacht'),
    black: k('--tekst-gedempt'),
    brightBlack: k('--tekst-vaag'),
    red: k('--status-negatief'),
    brightRed: k('--categorie-koraal'),
    green: k('--status-positief'),
    brightGreen: k('--categorie-mint'),
    yellow: k('--categorie-zon-tekst'),
    brightYellow: k('--categorie-zon'),
    blue: k('--categorie-lucht-tekst'),
    brightBlue: k('--categorie-lucht'),
    magenta: k('--accent-standaard'),
    brightMagenta: k('--accent-vlak'),
    cyan: k('--categorie-mint-tekst'),
    brightCyan: k('--categorie-mint'),
    white: k('--tekst-gedempt'),
    brightWhite: k('--tekst-hoofd'),
  };
};

// Tijdens het slepen van de breedte niet passend maken: elke pty_resize laat de shell (of Claude Code) het hele scherm hertekenen.
let dragging = false;

/** Eén terminal; blijft gemount (en draaien) als je naar een andere terminal of chat wisselt. */
const TerminalView = ({ terminal, active }: { terminal: TerminalInfo; active: boolean }) => {
  const ref = useRef<HTMLDivElement>(null);
  const fitRef = useRef<() => void>(() => undefined);
  const xtermRef = useRef<Terminal | null>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; selectie: boolean } | null>(null);

  // xterm tekent de selectie zelf, dus de standaard kopieeractie van browser/Electron ziet hem niet.
  const kopieer = () => {
    const xterm = xtermRef.current;
    if (xterm?.hasSelection()) {
      void navigator.clipboard.writeText(xterm.getSelection());
      xterm.clearSelection();
    }
  };
  const plak = async () => xtermRef.current?.paste(await navigator.clipboard.readText());

  useEffect(() => {
    if (!ref.current) {
      return undefined;
    }
    const css = getComputedStyle(document.documentElement);
    const xterm = new Terminal({
      fontFamily: css.getPropertyValue('--font-mono'),
      fontSize: 13,
      cursorBlink: true,
      allowProposedApi: true,
      theme: xtermThema(),
    });
    const donker = window.matchMedia('(prefers-color-scheme: dark)');
    const wisselThema = () => {
      xterm.options.theme = xtermThema();
    };
    donker.addEventListener('change', wisselThema);
    window.addEventListener('thema', wisselThema);
    const fit = new FitAddon();
    xterm.loadAddon(fit);
    xterm.open(ref.current);
    xtermRef.current = xterm;
    const mac = native?.platform === 'darwin';
    // Kopiëren: Cmd+C op macOS, elders Ctrl+Shift+C of Ctrl+C met selectie (zonder selectie blijft Ctrl+C een interrupt).
    xterm.attachCustomKeyEventHandler((event) => {
      // De wisseltoets is voor de app, niet voor de shell.
      if (matchesShortcut(event, 'toggleFocus')) {
        return false;
      }
      // Esc sluit dan alleen het contextmenu (via de keydown-listener op window) en gaat niet naar de shell.
      if (event.key === 'Escape' && menuRef.current) {
        return false;
      }
      if (event.type !== 'keydown' || event.altKey) {
        return true;
      }
      const toets = event.key.toLowerCase();
      const mod = mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
      const kopieren = mod && toets === 'c' && (mac || event.shiftKey || xterm.hasSelection());
      const plakken = mod && toets === 'v' && (mac || event.shiftKey);
      if (!kopieren && !plakken) {
        return true;
      }
      // Anders plakt Chromium/Electron er via het paste-event nog een keer overheen.
      event.preventDefault();
      if (kopieren) {
        kopieer();
      } else {
        void plak();
      }
      return false;
    });
    const send = (event: Parameters<typeof sendToTab>[1]) => sendToTab(terminal.tabId, event);
    const refit = () => {
      if (ref.current?.offsetParent) {
        fit.fit();
        send({ type: 'pty_resize', id: terminal.id, cols: xterm.cols, rows: xterm.rows });
      }
    };
    fitRef.current = () => {
      refit();
      xterm.focus();
    };
    fit.fit();
    const off = onPty(terminal.id, (event) => {
      if (event.type === 'pty_data') {
        xterm.write(event.data);
      } else if (event.type === 'pty_started' && event.command) {
        setTerminalTitle(terminal.id, event.command);
      } else if (event.type === 'pty_exit') {
        xterm.write('\r\n\x1b[2m[gestopt — sluit dit tabje met ×]\x1b[0m\r\n');
      }
    });
    const input = xterm.onData((data) => send({ type: 'pty_input', id: terminal.id, data }));
    // Pas passend maken (en de shell laten hertekenen) als het formaat even stilstaat, niet bij elk frame.
    let settle: ReturnType<typeof setTimeout> | undefined;
    const settled = () => {
      if (dragging) {
        settle = setTimeout(settled, 120);
      } else {
        refit();
      }
    };
    const resize = new ResizeObserver(() => {
      clearTimeout(settle);
      settle = setTimeout(settled, 120);
    });
    resize.observe(ref.current);
    send({ type: 'pty_start', id: terminal.id, args: terminal.args, shell: terminal.shell, cols: xterm.cols, rows: xterm.rows });
    xterm.focus();
    return () => {
      donker.removeEventListener('change', wisselThema);
      window.removeEventListener('thema', wisselThema);
      off();
      input.dispose();
      clearTimeout(settle);
      resize.disconnect();
      xterm.dispose();
      xtermRef.current = null;
    };
  }, [terminal.id]);

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!menu || !el?.parentElement) {
      return;
    }
    el.style.left = `${Math.max(0, Math.min(menu.x, el.parentElement.clientWidth - el.offsetWidth))}px`;
    el.style.top = `${Math.max(0, Math.min(menu.y, el.parentElement.clientHeight - el.offsetHeight))}px`;
  }, [menu]);

  useEffect(() => {
    if (!menu) {
      return undefined;
    }
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !menuRef.current?.contains(event.target as Node)) {
        setMenu(null);
      }
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', close);
    };
  }, [menu]);

  const kies = (actie: () => void) => {
    setMenu(null);
    actie();
    xtermRef.current?.focus();
  };

  useEffect(() => {
    if (!active) {
      return undefined;
    }
    requestAnimationFrame(() => fitRef.current());
    const focus = () => fitRef.current();
    window.addEventListener('terminal-focus', focus);
    return () => window.removeEventListener('terminal-focus', focus);
  }, [active]);

  return (
    <>
      <div
        ref={ref}
        className={active ? styles.terminal : `${styles.terminal} ${styles.hidden}`}
        onContextMenu={(event) => {
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          setMenu({ x: event.clientX - rect.left, y: event.clientY - rect.top, selectie: Boolean(xtermRef.current?.hasSelection()) });
        }}
      />
      {menu && (
        <ul ref={menuRef} className={styles.menu} role="menu">
          <li>
            <button type="button" role="menuitem" className={styles.menuItem} disabled={!menu.selectie} onClick={() => kies(kopieer)}>
              <Copy size={14} />
              Kopiëren
            </button>
          </li>
          <li>
            <button type="button" role="menuitem" className={styles.menuItem} onClick={() => kies(() => void plak())}>
              <ClipboardPaste size={14} />
              Plakken
            </button>
          </li>
        </ul>
      )}
    </>
  );
};

/**
 * Terminalpaneel: shells en de echte Claude Code (interactieve /-commands, MCP-inloggen) als tabjes.
 * Groot in beeld of ingeklapt als sleepbaar paneel links of rechts naast de chat.
 */
const TerminalDialog = () => {
  const terminals = useApp((s) => s.terminals);
  const activeTerminal = useApp((s) => s.activeTerminal);
  const minimized = useApp((s) => s.terminalMinimized);
  const left = useApp((s) => s.dockSide === 'left');

  // Wisselt de focus tussen het invoerveld en de actieve terminal; zonder terminal opent hij er een.
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (!matchesShortcut(event, 'toggleFocus')) {
        return;
      }
      event.preventDefault();
      if (isTerminalKey(event)) {
        // Groot in beeld bedekt de terminal de chat.
        setTerminalMinimized(true);
        focusComposer();
      } else if (useApp.getState().terminals.length === 0) {
        openShell();
      } else {
        focusTerminal();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  if (terminals.length === 0) {
    return null;
  }

  return (
    <div className={minimized ? (left ? `${styles.dock} ${styles.dockLeft}` : styles.dock) : styles.backdrop}>
      {minimized && (
        <div
          className={styles.resizer}
          role="separator"
          aria-orientation="vertical"
          aria-label="Breedte van de terminal"
          onPointerDown={(event) => {
            event.preventDefault();
            const handle = event.currentTarget;
            handle.setPointerCapture(event.pointerId);
            dragging = true;
            const start = handle.parentElement!.getBoundingClientRect().left;
            const width = (e: PointerEvent) => (left ? e.clientX - start : window.innerWidth - e.clientX);
            let frame = 0;
            const move = (e: PointerEvent) => {
              cancelAnimationFrame(frame);
              frame = requestAnimationFrame(() => previewDockWidth(width(e)));
            };
            const up = (e: PointerEvent) => {
              cancelAnimationFrame(frame);
              handle.removeEventListener('pointermove', move);
              handle.removeEventListener('pointerup', up);
              dragging = false;
              setDockWidth(width(e));
            };
            handle.addEventListener('pointermove', move);
            handle.addEventListener('pointerup', up);
          }}
        />
      )}
      <div className={styles.window} role={minimized ? 'complementary' : 'dialog'} aria-label="Terminal">
        <div className={styles.header}>
          <div className={styles.tabs} role="tablist">
            {terminals.map((t) => (
              <div
                key={t.id}
                role="tab"
                aria-selected={t.id === activeTerminal}
                className={t.id === activeTerminal ? `${styles.tab} ${styles.tabActive}` : styles.tab}
                onClick={() => activateTerminal(t.id)}
                onAuxClick={(event) => event.button === 1 && closeTerminal(t.id)}
                title={t.title}
              >
                <SquareTerminal size={14} />
                <span className={styles.tabTitle}>{t.title}</span>
                <button
                  type="button"
                  className={styles.tabClose}
                  aria-label="Terminal sluiten"
                  onClick={(event) => {
                    event.stopPropagation();
                    closeTerminal(t.id);
                  }}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
          <Icoonknop maat={32} stijl="getint" aria-label="Nieuwe terminal" title="Nieuwe terminal" onClick={openShell}>
            <Plus size={16} />
          </Icoonknop>
          {minimized && (
            <Icoonknop
              maat={32}
              aria-label={left ? 'Terminal naar rechts' : 'Terminal naar links'}
              title={left ? 'Terminal naar rechts' : 'Terminal naar links'}
              onClick={toggleDockSide}
            >
              <ArrowLeftRight size={14} />
            </Icoonknop>
          )}
          <Icoonknop
            maat={32}
            aria-label={minimized ? 'Groot maken' : left ? 'Inklappen naar links' : 'Inklappen naar rechts'}
            title={minimized ? 'Groot maken' : left ? 'Inklappen naar links' : 'Inklappen naar rechts'}
            onClick={() => setTerminalMinimized(!minimized)}
          >
            {minimized ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
          </Icoonknop>
        </div>
        <div className={styles.views}>
          {terminals.map((t) => (
            <TerminalView key={t.id} terminal={t} active={t.id === activeTerminal} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default TerminalDialog;
