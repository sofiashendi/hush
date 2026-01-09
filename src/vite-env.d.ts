/// <reference types="vite/client" />

interface Window {
    electronAPI: {
        onToggleRecording: (callback: () => void) => () => void;
        onOpenSettings: (callback: () => void) => () => void;
        pasteText: (text: string, autoPaste: boolean, deleteCount?: number) => Promise<void>;
        typePlaceholder: () => Promise<void>;
        removePlaceholder: () => Promise<void>;
        setTrayTitle: (title: string) => Promise<void>;
        hideWindow: () => Promise<void>;
        transcribeAudio: (audioBuffer: ArrayBuffer) => Promise<{ text: string }>;
        getConfig: () => Promise<any>;
        saveConfig: (config: any) => Promise<boolean>;
        switchModel: (modelType: string) => Promise<boolean>;
        onDownloadProgress: (callback: (percent: number) => void) => () => void;
        onModelReady: (callback: () => void) => () => void;
        onModelError: (callback: (message: string) => void) => () => void;
        isModelReady: () => Promise<boolean>;
        log: (message: string) => void;
    }
}
