import { app, BrowserWindow, globalShortcut, ipcMain, Tray, Menu, nativeImage } from 'electron';
import path from 'path';
import fs from 'fs';

// Import modular components
import { createLogger } from './lib/logger';
import { loadConfig, saveConfig } from './lib/config';

const log = createLogger('Main');
import { setupClipboardHandlers } from './lib/clipboard';
import { initWhisper, cleanupTempFiles, setWhisperWindow } from './lib/whisper';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
// eslint-disable-next-line @typescript-eslint/no-require-imports
if (require('electron-squirrel-startup')) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

// Set the app naming as early as possible
if (process.platform === 'darwin') {
  app.setName('Hush');
}

const createWindow = () => {
  // Icon is set in package.json for build, but here for dev
  const iconPath = path.join(__dirname, '../public/icon.png');

  // Set Dock Icon (macOS)
  if (process.platform === 'darwin') {
    if (fs.existsSync(iconPath)) {
      try {
        app.dock?.setIcon(iconPath);
      } catch (err) {
        log.error('Critical: Failed to set dock icon', err);
      }
    } else {
      log.info('No icon found', { path: iconPath });
    }
  }

  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    title: 'Hush',
    icon: iconPath,
    frame: false,
    titleBarStyle: undefined,
    trafficLightPosition: undefined,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    center: false,
    alwaysOnTop: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      backgroundThrottling: false,
    },
    show: false,
  });

  // Setup module window references
  setupClipboardHandlers(mainWindow);
  setWhisperWindow(mainWindow);

  const DEV_PORT = 34567;

  // In dev, always try to load the local vite server
  if (process.env.VITE_DEV_SERVER_URL) {
    log.info('Loading URL', { url: process.env.VITE_DEV_SERVER_URL });
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist-react/index.html'));
  }

  // Graceful showing
  mainWindow.once('ready-to-show', () => {
    if (mainWindow) {
      mainWindow.show();
    }
  });

  // DEBUG: Log renderer errors
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    log.error('Renderer failed to load', { errorCode, errorDescription });
    if (errorCode === -102) {
      setTimeout(() => {
        log.info('Reloading window');
        mainWindow?.loadURL(`http://localhost:${DEV_PORT}`);
      }, 1000);
    }
  });

  mainWindow.webContents.on('render-process-gone', (event, details) => {
    log.error('Renderer process gone', { reason: details.reason });
  });

  // Tray Setup
  const trayIconPath = path.join(__dirname, '../public/tray-icon.png');
  const trayIcon = nativeImage.createFromPath(trayIconPath).resize({ width: 22, height: 22 });
  trayIcon.setTemplateImage(false);

  tray = new Tray(trayIcon);
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show Hush', click: () => mainWindow?.show() },
    { label: 'Settings', click: () => mainWindow?.webContents.send('open-settings') },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
  tray.setToolTip('Hush');
  tray.setContextMenu(contextMenu);
  tray.setTitle('');
};

// Tray title handler
ipcMain.handle('set-tray-title', (event, title) => {
  if (tray) {
    tray.setTitle(title);
  }
});

// Renderer log handler
ipcMain.on('renderer-log', (event, message) => {
  log.info('[RENDERER]', { message });
});

// Config IPC handlers
ipcMain.handle('get-config', () => {
  return loadConfig();
});

ipcMain.handle('save-config', (event, newConfig) => {
  return saveConfig(newConfig);
});

// App lifecycle
app.whenReady().then(() => {
  // Explicitly show dock to prevent SetApplicationIsDaemon errors
  if (process.platform === 'darwin') {
    app.dock?.show();
  }

  // Initialize whisper and cleanup temp files
  cleanupTempFiles();
  initWhisper();

  createWindow();

  // Register global shortcut
  log.info("Registering global shortcut: Command+'");
  const ret = globalShortcut.register("Command+'", () => {
    log.info('Global shortcut triggered');
    if (mainWindow) {
      if (!mainWindow.isVisible()) {
        log.info('Showing window');
        mainWindow.show();
        mainWindow.webContents.focus();
      }
      log.info('Sending toggle-recording event');
      mainWindow.webContents.send('toggle-recording');
    }
  });

  if (!ret) {
    log.error('Global shortcut registration failed');
  } else {
    log.info('Global shortcut registered successfully');
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow) {
      mainWindow.show();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
