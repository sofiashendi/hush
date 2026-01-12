import { vi } from 'vitest';

export const createMockElectronAPI = () => ({
  transcribeAudio: vi.fn().mockResolvedValue({ text: 'Hello world' }),
  pasteText: vi.fn().mockResolvedValue(undefined),
  log: vi.fn(),
  onToggleRecording: vi.fn().mockReturnValue(() => {}),
  hideWindow: vi.fn(),
  getConfig: vi.fn().mockResolvedValue({ autoPaste: true, model: 'base' }),
  saveConfig: vi.fn().mockResolvedValue(undefined),
  isModelReady: vi.fn().mockResolvedValue(true),
  switchModel: vi.fn().mockResolvedValue(true),
  onModelReady: vi.fn().mockReturnValue(() => {}),
  onModelError: vi.fn().mockReturnValue(() => {}),
  onDownloadProgress: vi.fn().mockReturnValue(() => {}),
  onOpenSettings: vi.fn().mockReturnValue(() => {}),
  setTrayTitle: vi.fn().mockResolvedValue(undefined),
});

export function setupElectronAPIMock() {
  const mockAPI = createMockElectronAPI();
  (globalThis as Record<string, unknown>).window = {
    electronAPI: mockAPI,
  };
  return mockAPI;
}
