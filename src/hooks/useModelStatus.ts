import { useState, useEffect, useRef } from 'react';
import { createLogger } from '../utils/logger';

const log = createLogger('ModelStatus');

interface ModelStatus {
  isModelReady: boolean;
  isModelReadyRef: React.RefObject<boolean>;
  modelDownloadProgress: number;
  modelError: string | null;
}

/**
 * Hook to manage Whisper model status, download progress, and errors.
 */
export function useModelStatus(): ModelStatus {
  const [isModelReady, setIsModelReady] = useState(false);
  const [modelDownloadProgress, setModelDownloadProgress] = useState(-1); // -1 = not downloading
  const [modelError, setModelError] = useState<string | null>(null);

  const isModelReadyRef = useRef(isModelReady);

  // Sync ref
  useEffect(() => {
    isModelReadyRef.current = isModelReady;
  }, [isModelReady]);

  useEffect(() => {
    // Listen for model ready event
    const removeModelReadyListener = window.electronAPI.onModelReady(() => {
      log.info('Model ready');
      setIsModelReady(true);
      setModelDownloadProgress(-1);
      setModelError(null);
    });

    // Listen for model error event
    const removeModelErrorListener = window.electronAPI.onModelError((message) => {
      log.error('Model error', { message });
      setModelError(message);
      setModelDownloadProgress(-1);
    });

    // Listen for download progress
    const removeDownloadListener = window.electronAPI.onDownloadProgress((percent) => {
      log.debug('Download progress', { percent });
      setModelDownloadProgress(percent);
    });

    // Check if model is already ready
    window.electronAPI.isModelReady().then((ready) => {
      if (ready) {
        setIsModelReady(true);
      }
    });

    return () => {
      removeModelReadyListener();
      removeModelErrorListener();
      removeDownloadListener();
    };
  }, []);

  return {
    isModelReady,
    isModelReadyRef,
    modelDownloadProgress,
    modelError,
  };
}
