# Hush

A sleek, native-feeling macOS application that captures speech, converts it to text using **Local Intelligence (Whisper.cpp)**, and copies it to your clipboard for instant pasting.

Created by Sofia Shendi
https://sofiashendi.com

<img width="1394" height="881" alt="Idle State" src="https://github.com/user-attachments/assets/d5104a6c-92b7-4b79-b956-d50b6d22fa57" />

## Features
- **Global Shortcut**: Press `Cmd + '` (Single Quote) to toggle the recorder from anywhere.
- **Native UI**: Draggable, transparent, and non-intrusive design.
- **Private & Offline**: Uses local `whisper.cpp` inference. No audio ever leaves your device. Works without internet.
- **Instant Speed**: Optimized for Apple Silicon (Metal) for sub-second transcription.
- **Continuous Flow**: Speak, pause, and watch it paste. The mic stays open so you can keep dictating.
- **Auto-Paste**: Automatically types your text into the active window (requires Accessibility permission).

## Models
Hush will automatically download the **Base** model on first launch, which is fast and accurate for general dictation.
You can optionally download **Small** or **Large Turbo** models in the settings for higher accuracy.

## Prerequisites
- **macOS**: 12+ (Apple Silicon recommended for best performance).
- **Node.js**: v18+ installed (for development).
- **Permissions**: The app needs **Microphone** access to hear you, and **Accessibility** access to Auto-Paste text.

## Build & Install

Since this app is not notarized by Apple, you must build it yourself for local usage:

1.  **Clone the repo**
    ```bash
    git clone https://github.com/sofiashendi/hush.git
    cd hush
    ```

2.  **Install Dependencies**
    ```bash
    npm install
    ```

3.  **Build the App**
    ```bash
    npm run dist
    ```
    The `.dmg` installer will be in the `dist/` folder.
    *Note: On first launch, the app will download the base model (~60MB), which may take a moment.*

4.  **Install & Open**
    -   Open the `.dmg` and drag the app to Applications.
    -   **First launch:** Right-click → Open → Click "Open" in the dialog.
    -   Grant **Microphone** and **Accessibility** permissions when prompted.

## Development

To run in development mode with hot reload:

```bash
npm run dev
```

*Note: If "Auto-Paste" fails, go to **System Settings > Privacy & Security > Accessibility** and ensure Hush is allowed.*

## Usage (Continuous Mode)
1.  **Focus**: Click on the text field where you want to type (e.g., Notion, Words, VS Code).
2.  **Toggle**: Press `Cmd + '`.
3.  **Speak**: Say your sentence clearly.
4.  **Pause**: Stop speaking for ~1.5 seconds.
5.  **Watch**: The app will automatically transcribe and paste your text.
6.  **Repeat**: Keep speaking the next sentence.
7.  **Stop**: Press `Cmd + '` again when done.

## Technical Decisions

### Why Local whisper.cpp Over Cloud APIs

1. **Privacy First**: Audio never leaves the device. No data collection, no cloud processing, no API keys to manage.
2. **Offline Capability**: Works without internet after initial model download. Perfect for air-gapped environments or travel.
3. **Zero Latency Variability**: No network round-trips. Transcription time is consistent and predictable.
4. **Cost**: No per-minute API charges. One-time model download, unlimited usage.

Trade-off: Requires ~60-550MB model download and uses local GPU/CPU resources.

### Voice Activity Detection (VAD) Architecture

The app uses a custom VAD implementation with three volume thresholds:

| Threshold | Value | Purpose |
|-----------|-------|---------|
| `LOW_VOLUME_THRESHOLD` | 3.0 | Minimum RMS to process audio (filters silence) |
| `SILENCE_THRESHOLD` | 5.0 | Below this = silence detected |
| `SPEAKING_THRESHOLD` | 8.0 | Above this = active speech |

**Flow:**
1. Audio analyzed via `requestAnimationFrame` loop (60fps)
2. RMS calculated from `AnalyserNode` frequency data
3. When RMS drops below silence threshold for >1 second after speech, segment is flushed
4. Transcription runs while recording continues (no audio gaps)

This approach enables "continuous dictation" - speak, pause, watch it paste, speak again - without restarting.

### Transcription Queue Pattern

```typescript
transcriptionQueueRef.current = transcriptionQueueRef.current.then(async () => {
  await processAudio(blob, isSegment, sessionMaxVolume);
});
```

**Problem Solved**: Multiple VAD-triggered segments could race, causing out-of-order transcription.

**Solution**: Promise chain ensures segments are processed sequentially while recording continues in parallel.

### Why Metal GPU Acceleration

whisper.cpp supports Apple Metal for M1/M2/M3 GPU inference. Benefits:
- 5-10x faster than CPU-only
- Lower power consumption
- Keeps CPU free for other tasks

The app dynamically resolves Metal shader paths for both development and packaged builds.

### Hallucination Filtering

Whisper occasionally generates phantom text on silence. Common patterns filtered:
- CJK characters (when speaking English)
- Repetitive words ("the the the")
- Bracketed annotations ("[MUSIC]", "[APPLAUSE]")
- Known hallucination phrases

Filtering happens client-side before clipboard paste.
