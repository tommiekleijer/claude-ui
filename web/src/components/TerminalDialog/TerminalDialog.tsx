import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { Maximize2, Minimize2, Plus, SquareTerminal, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import {
  activateTerminal,
  closeTerminal,
  onPty,
  openShell,
  sendToTab,
  previewDockWidth,
  setDockWidth,
  setTerminalMinimized,
  setTerminalTitle,
  TerminalInfo,
  useApp,
} from '../../store';
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

/** Eén terminal; blijft gemount (en draaien) als je naar een andere terminal of chat wisselt. */
const TerminalView = ({ terminal, active }: { terminal: TerminalInfo; active: boolean }) => {
  const ref = useRef<HTMLDivElement>(null);
  const fitRef = useRef<() => void>(() => undefined);

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
    const resize = new ResizeObserver(() => {
      clearTimeout(settle);
      settle = setTimeout(refit, 120);
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
    };
  }, [terminal.id]);

  useEffect(() => {
    if (active) {
      requestAnimationFrame(() => fitRef.current());
    }
  }, [active]);

  return <div ref={ref} className={active ? styles.terminal : `${styles.terminal} ${styles.hidden}`} />;
};

/**
 * Terminalpaneel: shells en de echte Claude Code (interactieve /-commands, MCP-inloggen) als tabjes.
 * Groot in beeld of ingeklapt als sleepbaar paneel rechts naast de chat.
 */
const TerminalDialog = () => {
  const terminals = useApp((s) => s.terminals);
  const activeTerminal = useApp((s) => s.activeTerminal);
  const minimized = useApp((s) => s.terminalMinimized);

  if (terminals.length === 0) {
    return null;
  }

  return (
    <div className={minimized ? styles.dock : styles.backdrop}>
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
            let frame = 0;
            const move = (e: PointerEvent) => {
              cancelAnimationFrame(frame);
              frame = requestAnimationFrame(() => previewDockWidth(window.innerWidth - e.clientX));
            };
            const up = (e: PointerEvent) => {
              cancelAnimationFrame(frame);
              handle.removeEventListener('pointermove', move);
              handle.removeEventListener('pointerup', up);
              setDockWidth(window.innerWidth - e.clientX);
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
          <Icoonknop
            maat={32}
            aria-label={minimized ? 'Groot maken' : 'Inklappen naar rechts'}
            title={minimized ? 'Groot maken' : 'Inklappen naar rechts'}
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
