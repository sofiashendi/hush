import path from 'path';
import fs from 'fs';
import os from 'os';
import { spawn } from 'child_process';
import { randomBytes } from 'crypto';
import { app, ipcMain, BrowserWindow } from 'electron';
import ffmpegPathImport from 'ffmpeg-static';

// Fix Metal shader path for packaged app BEFORE importing smart-whisper
// The GGML_METAL_PATH_RESOURCES environment variable tells whisper.cpp where to find ggml-metal.metal
if (app.isPackaged) {
    try {
        // Resolve path to smart-whisper to avoid hardcoding directory structure
        const smartWhisperPackageJsonPath = require.resolve('smart-whisper/package.json');
        const smartWhisperDirInAsar = path.dirname(smartWhisperPackageJsonPath);
        const smartWhisperDirUnpacked = smartWhisperDirInAsar.replace('app.asar', 'app.asar.unpacked');

        const metalShaderPath = path.join(
            smartWhisperDirUnpacked,
            'whisper.cpp',
            'ggml',
            'src'
        );

        if (fs.existsSync(path.join(metalShaderPath, 'ggml-metal.metal'))) {
            process.env.GGML_METAL_PATH_RESOURCES = metalShaderPath;
            console.log('[Metal] Set shader path:', metalShaderPath);
        } else {
            console.warn('[Metal] Shader file not found at:', metalShaderPath);
        }
    } catch (e) {
        console.warn('[Metal] Could not resolve smart-whisper path for Metal shader.', e);
    }
}

import { Whisper } from 'smart-whisper';
import { modelManager, ModelType } from './models';
import { loadConfig, saveConfig } from './config';

// Type for Whisper transcription result segments
interface WhisperSegment {
    text: string;
    start?: number;
    end?: number;
}

// Resolve ffmpeg binary path
// Note: ffmpeg-static path needs special handling in Electron dev/prod environments
let resolvedFfmpegPath = ffmpegPathImport || 'ffmpeg';

if (ffmpegPathImport) {
    if (app.isPackaged) {
        // In production (packaged), ffmpeg is in app.asar.unpacked
        const unpackedPath = ffmpegPathImport.replace('app.asar', 'app.asar.unpacked');
        console.log(`[FFMPEG] Packaged mode. Original path: ${ffmpegPathImport}`);
        console.log(`[FFMPEG] Trying unpacked path: ${unpackedPath}`);

        if (fs.existsSync(unpackedPath)) {
            resolvedFfmpegPath = unpackedPath;
            console.log(`[FFMPEG] Found at unpacked path: ${resolvedFfmpegPath}`);
        } else {
            console.error(`[FFMPEG] CRITICAL: Could not find ffmpeg binary in packaged app!`);
            console.error(`[FFMPEG] Tried: ${unpackedPath}`);
            resolvedFfmpegPath = 'ffmpeg'; // System fallback (unlikely to work in sandboxed app)
        }
    } else {
        // In Development, the bundled path might be wrong.
        // We verify the existence and fall back to known locations.
        if (!fs.existsSync(resolvedFfmpegPath)) {
            console.warn(`[FFMPEG] Default path not found: ${resolvedFfmpegPath}. Searching alternatives...`);

            // Use require.resolve to programmatically find the ffmpeg-static package
            try {
                const ffmpegStaticPkgPath = require.resolve('ffmpeg-static/package.json');
                const ffmpegStaticDir = path.dirname(ffmpegStaticPkgPath);
                const candidate = path.join(ffmpegStaticDir, 'ffmpeg');
                if (fs.existsSync(candidate)) {
                    console.log(`[FFMPEG] Found executable via require.resolve: ${candidate}`);
                    resolvedFfmpegPath = candidate;
                }
            } catch (e) {
                console.warn('[FFMPEG] require.resolve failed:', e);
            }
        }
    }

    if (fs.existsSync(resolvedFfmpegPath)) {
        console.log('[FFMPEG] Path resolved to:', resolvedFfmpegPath);
    } else {
        console.error(`[FFMPEG] CRITICAL: Could not find ffmpeg binary! Falling back to system ffmpeg.`);
        resolvedFfmpegPath = 'ffmpeg'; // System fallback
    }
}

// Store reference to main window for sending events
let mainWindow: BrowserWindow | null = null;
let whisperInstance: Whisper | null = null;

/**
 * Set the main window reference for sending IPC events
 */
export function setWhisperWindow(window: BrowserWindow) {
    mainWindow = window;
}

/**
 * Initialize Whisper with the configured model
 */
export const initWhisper = async () => {
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
                whisperInstance = null;
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

/**
 * Cleanup orphaned temp files from previous sessions
 */
export const cleanupTempFiles = async () => {
    try {
        const tmpDir = os.tmpdir();
        const files = await fs.promises.readdir(tmpDir);
        const hushFiles = files.filter(
            file => file.startsWith('hush-input-') || file.startsWith('hush-output-')
        );

        if (hushFiles.length === 0) return;

        const results = await Promise.allSettled(
            hushFiles.map(file => fs.promises.unlink(path.join(tmpDir, file)))
        );

        const count = results.filter(r => r.status === 'fulfilled').length;
        if (count > 0) console.log(`[Cleanup] Removed ${count} temporary files.`);
    } catch (err) {
        console.error('[Cleanup] Failed to clean temp files:', err);
    }
};

// IPC handler to check if model is ready
ipcMain.handle('is-model-ready', () => {
    return whisperInstance !== null;
});

// Switch model handler
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

// Transcribe audio handler
ipcMain.handle('transcribe-audio', async (event, audioBuffer) => {
    console.log(`[Whisper] Transcribing ${audioBuffer.byteLength} bytes...`);

    if (!whisperInstance) {
        console.warn('[Whisper] Instance not ready, attempting re-init...');
        await initWhisper();
        if (!whisperInstance) {
            throw new Error("Transcription engine could not be initialized. Please check logs for details.");
        }
    }

    // Create temp files for conversion (use timestamp + random to prevent collisions)
    const uniqueId = `${Date.now()}-${randomBytes(4).toString('hex')}`;
    const tempInput = path.join(os.tmpdir(), `hush-input-${uniqueId}.webm`);
    const tempPcm = path.join(os.tmpdir(), `hush-output-${uniqueId}.pcm`);

    // Helper to cleanup temp files (async to avoid blocking main process)
    const cleanupTranscriptionFiles = async () => {
        try {
            await Promise.allSettled([
                fs.promises.rm(tempInput, { force: true }),
                fs.promises.rm(tempPcm, { force: true })
            ]);
        } catch (e) {
            console.error("Temp cleanup error:", e);
        }
    };

    try {
        // Write input buffer to temp file
        await fs.promises.writeFile(tempInput, Buffer.from(audioBuffer));

        // Convert to 16kHz mono raw float32 PCM using ffmpeg
        await new Promise<void>((resolve, reject) => {
            const ffmpegProcess = spawn(resolvedFfmpegPath, [
                '-i', tempInput,
                '-f', 'f32le',      // Output format: 32-bit float little-endian
                '-ar', '16000',     // Sample rate: 16kHz (required by Whisper)
                '-ac', '1',         // Channels: mono
                '-y',               // Overwrite output file
                tempPcm
            ]);

            let stderr = '';
            ffmpegProcess.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            ffmpegProcess.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`));
                }
            });

            ffmpegProcess.on('error', (err) => reject(err));
        });

        // Read raw PCM file
        const pcmBuffer = await fs.promises.readFile(tempPcm);
        const float32Data = new Float32Array(pcmBuffer.buffer, pcmBuffer.byteOffset, pcmBuffer.length / 4);

        console.log(`[Whisper] PCM converted. Samples: ${float32Data.length}`);

        // Transcribe the PCM data
        const task = await whisperInstance.transcribe(float32Data, { language: 'auto' });
        const result = await task.result;

        let text = "";
        if (Array.isArray(result)) {
            text = (result as WhisperSegment[]).map(r => r.text).join(" ").trim();
        } else {
            text = (result as any)?.text?.trim() || "";
        }

        console.log(`[Whisper] Result: "${text}"`);

        const HALLUCINATION_PATTERNS = [
            /^\s*\.+\s*$/,                          // Only periods/whitespace
            /^[\u3000-\u9FAF\uFF00-\uFFEF\s]+$/,    // Only CJK/fullwidth chars
            /^\s*\[.*\]\s*$/,                       // Filters out [MUSIC], [APPLAUSE], etc.
            /^\s*Connect specific.*\s*$/            // Common Whisper hallucination
        ];

        if (HALLUCINATION_PATTERNS.some(p => p.test(text))) {
            console.log('[Whisper] Filtered hallucination');
            return { text: "" };
        }

        return { text };
    } catch (error) {
        console.error('[Whisper] Transcription error:', error);
        throw error;
    } finally {
        // Always cleanup temp files
        await cleanupTranscriptionFiles();
    }
});
