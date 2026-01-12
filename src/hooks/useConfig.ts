import { useState, useEffect, useRef } from 'react';

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
      console.error('Config load error', e);
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
