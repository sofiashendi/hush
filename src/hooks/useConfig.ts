import { useState, useEffect, useRef } from 'react';
import { createLogger } from '../utils/logger';

const log = createLogger('Config');

interface Config {
  autoPaste: boolean;
  autoPasteRef: React.RefObject<boolean>;
  loadConfig: () => Promise<void>;
}

/**
 * Hook to manage app configuration.
 */
export function useConfig(): Config {
  const [autoPaste, setAutoPaste] = useState(false);
  const autoPasteRef = useRef(autoPaste);

  // Sync ref
  useEffect(() => {
    autoPasteRef.current = autoPaste;
  }, [autoPaste]);

  const loadConfig = async () => {
    try {
      const config = await window.electronAPI.getConfig();
      if (config.autoPaste !== undefined) setAutoPaste(config.autoPaste);
    } catch (e) {
      log.error('Config load error', { error: e });
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  return {
    autoPaste,
    autoPasteRef,
    loadConfig,
  };
}
