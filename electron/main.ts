import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeTheme, Notification, shell } from 'electron';
import { ChildProcess, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupUpdates } from './updates.js';

// De app-bestanden zelf (preload, icoon); bij een geïnstalleerde app zitten die in de bundel.
const bundleDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const isWindows = process.platform === 'win32';
const windowsAcrylic = isWindows && Number(os.release().split('.')[2]) >= 22621;
const isMac = process.platform === 'darwin';
const IMAGE_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_TEXT_BYTES = 1024 * 1024;
const MAX_FILE_BYTES = 100 * 1024 * 1024;

let backend: ChildProcess | null = null;

// De backend draait lokaal (Linux, macOS) of in WSL (Windows), via de login-shell zodat Claude's tools dezelfde
// PATH en omgeving krijgen als in de terminal. PORT=0 laat hem zelf een vrije poort kiezen.
const backendEnv = 'PORT=0 CLAUDE_UI_PARENT=1';

// Optioneel claude-ui.json naast het programma, voor een installatie vanuit de broncode (install.sh):
// Windows { "wslDir", "distro" }, macOS { "appDir" } (de map met de repo, waar de backend staat).
// Zonder dat bestand draait een geïnstalleerde app zijn eigen meegeleverde backend.
const packagedConfig = (): { wslDir?: string; distro?: string; appDir?: string } => {
  try {
    return JSON.parse(readFileSync(path.join(path.dirname(process.execPath), 'claude-ui.json'), 'utf8'));
  } catch {
    return {};
  }
};

const spawnBackend = () => {
  const config = packagedConfig();
  if (isWindows) {
    // Geïnstalleerde app: de Linux-bundel (Node + backend) in resources/linux-backend, gestart via wslpath.
    const bundled = app.isPackaged && !config.wslDir;
    const start = bundled
      ? `cd "$(wslpath -u "${path.join(process.resourcesPath, 'linux-backend').replace(/\\/g, '/')}")" && exec env ${backendEnv} ./node dist/server/index.js`
      : `cd ${config.wslDir ?? '~/GitHub/claude-ui'} && exec env ${backendEnv} node dist/server/index.js`;
    const inner = `exec "$(getent passwd "$(id -un)" | cut -d: -f7)" -lic '${start}'`;
    return spawn('wsl.exe', [...(config.distro ? ['-d', config.distro] : []), '-e', 'sh', '-c', inner], { windowsHide: true });
  }
  const shellPath = process.env.SHELL || (isMac ? '/bin/zsh' : '/bin/bash');
  // Geïnstalleerde app: Electrons eigen Node (ELECTRON_RUN_AS_NODE) draait de meegeleverde backend; geen Node nodig op de computer.
  const command =
    app.isPackaged && !config.appDir
      ? `cd "${bundleDir}" && exec env ${backendEnv} ELECTRON_RUN_AS_NODE=1 "${process.execPath}" dist/server/index.js`
      : `cd "${config.appDir ?? bundleDir}" && exec env ${backendEnv} node dist/server/index.js`;
  return spawn(shellPath, ['-lic', command]);
};

const startBackend = () =>
  new Promise<number>((resolve, reject) => {
    const child = spawnBackend();
    backend = child;
    let output = '';
    const timer = setTimeout(() => reject(new Error(`De backend start niet.\n\n${output.slice(-2000)}`)), 30000);
    const onData = (chunk: Buffer) => {
      output += chunk.toString();
      const match = output.match(/CLAUDE_UI_PORT=(\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`De backend is gestopt (code ${code}).\n\n${output.slice(-2000)}`));
    });
  });

// Windows-paden omzetten naar het pad dat de backend in WSL ziet.
const toBackendPath = (filePath: string) => {
  if (!isWindows) {
    return filePath;
  }
  const wslShare = filePath.match(/^\\\\wsl(?:\$|\.localhost)\\[^\\]+(\\.*)$/i);
  if (wslShare) {
    return wslShare[1].replace(/\\/g, '/');
  }
  const drive = filePath.match(/^([a-zA-Z]):\\(.*)$/);
  return drive ? `/mnt/${drive[1].toLowerCase()}/${drive[2].replace(/\\/g, '/')}` : filePath;
};

const clipboardPaths = (): string[] => {
  if (isWindows) {
    const raw = clipboard.readBuffer('FileNameW').toString('utf16le').replace(/\0+$/, '');
    return raw ? [raw] : [];
  }
  const text = isMac
    ? clipboard.read('public.file-url')
    : clipboard.read('text/uri-list') || clipboard.read('x-special/gnome-copied-files');
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('file://'))
    .map((uri) => fileURLToPath(uri));
};

const readPath = async (filePath: string) => {
  const name = path.basename(filePath);
  const info = await stat(filePath).catch(() => null);
  if (!info?.isFile()) {
    return { kind: 'path' as const, path: toBackendPath(filePath) };
  }
  const mediaType = IMAGE_TYPES[path.extname(filePath).toLowerCase()];
  if (mediaType && info.size <= MAX_IMAGE_BYTES) {
    const data = (await readFile(filePath)).toString('base64');
    return { kind: 'image' as const, name, mediaType, data, size: info.size };
  }
  if (!mediaType && info.size <= MAX_TEXT_BYTES) {
    const text = (await readFile(filePath)).toString('utf8');
    if (!text.includes('\u0000') && !text.includes('\uFFFD')) {
      return { kind: 'text' as const, name, mediaType: 'text/plain', data: text, size: info.size };
    }
  }
  if (info.size <= MAX_FILE_BYTES) {
    const data = (await readFile(filePath)).toString('base64');
    return { kind: 'file' as const, name, mediaType: 'application/octet-stream', data, size: info.size };
  }
  return { kind: 'path' as const, path: toBackendPath(filePath) };
};

ipcMain.handle('clipboard-paths', () => clipboardPaths());
// Een schermafbeelding op het klembord (geen bestand), bijvoorbeeld van de Knipprogramma of Win+Shift+S.
ipcMain.handle('clipboard-image', () => {
  const image = clipboard.readImage();
  if (image.isEmpty()) {
    return [];
  }
  const data = image.toPNG();
  return [{ kind: 'image' as const, name: `plakken-${Date.now()}.png`, mediaType: 'image/png', data: data.toString('base64'), size: data.length }];
});
ipcMain.handle('pick-folder', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const options = { title: 'Standaardmap kiezen', properties: ['openDirectory' as const] };
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
  return result.canceled || !result.filePaths[0] ? null : toBackendPath(result.filePaths[0]);
});
// Opent een bestand van de backend in de standaard-app. Op Windows staat het in WSL: via \\wsl.localhost.
const toHostPath = (filePath: string) =>
  isWindows ? `\\\\wsl.localhost\\${packagedConfig().distro || 'Ubuntu'}${filePath.replace(/\//g, '\\')}` : filePath;
ipcMain.handle('open-path', async (_event, filePath: string) => (await shell.openPath(toHostPath(filePath))) || null);
ipcMain.on('show-in-folder', (_event, filePath: string) => shell.showItemInFolder(toHostPath(filePath)));
// Verwijzing vasthouden, anders ruimt de garbage collector de melding op voordat je erop klikt.
const meldingen = new Set<Notification>();
ipcMain.on('notify', (event, { title, body, tabId }: { title: string; body: string; tabId: number }) => {
  const melding = new Notification({ title, body, icon: path.join(bundleDir, 'electron/icon.png') });
  meldingen.add(melding);
  melding.on('click', () => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) {
      win.isMinimized() && win.restore();
      win.show();
      win.focus();
      event.sender.send('focus-tab', tabId);
    }
  });
  melding.on('close', () => meldingen.delete(melding));
  melding.show();
});
ipcMain.handle('read-paths', (_event, paths: string[]) => Promise.all(paths.filter(Boolean).map(readPath)));

const createWindow = async () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 720,
    minHeight: 480,
    title: 'Claude UI',
    // Doorzichtig venster, zodat de dekking van de achtergrond in de app instelbaar is.
    // Op Windows heeft een doorzichtig venster geen titelbalk (geen vergroten, slepen of sluiten): daar een gewoon venster,
    // met acrylglas op Windows 11 (build 22621+) en anders de kleur van het thema.
    transparent: !isWindows,
    backgroundColor: !isWindows || windowsAcrylic ? '#00000000' : nativeTheme.shouldUseDarkColors ? '#1a1b1e' : '#ffffff',
    // Glas: het bureaublad achter het venster vervaagd. Alleen macOS en Windows 11 kunnen dat; Linux (GNOME) niet.
    ...(process.platform === 'darwin' ? { vibrancy: 'under-window' as const, visualEffectState: 'active' as const } : {}),
    ...(windowsAcrylic ? { backgroundMaterial: 'acrylic' as const } : {}),
    // Mac: de knoppen (sluiten, minimaliseren, vergroten) in de tabbalk, die er daarvoor ruimte voor laat.
    ...(isMac ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 18, y: 17 } } : {}),
    autoHideMenuBar: true,
    icon: path.join(bundleDir, 'electron/icon.png'),
    webPreferences: {
      preload: path.join(bundleDir, 'electron/preload.cjs'),
      contextIsolation: true,
      sandbox: true,
    },
  });

  let url = process.env.CLAUDE_UI_DEV_URL;
  if (!url) {
    try {
      url = `http://127.0.0.1:${await startBackend()}`;
    } catch (error) {
      dialog.showErrorBox('Claude Code', error instanceof Error ? error.message : String(error));
      app.quit();
      return;
    }
  }

  const origin = new URL(url).origin;
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    void shell.openExternal(target);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, target) => {
    if (new URL(target).origin !== origin) {
      event.preventDefault();
      void shell.openExternal(target);
    }
  });
  await win.loadURL(url);
};

// Dezelfde profielmap als de backend-config (~/.config/claude-ui), ongeacht de productnaam.
app.setPath('userData', path.join(app.getPath('appData'), 'claude-ui'));

// Linux (X11/XWayland) heeft deze schakelaar nodig voor doorzichtige vensters.
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('enable-transparent-visuals');
  // Een AppImage kan de SUID-sandbox niet gebruiken (en Ubuntu 24.04 blokkeert user namespaces); de app laadt alleen eigen pagina's.
  if (app.isPackaged) {
    app.commandLine.appendSwitch('no-sandbox');
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      win.isMinimized() && win.restore();
      win.focus();
    }
  });
  app.whenReady().then(() => {
    // Eigen menu zonder Ctrl+W (sluit venster) en Ctrl+R (herladen): die zouden open chats en de wachtrij wissen.
    // Ctrl+W sluit in de app het tabblad.
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        ...(isMac ? [{ role: 'appMenu' as const }] : []),
        { role: 'editMenu' as const },
        {
          label: 'Beeld',
          submenu: [
            { role: 'zoomIn' as const },
            { role: 'zoomOut' as const },
            { role: 'resetZoom' as const },
            { role: 'togglefullscreen' as const },
            { role: 'toggleDevTools' as const },
          ],
        },
      ]),
    );
    setupUpdates();
    return createWindow();
  });
  app.on('window-all-closed', () => app.quit());
  app.on('quit', () => backend?.kill());
}
