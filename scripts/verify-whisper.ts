
import path from 'path';
import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import os from 'os';
import { Whisper } from 'smart-whisper';

// Setup ffmpeg
if (ffmpegPath) {
    ffmpeg.setFfmpegPath(ffmpegPath);
}

const RESOURCES_PATH = path.join(__dirname, '../resources');
const MODEL_PATH = path.join(RESOURCES_PATH, 'ggml-base.en.bin');

async function runTest() {
    console.log("=== HUSH BACKEND VERIFICATION (Float32 w/ Params) ===");

    // 1. Check Model
    if (!fs.existsSync(MODEL_PATH)) {
        console.error("FAIL: Model not found at", MODEL_PATH);
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

    // 3. Create Dummy Audio (WebM)
    const tempInput = path.join(os.tmpdir(), `test-input-${Date.now()}.webm`);
    const tempPcm = path.join(os.tmpdir(), `test-output-${Date.now()}.pcm`);

    try {
        await new Promise<void>((resolve, reject) => {
            ffmpeg()
                .input('anullsrc')
                .inputFormat('lavfi')
                .duration(2)
                .audioCodec('libvorbis')
                .save(tempInput)
                .on('end', () => resolve())
                .on('error', reject);
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
            ffmpeg(tempInput)
                .toFormat('f32le')
                .audioFrequency(16000)
                .audioChannels(1)
                .on('end', () => resolve())
                .on('error', reject)
                .save(tempPcm);
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
