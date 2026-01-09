# Changelog

## [2.0.0] - 2026-01-09

### Privacy-First Intelligence
Hush has moved to a completely **local, offline architecture**. 

- **Local Inference**: All speech-to-text processing is now done on your device using `whisper.cpp`.
- **Zero Data Transfer**: Your voice data never leaves your computer. No more Cloudflare processing.
- **Offline Support**: Hush now works perfectly without an internet connection.
- **Improved Latency**: Transcription is now instant on Apple Silicon devices.

### Added
- **Model Selection**: You can now choose between `Base` (Fastest, Default), `Small` (Balanced), and `Large Turbo` (Max Accuracy) models.
    - *Note: Models will be downloaded on first selection.*

### Removed
- **Cloudflare Integration**: Removed all dependencies on Cloudflare Workers AI.
- **API Keys**: You no longer need to configure API keys or secrets.
