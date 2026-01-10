import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import os from 'os';
import { Whisper } from 'smart-whisper';

// Models are now downloaded to user data directory, not bundled in resources
const USER_DATA_PATH = path.join(os.homedir(), 'Library/Application Support/hush/models');
const MODEL_PATH = path.join(USER_DATA_PATH, 'ggml-base-q5_1.bin');

// Resolve ffmpeg path
const resolvedFfmpegPath = ffmpegPath || 'ffmpeg';

async function runTest() {
    console.log("=== HUSH BACKEND VERIFICATION (Float32 w/ Params) ===");

    // 1. Check Model
    if (!fs.existsSync(MODEL_PATH)) {
        console.error("FAIL: Model not found at", MODEL_PATH);
        console.log("Please run the app first to download the model.");
        process.exit(1);
    }

    // 2. Init Whisper
    let whisper: Whisper;
    try {
        whisper = new Whisper(MODEL_PATH, { gpu: false });
        console.log("PASS: Whisper initialized");
    } catch (e) {
        console.error("FAIL: Whisper init failed", e);
        process.exit(1);
    }

    // 3. Create Dummy Audio (silent 2-second WebM)
    const tempInput = path.join(os.tmpdir(), `test-input-${Date.now()}.webm`);
    const tempPcm = path.join(os.tmpdir(), `test-output-${Date.now()}.pcm`);

    try {
        await new Promise<void>((resolve, reject) => {
            const proc = spawn(resolvedFfmpegPath, [
                '-f', 'lavfi',
                '-i', 'anullsrc=r=44100:cl=mono',
                '-t', '2',
                '-c:a', 'libvorbis',
                '-y',
                tempInput
            ]);
            proc.on('close', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`)));
            proc.on('error', reject);
        });
        console.log("PASS: Test audio created");
    } catch (e) {
        console.error("FAIL: Creating dummy audio failed", e);
        process.exit(1);
    }

    // 4. Convert to Raw Float32
    console.log("Converting to Raw Float32 PCM (16kHz, Mono)...");
    try {
        await new Promise<void>((resolve, reject) => {
            const proc = spawn(resolvedFfmpegPath, [
                '-i', tempInput,
                '-f', 'f32le',
                '-ar', '16000',
                '-ac', '1',
                '-y',
                tempPcm
            ]);
            proc.on('close', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`)));
            proc.on('error', reject);
        });
        console.log(`PASS: Conversion successful. File: ${tempPcm}`);
    } catch (e) {
        console.error("FAIL: Conversion failed", e);
        process.exit(1);
    }

    // 5. Test Transcription
    console.log("Testing Transcription (Float32Array + Params)...");
    try {
        const pcmBuffer = fs.readFileSync(tempPcm);
        const float32 = new Float32Array(pcmBuffer.buffer, pcmBuffer.byteOffset, pcmBuffer.length / 4);
        console.log(`PCM Samples: ${float32.length}`);

        // Pass TypedArray AND Params
        const task = await whisper.transcribe(float32, { language: 'en' });
        const result = await task.result;
        console.log("PASS: Transcription result:", result);
    } catch (e) {
        console.error("FAIL: Transcription failed", e);
        process.exit(1);
    }

    // Cleanup
    try {
        await whisper.free();
        if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput);
        if (fs.existsSync(tempPcm)) fs.unlinkSync(tempPcm);
    } catch (e) { }

    console.log("=== ALL TESTS PASSED ===");
}

runTest();
