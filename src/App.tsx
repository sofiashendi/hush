import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AppIcon } from './components/AppIcon';
import { MicrophoneButton } from './components/MicrophoneButton';
import { LiveTranscript } from './components/LiveTranscript';
import { SettingsPanel } from './components/SettingsPanel';
import { Settings, X } from 'lucide-react';
import { useModelStatus, useConfig, useRecording } from './hooks';
import { createLogger } from './utils/logger';

const log = createLogger('App');

export default function App() {
  // UI State
  const [isMinimized, setIsMinimized] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Hooks
  const { isModelReady, isModelReadyRef, modelDownloadProgress, modelError } = useModelStatus();
  const { autoPasteRef, loadConfig } = useConfig();
  const { status, wordCount, transcript, handleToggle } = useRecording({
    isModelReadyRef,
    autoPasteRef,
    showSettings,
  });

  // Set up toggle recording listener
  useEffect(() => {
    const removeToggleListener = window.electronAPI.onToggleRecording(() => {
      handleToggle();
    });

    return () => {
      removeToggleListener();
    };
  }, [handleToggle]);

  log.debug('Render', { status, transcriptLength: transcript.length });

  return (
    <div className="min-h-screen bg-transparent flex items-center justify-center p-4">
      <AnimatePresence mode="wait">
        {!isModelReady ? (
          // Model loading/downloading screen
          <motion.div
            key="loading"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="relative w-full max-w-md"
          >
            <div className="backdrop-blur-3xl bg-black/80 rounded-3xl border border-white/10 shadow-2xl overflow-hidden p-8">
              {/* Background glow */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <motion.div
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full blur-3xl"
                  style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' }}
                  animate={{
                    scale: [1, 1.2, 1],
                    opacity: [0.2, 0.3, 0.2],
                  }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                />
              </div>

              {/* Content */}
              <div className="relative z-10 text-center space-y-6">
                {/* App Icon */}
                <div className="w-16 h-16 mx-auto">
                  <AppIcon />
                </div>

                {/* Title */}
                <div>
                  <h1 className="text-white/90 text-xl font-medium mb-1">Hush</h1>
                  <p className={`text-sm ${modelError ? 'text-red-400' : 'text-white/50'}`}>
                    {modelError
                      ? modelError
                      : modelDownloadProgress >= 0
                        ? 'Downloading AI model...'
                        : 'Initializing transcription engine...'}
                  </p>
                </div>

                {/* Error state */}
                {modelError && (
                  <div className="space-y-3">
                    <div className="w-12 h-12 mx-auto rounded-full bg-red-500/20 flex items-center justify-center">
                      <X className="w-6 h-6 text-red-400" />
                    </div>
                    <button
                      onClick={() => window.location.reload()}
                      className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-white/80 text-sm"
                    >
                      Try Again
                    </button>
                  </div>
                )}

                {/* Progress bar (only when downloading) */}
                {!modelError && modelDownloadProgress >= 0 && (
                  <div className="space-y-2">
                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)' }}
                        initial={{ width: 0 }}
                        animate={{ width: `${modelDownloadProgress}%` }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>
                    <p className="text-white/60 text-sm font-medium">{modelDownloadProgress}%</p>
                  </div>
                )}

                {/* Loading spinner (when not downloading and no error) */}
                {!modelError && modelDownloadProgress < 0 && (
                  <motion.div
                    className="w-8 h-8 mx-auto border-2 border-white/20 border-t-blue-500 rounded-full"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  />
                )}

                {/* Tip */}
                {!modelError && (
                  <p className="text-white/30 text-xs">
                    {modelDownloadProgress >= 0
                      ? "First-time setup only. This won't happen again."
                      : 'This usually takes a few seconds.'}
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        ) : showSettings ? (
          <SettingsPanel
            key="settings"
            onClose={() => {
              setShowSettings(false);
              loadConfig();
            }}
          />
        ) : !isMinimized ? (
          <motion.div
            key="full"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="relative w-full max-w-2xl"
          >
            <div
              className={`relative backdrop-blur-3xl bg-black/80 rounded-3xl border border-white/10 shadow-2xl overflow-hidden transition-colors ${status === 'error' ? 'border-red-500/50' : ''}`}
            >
              {/* Background */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <motion.div
                  className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full blur-3xl"
                  style={{ background: '#0A84FF' }}
                  initial={{ opacity: 0.1, scale: 1 }}
                  animate={{
                    scale: status === 'recording' ? [1, 1.2, 1] : 1,
                    opacity: status === 'recording' ? [0.2, 0.3, 0.2] : 0.1,
                  }}
                  transition={{
                    duration: 2,
                    repeat: status === 'recording' ? Infinity : 0,
                    ease: 'easeInOut',
                  }}
                />
                <motion.div
                  className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full blur-3xl"
                  style={{ background: '#30D158' }}
                  initial={{ opacity: 0.08, scale: 1 }}
                  animate={{
                    scale: status === 'recording' ? [1, 1.3, 1] : 1,
                    opacity: status === 'recording' ? [0.2, 0.25, 0.2] : 0.08,
                  }}
                  transition={{
                    duration: 3,
                    repeat: status === 'recording' ? Infinity : 0,
                    delay: 0.5,
                    ease: 'easeInOut',
                  }}
                />
              </div>

              {/* Header */}
              <div className="relative px-6 py-4 border-b border-white/10 flex items-center justify-between draggable">
                <div className="flex items-center gap-3">
                  <div>
                    <h1 className="text-white/90 tracking-tight font-medium">Hush</h1>
                    <p className="text-white/40 text-xs">AI-Powered Dictation</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 no-drag">
                  <button
                    onClick={() => setShowSettings(true)}
                    className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 transition-colors flex items-center justify-center border border-white/10 cursor-pointer"
                  >
                    <Settings className="w-4 h-4 text-white/60" />
                  </button>
                  <button
                    onClick={() => window.electronAPI.hideWindow()}
                    className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 transition-colors flex items-center justify-center border border-white/10 cursor-pointer"
                  >
                    <X className="w-4 h-4 text-white/60" />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="relative px-8 py-12 space-y-8">
                <div className="flex justify-center">
                  <MicrophoneButton
                    isRecording={status === 'recording' || status === 'starting'}
                    onToggle={handleToggle}
                  />
                </div>

                <motion.div
                  className="text-center"
                  animate={{
                    opacity: status === 'recording' ? [0.6, 1, 0.6] : 1,
                  }}
                  transition={{ duration: 2, repeat: status === 'recording' ? Infinity : 0 }}
                >
                  <p className={`text-sm ${status === 'error' ? 'text-red-400' : 'text-white/80'}`}>
                    {status === 'idle' && 'Click to start dictation'}
                    {status === 'starting' && 'Warming up...'}
                    {status === 'recording' && 'Listening...'}
                    {status === 'processing' && 'Transcribing...'}
                    {status === 'error' && 'Error: Check Settings'}
                  </p>
                </motion.div>

                <AnimatePresence>
                  {(status === 'recording' || status === 'processing' || transcript) && (
                    <LiveTranscript
                      transcript={transcript}
                      isRecording={status === 'recording' || status === 'starting'}
                      wordCount={wordCount}
                    />
                  )}
                </AnimatePresence>
              </div>

              {/* Footer */}
              <div className="relative px-6 py-3 border-t border-white/10 bg-white/5">
                <p className="text-white/40 text-xs text-center">
                  Press{' '}
                  <kbd className="px-2 py-0.5 rounded bg-white/10 border border-white/20 text-white/60 font-mono">
                    Cmd + '
                  </kbd>{' '}
                  to start/stop
                </p>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.button
            key="minimized"
            onClick={() => setIsMinimized(false)}
            className="relative w-16 h-16 rounded-2xl backdrop-blur-3xl bg-black/90 border border-white/10 shadow-2xl hover:scale-110 transition-transform cursor-pointer"
          >
            <div className="w-full h-full p-3">
              <AppIcon />
            </div>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
