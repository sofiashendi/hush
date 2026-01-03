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
    transcribeAudio: (audioBuffer: ArrayBuffer, aiPolish: boolean) => ipcRenderer.invoke('transcribe-audio', audioBuffer, aiPolish),
    getConfig: () => ipcRenderer.invoke('get-config'),
    saveConfig: (config: any) => ipcRenderer.invoke('save-config', config),
    log: (message: string) => ipcRenderer.send('renderer-log', message),
});
