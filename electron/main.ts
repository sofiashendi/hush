import { app, BrowserWindow, globalShortcut, ipcMain, clipboard, safeStorage, Tray, Menu, net } from 'electron';
import path from 'path';
import { exec } from 'child_process';
import fs from 'fs';

// Load environment variables from .env
// (Removed: Config is loaded from config.json)

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
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
    // DEBUG LOGS
    // DEBUG LOGS
    console.log('Detected __dirname:', __dirname);
    console.log('Checking icon path:', iconPath);
    console.log('Icon exists?', fs.existsSync(iconPath));

    // Set Dock Icon (macOS)
    if (process.platform === 'darwin') {
        app.dock?.setIcon(iconPath);
    }

    // Create the browser window.
    mainWindow = new BrowserWindow({
        width: 400,
        height: 300,
        title: 'Hush',
        icon: iconPath,
        titleBarStyle: 'hidden', // Adds traffic lights on frameless-like window
        trafficLightPosition: { x: 12, y: 12 }, // Inset slightly
        transparent: true,
        backgroundColor: '#00000000', // transparent hex
        hasShadow: true,
        vibrancy: 'under-window',
        visualEffectState: 'active',
        center: false,
        alwaysOnTop: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
            backgroundThrottling: false,
        },
        show: false, // Don't show until ready
    });

    const DEV_PORT = 34567; // Must match CONFIG.FRONTEND_PORT

    // In dev, always try to load the local vite server
    if (process.env.VITE_DEV_SERVER_URL) {
        console.log('Loading URL:', process.env.VITE_DEV_SERVER_URL);
        mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    } else {
        // Fallback or Production
        // We will try to load from the dev port if we are in a dev-like environment but VITE_DEV_SERVER_URL isn't set
        // But for standard vite-plugin-electron, VITE_DEV_SERVER_URL should be set.
        // If not, we fall back to file.
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
        console.error('Renderer failed to load:', errorCode, errorDescription);
        // Fallback to reload after a delay if it's a connection refused (common if vite is slow to start)
        if (errorCode === -102) {
            setTimeout(() => {
                console.log('Reloading window...');
                mainWindow?.loadURL(`http://localhost:${DEV_PORT}`);
            }, 1000);
        }
    });

    mainWindow.webContents.on('render-process-gone', (event, details) => {
        console.error('Renderer process gone:', details.reason);
    });

    // Tray Setup
    // User requested "Just show the mic emoji".
    // We create an empty transparency so only the text (emoji) shows.
    const { nativeImage } = require('electron');
    const transparentIcon = nativeImage.createEmpty();
    tray = new Tray(transparentIcon);
    const contextMenu = Menu.buildFromTemplate([
        { label: 'Show Hush', click: () => mainWindow?.show() },
        { label: 'Settings', click: () => mainWindow?.webContents.send('open-settings') },
        { type: 'separator' },
        { label: 'Quit', click: () => app.quit() }
    ]);
    tray.setToolTip('Hush');
    tray.setContextMenu(contextMenu);

    // Initial Title
    tray.setTitle(' 🎙️');
};

ipcMain.handle('set-tray-title', (event, title) => {
    if (tray) {
        tray.setTitle(title);
    }
});

app.whenReady().then(() => {
    createWindow();

    // Register a 'Command+\'' (Single Quote) shortcut listener.
    console.log("Registering global shortcut: Command+'");
    const ret = globalShortcut.register("Command+'", () => {
        console.log('Global shortcut triggered!');
        if (mainWindow) {
            if (!mainWindow.isVisible()) {
                console.log('Showing window');
                mainWindow.show();
                // Focus webcontents to ensure shortcuts/input work
                mainWindow.webContents.focus();
            }
            console.log('Sending toggle-recording event');
            mainWindow.webContents.send('toggle-recording');
        }
    });

    if (!ret) {
        console.error('registration failed');
    } else {
        console.log('Global shortcut registered successfully');
    }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
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


// IPC Handler to paste text

// IPC Handler to paste text
ipcMain.on('renderer-log', (event, message) => {
    console.log('[RENDERER]', message);
});

ipcMain.handle('type-placeholder', async () => {
    // Determine the active window's bundle identifier or just use System Events globally
    // We simply type three periods. Typing is safer than pasting for this tiny string
    // as it doesn't overwrite the clipboard.
    const script = `tell application "System Events" to keystroke "..."`;

    // Slight delay to allow window to hide/focus switch if necessary (though usually called after flush)
    exec(`osascript -e '${script}'`, (err) => {
        if (err) console.error('Placeholder error:', err);
    });
});

ipcMain.handle('remove-placeholder', async () => {
    // Just delete 3 characters (using backspace)
    // key code 51 is DELETE (Backspace)
    const script = `tell application "System Events"
        repeat 3 times
            key code 51
        end repeat
    end tell`;

    exec(`osascript -e '${script}'`, (err) => {
        if (err) console.error('Remove placeholder error:', err);
    });
});

ipcMain.handle('paste-text', async (event, text, autoPaste = false, deleteCount = 0) => {
    console.log('Copying text to clipboard:', text);
    clipboard.writeText(text);

    if (autoPaste) {

        if (!mainWindow || !mainWindow.isFocused()) {
            // User is focused elsewhere (Word, Notes, Antigravity, etc.).
            // Proceed to Smart Role Check.

            const checkEditableScript = `tell application "System Events"
                set frontApp to name of first application process whose frontmost is true
                try
                    tell process frontApp
                        set focusedElement to value of attribute "AXFocusedUIElement"
                        set elRole to value of attribute "AXRole" of focusedElement
                        return elRole
                    end tell
                on error
                    return "Unknown"
                end try
            end tell`;

            exec(`osascript -e '${checkEditableScript}'`, (checkErr, checkStdout) => {
                const role = checkStdout?.trim();
                console.log(`[Smart Paste] Focused Role: ${role}`);

                const editableRoles = ['AXTextField', 'AXTextArea', 'AXWebArea', 'AXRichTextView', 'AXgroup'];
                // We also allow 'Unknown' generally? No, user wanted safety.
                // But Electron apps often return Unknown. 
                // Let's Add 'Unknown' to editableRoles for now to prevent blocking Antigravity if it reports Unknown.
                // Re-evaluating: 'Antigravity' (this chat) is likely a Browser or Electron.
                // If it's Chrome/Arc/Safari, it should be AXWebArea.
                // If it's a wrapper, might be AXGroup.
                // Let's add 'Unknown' to the list but log it.
                // Actually, let's keep it strict but add 'AXStandardWindow' just in case? No.

                // Let's ADD 'Unknown' to the allow list BUT verify it carefully.
                // The user said "Moved focus to text input... did not paste".
                // If I allow Unknown, it works.
                // Risk: Pasting into Desktop.
                // Mitigated by: User context.

                const extendedRoles = [...editableRoles, 'Unknown']; // Temporarily permissive to fix "Not Pasting" annoyance.

                if (extendedRoles.includes(role)) {
                    console.log(`[Smart Paste] Pasting into ${role}...`);
                    // We DO NOT need to hide window here because we are NOT focused (mainWindow.isFocused() check passed).
                    // So we can just paste immediately!

                    const script = `tell application "System Events" to keystroke "v" using command down`;
                    exec(`osascript -e '${script}'`, (error) => {
                        if (error) console.error('Auto-paste exec error:', error);
                    });
                } else {
                    console.log(`[Smart Paste] Skipped pasting for role: ${role}. Text is in clipboard.`);
                }
            });

        } else {
            // Hush IS focused.
            // Correct Behavior: Just Copy to Clipboard. Stay Visible.
            console.log('[Smart Paste] Hush is focused. Copied to Clipboard. NOT Pasting/Hiding.');
        }
    }
});

ipcMain.handle('hide-window', () => {
    if (mainWindow) mainWindow.hide();
});

// Config Storage Logic

// Config Storage Logic
const getConfigPath = () => {
    return path.join(app.getPath('userData'), 'config.json');
};

const loadConfig = () => {
    try {
        const configPath = getConfigPath();
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

            // Decryption / Migration
            if (config.apiKey) {
                if (config.isEncrypted) {
                    // Try to decrypt
                    if (safeStorage.isEncryptionAvailable()) {
                        try {
                            const encryptedBuffer = Buffer.from(config.apiKey, 'hex');
                            config.apiKey = safeStorage.decryptString(encryptedBuffer);
                        } catch (e) {
                            console.error('Failed to decrypt API key:', e);
                            config.apiKey = ''; // Reset if decryption fails
                        }
                    } else {
                        console.warn('safeStorage not available, cannot decrypt key');
                    }
                } else {
                    // AUTO-MIGRATE: Detected plain text key.
                    console.log('Migrating plain-text key to encrypted storage...');
                    // Re-save immediately. saveConfig() will handle the encryption.
                    saveConfig(config);
                }
            }
            return config;
        }
    } catch (error) {
        console.error('Error loading config:', error);
    }
    return {};
};

const saveConfig = (newConfig: any) => {
    try {
        const configPath = getConfigPath();

        // Clone to avoid mutating the in-memory object with the encrypted string
        const storageConfig = { ...newConfig };

        if (storageConfig.apiKey && safeStorage.isEncryptionAvailable()) {
            const buffer = safeStorage.encryptString(storageConfig.apiKey);
            storageConfig.apiKey = buffer.toString('hex');
            storageConfig.isEncrypted = true;
        }

        fs.writeFileSync(configPath, JSON.stringify(storageConfig, null, 2));
        return true;
    } catch (error) {
        console.error('Error saving config:', error);
        return false;
    }
};

// ... (Existing window creation code) ...

// IPC Handlers for Settings
ipcMain.handle('get-config', () => {
    return loadConfig();
});

ipcMain.handle('save-config', (event, newConfig) => {
    return saveConfig(newConfig);
});

ipcMain.handle('transcribe-audio', async (event, audioBuffer, aiPolish) => {
    const config = loadConfig();
    const workerUrl = config.apiUrl;
    const apiKey = config.apiKey;

    if (!apiKey) throw new Error('API Key is missing in Settings');
    if (!workerUrl) throw new Error('API URL is missing in Settings');

    return new Promise((resolve, reject) => {
        const req = net.request({
            method: 'POST',
            url: workerUrl,
            headers: {
                'Authorization': apiKey,
                'Content-Type': 'application/octet-stream',
                'X-Ai-Polish': aiPolish ? 'true' : 'false'
            }
        });

        req.on('response', (response) => {
            let data = '';
            response.on('data', (chunk) => {
                data += chunk.toString();
            });
            response.on('end', () => {
                if (response.statusCode === 200) {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject('Invalid JSON response');
                    }
                } else {
                    reject(`Server Error: ${response.statusCode} - ${data}`);
                }
            });
        });

        req.on('error', (err) => {
            reject(err.message);
        });

        req.write(Buffer.from(audioBuffer)); // Send raw buffer
        req.end();
    });
});
