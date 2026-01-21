/// <reference types="vite/client" />

interface AppConfig {
  model?: string;
  autoPaste?: boolean;
}

interface Window {
  electronAPI: {
    onToggleRecording: (callback: () => void) => () => void;
    onOpenSettings: (callback: () => void) => () => void;
    pasteText: (text: string, autoPaste: boolean) => Promise<void>;
    typePlaceholder: () => Promise<void>;
    removePlaceholder: () => Promise<void>;
    setTrayTitle: (title: string) => Promise<void>;
    hideWindow: () => Promise<void>;
    transcribeAudio: (audioBuffer: ArrayBuffer) => Promise<{ text: string }>;
    getConfig: () => Promise<AppConfig>;
    saveConfig: (config: AppConfig) => Promise<boolean>;
    switchModel: (modelType: string) => Promise<boolean>;
    onDownloadProgress: (callback: (percent: number) => void) => () => void;
    onModelReady: (callback: () => void) => () => void;
    onModelError: (callback: (message: string) => void) => () => void;
    isModelReady: () => Promise<boolean>;
    log: (message: string) => void;
    checkAccessibilityPermission: () => Promise<boolean>;
    openAccessibilitySettings: () => Promise<void>;
    onAccessibilityPermissionChanged: (callback: (granted: boolean) => void) => () => void;
  };
}
