import { app, BrowserWindow, globalShortcut, ipcMain, clipboard, safeStorage, Tray, Menu, nativeImage } from 'electron';
import path from 'path';
import { exec } from 'child_process';
import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import os from 'os';
import { randomBytes } from 'crypto';
import { Whisper } from 'smart-whisper';
import { modelManager, ModelType } from './models';

// Configure ffmpeg path
if (ffmpegPath) {
    let validPath = ffmpegPath;

    // In production (packaged), ffmpeg is in app.asar.unpacked
    if (app.isPackaged) {
        validPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
    } else {
        // In Development, the bundled path might be wrong.
        // We verify the existence and fall back to known locations.
        if (!fs.existsSync(validPath)) {
            console.warn(`[FFMPEG] Default path not found: ${validPath}. Searching alternatives...`);

            const candidates = [
                // If getAppPath points to root or dist
                path.join(app.getAppPath(), 'node_modules/ffmpeg-static/ffmpeg'),
                // If CWD is root (npm run dev usually is)
                path.join(process.cwd(), 'node_modules/ffmpeg-static/ffmpeg'),
                // Relative to bundled file location
                path.join(__dirname, '../node_modules/ffmpeg-static/ffmpeg'),
                path.join(__dirname, '../../node_modules/ffmpeg-static/ffmpeg')
            ];

            for (const candidate of candidates) {
                if (fs.existsSync(candidate)) {
                    console.log(`[FFMPEG] Found executable at: ${candidate}`);
                    validPath = candidate;
                    break;
                }
            }
        }
    }

    if (fs.existsSync(validPath)) {
        console.log('[FFMPEG] Final Path set to:', validPath);
        ffmpeg.setFfmpegPath(validPath);
    } else {
        console.error(`[FFMPEG] CRITICAL: Could not find ffmpeg binary! Searched: ${validPath}`);
        // Attempt system fallback
        ffmpeg.setFfmpegPath('ffmpeg');
    }
}

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

    // Set Dock Icon (macOS)
    if (process.platform === 'darwin') {
        if (fs.existsSync(iconPath)) {
            try {
                app.dock?.setIcon(iconPath);
            } catch (err) {
                console.error("Critical: Failed to set dock icon", err);
            }
        } else {
            console.log("No icon found at", iconPath);
        }
    }

    // Create the browser window.
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        title: 'Hush',
        icon: iconPath,
        frame: false,
        titleBarStyle: undefined, // Remove traffic lights
        trafficLightPosition: undefined,
        transparent: true,
        backgroundColor: '#00000000', // transparent hex
        hasShadow: false, // Let React handle shadows
        // vibrancy: 'under-window', // REMOVED: This causes the gray box
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
    const trayIconPath = path.join(__dirname, '../public/tray-icon.png');
    // Resize to 22x22 for standard macOS menu bar size
    const trayIcon = nativeImage.createFromPath(trayIconPath).resize({ width: 22, height: 22 });
    // setTemplateImage(true) makes it monochrome (black/white) adapting to system theme.
    // If the user wants the colorful icon, we should set this to FALSE.
    // The user said "Menu bar icon is still an ugly mic emoji".
    // They provided a colored icon. Let's try FALSE first to show the user's icon as-is, or TRUE if they want it to blend.
    // Given the "ios" icon is colorful, using it as a Template might look weird (just a black square).
    // I will set it to FALSE to render the colored image, but resized.
    trayIcon.setTemplateImage(false);

    tray = new Tray(trayIcon);
    const contextMenu = Menu.buildFromTemplate([
        { label: 'Show Hush', click: () => mainWindow?.show() },
        { label: 'Settings', click: () => mainWindow?.webContents.send('open-settings') },
        { type: 'separator' },
        { label: 'Quit', click: () => app.quit() }
    ]);
    tray.setToolTip('Hush');
    tray.setContextMenu(contextMenu);

    // Initial Title (Empty)
    tray.setTitle('');
};

ipcMain.handle('set-tray-title', (event, title) => {
    if (tray) {
        tray.setTitle(title);
    }
});

app.whenReady().then(() => {
    // Explicitly show dock to prevent SetApplicationIsDaemon errors
    if (process.platform === 'darwin') {
        app.dock?.show();
    }

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
                // Not Pasting fix for unknowns:
                const extendedRoles = [...editableRoles, 'Unknown'];

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

// IPC Handlers for Settings
ipcMain.handle('get-config', () => {
    return loadConfig();
});

ipcMain.handle('save-config', (event, newConfig) => {
    return saveConfig(newConfig);
});

let whisperInstance: Whisper | null = null;

// Initialize with Base model by default
const initWhisper = async () => {
    try {
        const config = loadConfig();
        const modelType = (config.model || 'base') as ModelType;
        console.log(`[Whisper] Loading model preference: ${modelType}`);

        let modelPath = modelManager.getModelPath(modelType);

        // If preferred model not found, try to download it
        if (!modelPath) {
            console.log(`[Whisper] Model ${modelType} not found. Downloading...`);
            try {
                modelPath = await modelManager.downloadModel(modelType, (percent) => {
                    console.log(`[Whisper] Download progress: ${percent}%`);
                    // Send to renderer if window exists
                    if (mainWindow) {
                        mainWindow.webContents.send('download-progress', percent);
                    }
                });
                console.log(`[Whisper] Download complete: ${modelPath}`);
            } catch (downloadErr) {
                console.error(`[Whisper] Failed to download model:`, downloadErr);
                if (mainWindow) {
                    mainWindow.webContents.send('model-error', 'Failed to download AI model. Check your internet connection and try again.');
                }
                return;
            }
        }

        if (modelPath) {
            console.log(`[Whisper] Initializing with model: ${modelPath}`);
            // Free previous instance if exists
            if (whisperInstance) {
                await whisperInstance.free();
            }
            whisperInstance = new Whisper(modelPath, { gpu: true });
            console.log('[Whisper] Ready.');

            // Notify renderer that model is ready
            if (mainWindow) {
                mainWindow.webContents.send('model-ready');
            }
        } else {
            console.error('[Whisper] Model not found and download failed!');
            if (mainWindow) {
                mainWindow.webContents.send('model-error', 'Model not found. Please restart the app.');
            }
        }
    } catch (err) {
        console.error('[Whisper] Initialization failed:', err);
        if (mainWindow) {
            mainWindow.webContents.send('model-error', 'Failed to initialize transcription engine.');
        }
    }
};

// IPC handler to check if model is ready
ipcMain.handle('is-model-ready', () => {
    return whisperInstance !== null;
});

// Initial init
const cleanupTempFiles = () => {
    try {
        const tmpDir = os.tmpdir();
        const files = fs.readdirSync(tmpDir);
        let count = 0;
        files.forEach(file => {
            if (file.startsWith('hush-input-') || file.startsWith('hush-output-')) {
                const filePath = path.join(tmpDir, file);
                // Optional: Check age to avoid deleting currently active files if duplicate instances?
                // But generally safe on startup.
                try {
                    fs.unlinkSync(filePath);
                    count++;
                } catch (e) {
                    // ignore locked files
                }
            }
        });
        if (count > 0) console.log(`[Cleanup] Removed ${count} temporary files.`);
    } catch (err) {
        console.error('[Cleanup] Failed to clean temp files:', err);
    }
};

app.whenReady().then(() => {
    cleanupTempFiles();
    initWhisper();
});

ipcMain.handle('switch-model', async (event, modelType: ModelType) => {
    // 1. Check if model exists
    let modelPath = modelManager.getModelPath(modelType);

    if (!modelPath) {
        console.log(`[Whisper] Model ${modelType} not found. Downloading...`);
        // Notify renderer that download started (0%)
        event.sender.send('download-progress', 0);

        try {
            modelPath = await modelManager.downloadModel(modelType, (percent) => {
                event.sender.send('download-progress', percent);
            });
            console.log(`[Whisper] Download complete: ${modelPath}`);
            event.sender.send('download-progress', 100); // Ensure 100% is sent
        } catch (error) {
            console.error(`[Whisper] Download failed:`, error);
            throw error;
        }
    }

    console.log(`[Whisper] Switching to ${modelType}...`);

    // Create new instance
    try {
        // Free old instance
        if (whisperInstance) {
            await whisperInstance.free();
            whisperInstance = null; // Safety clear
        }

        // Small delay to ensure memory is freed? Not usually needed but good practice.
        // await new Promise(r => setTimeout(r, 100));

        whisperInstance = new Whisper(modelPath, { gpu: true });
        console.log(`[Whisper] Switched to ${modelType}`);

        // Persist choice to config
        const config = loadConfig();
        config.model = modelType;
        saveConfig(config);

        return true;
    } catch (error) {
        console.error(`[Whisper] Failed to switch model:`, error);
        throw error;
    }
});

ipcMain.handle('transcribe-audio', async (event, audioBuffer) => {
    console.log(`[Whisper] Transcribing ${audioBuffer.byteLength} bytes...`);

    if (!whisperInstance) {
        console.warn('[Whisper] Instance not ready, attempting re-init...');
        await initWhisper();
        if (!whisperInstance) {
            throw new Error("Whisper not initialized");
        }
    }

    // Create temp files for conversion (use timestamp + random to prevent collisions)
    const uniqueId = `${Date.now()}-${randomBytes(4).toString('hex')}`;
    const tempInput = path.join(os.tmpdir(), `hush-input-${uniqueId}.webm`);
    const tempPcm = path.join(os.tmpdir(), `hush-output-${uniqueId}.pcm`);

    // Helper to cleanup temp files
    const cleanupTranscriptionFiles = () => {
        try {
            if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput);
            if (fs.existsSync(tempPcm)) fs.unlinkSync(tempPcm);
        } catch (e) {
            console.error("Temp cleanup error:", e);
        }
    };

    try {
        // Write input buffer to temp file
        // Note: buffer coming from ipc is usually Uint8Array or Buffer
        fs.writeFileSync(tempInput, Buffer.from(audioBuffer));

        // Convert to 16kHz mono raw float32 PCM using ffmpeg
        await new Promise<void>((resolve, reject) => {
            ffmpeg(tempInput)
                .toFormat('f32le')
                .audioFrequency(16000)
                .audioChannels(1)
                .on('end', () => resolve())
                .on('error', (err) => reject(err))
                .save(tempPcm);
        });

        // Read raw PCM file
        const pcmBuffer = fs.readFileSync(tempPcm);
        const float32Data = new Float32Array(pcmBuffer.buffer, pcmBuffer.byteOffset, pcmBuffer.length / 4);

        console.log(`[Whisper] PCM converted. Samples: ${float32Data.length}`);

        // Transcribe the PCM data
        const task = await whisperInstance.transcribe(float32Data, { language: 'auto' });
        const result = await task.result;

        let text = "";
        if (Array.isArray(result)) {
            text = result.map((r: any) => r.text).join(" ").trim();
        } else {
            text = (result as any).text?.trim() || "";
        }

        console.log(`[Whisper] Result: "${text}"`);

        // Cleanup temp files (async to not block return)
        setTimeout(cleanupTranscriptionFiles, 100);

        const HALLUCINATION_PATTERNS = [
            /^\s*\.+\s*$/,
            /^[\u3000-\u9FAF\uFF00-\uFFEF\s]+$/,
            /\[.*\]/,
            /^\s*Connect specific.*\s*$/,
            /I'm a programmer/,
            /Thank you./
        ];

        if (HALLUCINATION_PATTERNS.some(p => p.test(text))) {
            console.log('[Whisper] Filtered hallucination');
            return { text: "" };
        }

        return { text };
    } catch (error) {
        console.error('[Whisper] Transcription error:', error);
        cleanupTranscriptionFiles();
        throw error;
    }
});
