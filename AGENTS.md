This file provides guidance to agents when working with code in this repository.

## Build Commands

```bash
npm run dev      # Development with hot reload (kills port 34567, runs Vite + Electron)
npm run build    # Build React to dist-react/ and Electron to dist-electron/
npm run dist     # Build + package as macOS DMG (output in dist/)
```

## Architecture

Hush is a macOS Electron app for local speech-to-text using whisper.cpp. Audio never leaves the device.

### Process Architecture

**Main Process** (`electron/main.ts`):
- Window management (transparent, frameless, always-on-top optional)
- Global shortcut registration (`Cmd + '`)
- System tray with context menu
- IPC bridge to renderer

**Renderer** (`src/`):
- React 19 with Vite, Motion for animations
- Captures audio via MediaRecorder API (100ms timeslice)
- Voice Activity Detection (VAD) for continuous dictation
- Communicates via `window.electronAPI` (exposed through preload)

**Electron Lib** (`electron/lib/`):
- `whisper.ts`: Whisper.cpp integration via smart-whisper, model download/switching, ffmpeg conversion
- `clipboard.ts`: Clipboard write and auto-paste via AppleScript
- `models.ts`: Model management (base, small, large-turbo)
- `config.ts`: User config persistence

### Data Flow

1. User triggers recording (click or `Cmd + '`)
2. Renderer captures audio chunks, runs VAD to detect speech pauses
3. On pause detection or manual stop, audio blob sent to main process via IPC
4. Main process converts webm → PCM (ffmpeg), transcribes with whisper.cpp
5. Result filtered for hallucinations, returned to renderer
6. Text pasted to clipboard and optionally auto-typed into active app

### Key Hooks

- `useRecording`: Core recording/VAD/transcription logic
- `useModelStatus`: Tracks whisper model loading/download progress
- `useConfig`: User preferences (auto-paste toggle, model selection)

## Development Notes

- **Port**: Vite dev server runs on 34567
- **Metal GPU**: In packaged builds, `GGML_METAL_PATH_RESOURCES` must point to shader files
- **asar unpacking**: ffmpeg-static and smart-whisper are unpacked for native binary access
- **Permissions required**: Microphone (recording), Accessibility (auto-paste)

## Testing

```bash
npx vitest           # Run all tests
npx vitest run       # Run once (CI mode)
```

Test files are in `tests/`.
