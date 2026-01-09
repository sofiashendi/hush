import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
    onToggleRecording: (callback: () => void) => {
        const cb = () => callback();
        ipcRenderer.on('toggle-recording', cb);
        return () => ipcRenderer.removeListener('toggle-recording', cb);
    },
    onOpenSettings: (callback: () => void) => {
        const cb = () => callback();
        ipcRenderer.on('open-settings', cb);
        return () => ipcRenderer.removeListener('open-settings', cb);
    },
    pasteText: (text: string, autoPaste: boolean, deleteCount?: number) => ipcRenderer.invoke('paste-text', text, autoPaste, deleteCount),
    typePlaceholder: () => ipcRenderer.invoke('type-placeholder'),
    removePlaceholder: () => ipcRenderer.invoke('remove-placeholder'),
    setTrayTitle: (title: string) => ipcRenderer.invoke('set-tray-title', title),
    hideWindow: () => ipcRenderer.invoke('hide-window'),
    transcribeAudio: (audioBuffer: ArrayBuffer) => ipcRenderer.invoke('transcribe-audio', audioBuffer),
    getConfig: () => ipcRenderer.invoke('get-config'),
    saveConfig: (config: any) => ipcRenderer.invoke('save-config', config),
    switchModel: (modelType: string) => ipcRenderer.invoke('switch-model', modelType),
    onDownloadProgress: (callback: (percent: number) => void) => {
        const cb = (_: any, percent: number) => callback(percent);
        ipcRenderer.on('download-progress', cb);
        return () => ipcRenderer.removeListener('download-progress', cb);
    },
    log: (message: string) => ipcRenderer.send('renderer-log', message),
});
