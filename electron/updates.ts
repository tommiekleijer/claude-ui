import { app, BrowserWindow, ipcMain, shell } from 'electron';
import electronUpdater from 'electron-updater';

const { autoUpdater } = electronUpdater;

const RELEASES_URL = 'https://github.com/tommiekleijer/claude-ui/releases/latest';

export type UpdateState =
  | { status: 'idle' | 'checking' | 'none' | 'ready' | 'dev' }
  | { status: 'available'; version: string }
  | { status: 'downloading'; percent: number }
  | { status: 'error'; message: string };

let state: UpdateState = { status: app.isPackaged ? 'idle' : 'dev' };

const publish = (next: UpdateState) => {
  state = next;
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('update-state', state);
  }
};

// macOS-updates vragen een ondertekende app; die hebben we niet, dus daar openen we de downloadpagina.
const canInstallInApp = process.platform !== 'darwin';

const check = async () => {
  if (!app.isPackaged) {
    return;
  }
  publish({ status: 'checking' });
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    publish({ status: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};

export const setupUpdates = () => {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.on('update-available', (info) => publish({ status: 'available', version: info.version }));
  autoUpdater.on('update-not-available', () => publish({ status: 'none' }));
  autoUpdater.on('download-progress', (progress) => publish({ status: 'downloading', percent: Math.round(progress.percent) }));
  autoUpdater.on('update-downloaded', () => publish({ status: 'ready' }));
  autoUpdater.on('error', (error) => publish({ status: 'error', message: error.message }));

  ipcMain.handle('app-version', () => app.getVersion());
  ipcMain.handle('update-state', () => state);
  ipcMain.handle('update-check', check);
  ipcMain.handle('update-install', async () => {
    if (!canInstallInApp) {
      await shell.openExternal(RELEASES_URL);
      return;
    }
    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      publish({ status: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  });
  ipcMain.handle('update-restart', () => autoUpdater.quitAndInstall());

  // Stil controleren kort na het opstarten en daarna elk kwartier; de gebruiker beslist zelf over installeren.
  // Staat er al een update klaar of loopt de download, dan niet opnieuw zoeken (dat zou de knop terugzetten).
  if (app.isPackaged) {
    const quietCheck = () => {
      if (state.status !== 'available' && state.status !== 'downloading' && state.status !== 'ready') {
        void check();
      }
    };
    setTimeout(quietCheck, 10_000);
    setInterval(quietCheck, 15 * 60_000);
  }
};
