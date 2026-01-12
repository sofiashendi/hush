import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

interface AppConfig {
  model?: string;
  autoPaste?: boolean;
}

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
  pasteText: (text: string, autoPaste: boolean) =>
    ipcRenderer.invoke('paste-text', text, autoPaste),
  typePlaceholder: () => ipcRenderer.invoke('type-placeholder'),
  removePlaceholder: () => ipcRenderer.invoke('remove-placeholder'),
  setTrayTitle: (title: string) => ipcRenderer.invoke('set-tray-title', title),
  hideWindow: () => ipcRenderer.invoke('hide-window'),
  transcribeAudio: (audioBuffer: ArrayBuffer) =>
    ipcRenderer.invoke('transcribe-audio', audioBuffer),
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config: AppConfig) => ipcRenderer.invoke('save-config', config),
  switchModel: (modelType: string) => ipcRenderer.invoke('switch-model', modelType),
  onDownloadProgress: (callback: (percent: number) => void) => {
    const cb = (_event: IpcRendererEvent, percent: number) => callback(percent);
    ipcRenderer.on('download-progress', cb);
    return () => ipcRenderer.removeListener('download-progress', cb);
  },
  onModelReady: (callback: () => void) => {
    const cb = () => callback();
    ipcRenderer.on('model-ready', cb);
    return () => ipcRenderer.removeListener('model-ready', cb);
  },
  onModelError: (callback: (message: string) => void) => {
    const cb = (_event: IpcRendererEvent, message: string) => callback(message);
    ipcRenderer.on('model-error', cb);
    return () => ipcRenderer.removeListener('model-error', cb);
  },
  isModelReady: () => ipcRenderer.invoke('is-model-ready'),
  log: (message: string) => ipcRenderer.send('renderer-log', message),
});
