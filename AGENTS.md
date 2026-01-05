# Engineering Guide (AGENTS.md)

This document provides technical context for AI Agents working on this codebase. It complements the `README.md` by focusing on architecture and internals.

## Architecture
The application follows a **Client-Serverless** model:

1.  **Renderer (React/Vite)**:
    -   Handles UI state (`idle`, `recording`, `processing`).
    -   Captures audio via `MediaRecorder` API with 100ms timeslice.
    -   Implements Voice Activity Detection (VAD) for continuous dictation.
    -   Communicates with Main Process via `window.electronAPI`.
2.  **Main Process (Electron)**:
    -   Manages the `BrowserWindow` (transparent, native controls).
    -   Registers global shortcuts (`Command+'`).
    -   **Proxy**: Acts as a secure proxy for API requests to avoid CORS issues in the renderer.
    -   **Clipboard**: Writes text to system clipboard.
3.  **Backend (Cloudflare Worker)**:
    -   **Type**: Cloudflare Worker (Edge Compute).
    -   **Hosted at**: `https://listen.sofia-shendi.workers.dev` (or your deployment).
    -   **Input**: Accepts `POST` requests with `application/octet-stream` (Raw Audio).
    -   **Authentication**: Authenticates via `Authorization` header against `WORKER_API_KEY`.
    -   **AI Model**: `@cf/openai/whisper-large-v3-turbo` - Fast, accurate speech-to-text (~$0.0005/min).
    -   **Features**: Uses `vad_filter` and `initial_prompt` for reduced hallucinations.
    -   **Security**: Audio is streamed directly to Cloudflare; no intermediate storage. Keys stored locally.

## Key Files
-   `electron/main.ts`: Entry point. Handles window creation, IPC handlers (`transcribe-audio`, `paste-text`), and global shortcuts.
-   `src/App.tsx`: Main UI logic. Handles audio recording stream and state management.
-   `src/index.css`: Critical for the "Transparent Widget" look. Uses `backdrop-filter` and `-webkit-app-region: drag`.

## Development Notes
-   **Ports**: Vite runs on **34567**.
-   **Security**: API Key is loaded from `config.json` (encrypted via Electron's `safeStorage`) in Main Process. content-security-policy is strict in `index.html`.
-   **Windowing**: The window is configured with `titleBarStyle: 'hidden'` and `trafficLightPosition` to mimic native macOS panels.
