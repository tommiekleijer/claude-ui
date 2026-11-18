import type { Attachment } from '../../shared/protocol';

export type NativeFile = (Attachment & { size: number }) | { kind: 'path'; path: string };

export type UpdateState =
  | { status: 'idle' | 'checking' | 'none' | 'ready' | 'dev' }
  | { status: 'available'; version: string }
  | { status: 'downloading'; percent: number }
  | { status: 'error'; message: string };

type ClaudeUiBridge = {
  updates: {
    version: () => Promise<string>;
    state: () => Promise<UpdateState>;
    check: () => Promise<void>;
    /** Downloadt de update (macOS: opent de downloadpagina). */
    install: () => Promise<void>;
    restart: () => Promise<void>;
    onState: (callback: (state: UpdateState) => void) => void;
  };
  platform: string;
  readClipboardFiles: () => Promise<NativeFile[]>;
  readDroppedFiles: (files: File[]) => Promise<NativeFile[]>;
  pickFolder: (title?: string) => Promise<string | null>;
  /** Opent een bestand in de standaard-app; geeft een foutmelding terug of null. */
  openPath: (path: string) => Promise<string | null>;
  /** Toont het bestand in bestandsbeheer (verkenner). */
  showInFolder: (path: string) => void;
  /** Systeemmelding; een klik erop haalt het venster naar voren en roept de onFocusTab-callback aan. */
  notify: (title: string, body: string, tabId: number) => void;
  onFocusTab: (callback: (tabId: number) => void) => void;
};

/** Alleen aanwezig in de Electron-app (zie electron/preload.cjs). */
export const native = (window as unknown as { claudeUi?: ClaudeUiBridge }).claudeUi;
