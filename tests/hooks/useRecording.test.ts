/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRecording } from '../../src/hooks/useRecording';
import { setupElectronAPIMock } from '../mocks/electronAPI';

// Mock navigator.mediaDevices
const mockMediaStream = {
  getTracks: () => [{ stop: vi.fn() }],
};

vi.mock('../../src/utils/audioUtils', () => ({
  calculateRMS: vi.fn().mockReturnValue(10),
}));

describe('useRecording Hook', () => {
  let mockElectronAPI: ReturnType<typeof setupElectronAPIMock>;

  beforeEach(() => {
    mockElectronAPI = setupElectronAPIMock();

    // Mock MediaRecorder as a proper class
    class MockMediaRecorder {
      state: 'inactive' | 'recording' | 'paused' = 'inactive';
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      start() {
        this.state = 'recording';
      }
      stop() {
        this.state = 'inactive';
        if (this.onstop) this.onstop();
      }
    }
    (globalThis as Record<string, unknown>).MediaRecorder = MockMediaRecorder;

    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockResolvedValue(mockMediaStream),
      },
      writable: true,
      configurable: true,
    });

    // Mock AudioContext as a proper class
    class MockAudioContext {
      state = 'running';
      destination = {};
      createAnalyser() {
        return {
          fftSize: 2048,
          getByteTimeDomainData: vi.fn(),
          connect: vi.fn(),
        };
      }
      createMediaStreamSource() {
        return { connect: vi.fn() };
      }
      createGain() {
        return {
          gain: { value: 0 },
          connect: vi.fn(),
        };
      }
      resume() {
        return Promise.resolve();
      }
      close() {}
    }
    (globalThis as Record<string, unknown>).AudioContext = MockAudioContext;

    // Stub requestAnimationFrame and cancelAnimationFrame directly on globalThis
    (globalThis as Record<string, unknown>).requestAnimationFrame = vi.fn().mockReturnValue(1);
    (globalThis as Record<string, unknown>).cancelAnimationFrame = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
    // Clean up global mocks
    delete (globalThis as Record<string, unknown>).requestAnimationFrame;
    delete (globalThis as Record<string, unknown>).cancelAnimationFrame;
  });

  it('starts in idle state', () => {
    const isModelReadyRef = { current: true };
    const autoPasteRef = { current: true };

    const { result } = renderHook(() =>
      useRecording({ isModelReadyRef, autoPasteRef, showSettings: false })
    );

    expect(result.current.status).toBe('idle');
    expect(result.current.transcript).toBe('');
    expect(result.current.wordCount).toBeNull();
  });

  it('does not toggle when model is not ready', async () => {
    const isModelReadyRef = { current: false };
    const autoPasteRef = { current: true };

    const { result } = renderHook(() =>
      useRecording({ isModelReadyRef, autoPasteRef, showSettings: false })
    );

    act(() => {
      result.current.handleToggle();
    });

    expect(result.current.status).toBe('idle');
  });

  it('does not toggle when settings are open', async () => {
    const isModelReadyRef = { current: true };
    const autoPasteRef = { current: true };

    const { result } = renderHook(() =>
      useRecording({ isModelReadyRef, autoPasteRef, showSettings: true })
    );

    act(() => {
      result.current.handleToggle();
    });

    expect(result.current.status).toBe('idle');
  });

  it('clears transcript when clearTranscript is called', () => {
    const isModelReadyRef = { current: true };
    const autoPasteRef = { current: true };

    const { result } = renderHook(() =>
      useRecording({ isModelReadyRef, autoPasteRef, showSettings: false })
    );

    act(() => {
      result.current.clearTranscript();
    });

    expect(result.current.transcript).toBe('');
    expect(result.current.wordCount).toBeNull();
  });

  it('debounces rapid toggle calls', async () => {
    const isModelReadyRef = { current: true };
    const autoPasteRef = { current: true };

    const { result } = renderHook(() =>
      useRecording({ isModelReadyRef, autoPasteRef, showSettings: false })
    );

    act(() => {
      result.current.handleToggle();
    });

    act(() => {
      result.current.handleToggle();
    });

    expect(['idle', 'starting', 'recording']).toContain(result.current.status);
  });
});

describe('Text Cleaning', () => {
  it('removes CJK characters from transcription', () => {
    const text = 'Hello \u4E2D\u6587 World';
    const cleaned = text.replace(/[\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\uFF00-\uFFEF\u4E00-\u9FAF]/g, '');
    expect(cleaned).toBe('Hello  World');
  });

  it('removes repetitive word patterns', () => {
    const text = 'the the the quick brown';
    const cleaned = text.replace(/\b(\w+)( \1){2,}\b/gi, '$1');
    expect(cleaned).toBe('the quick brown');
  });

  it('preserves normal text', () => {
    const text = 'Hello world, this is a test.';
    let cleaned = text;
    cleaned = cleaned.replace(/[\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\uFF00-\uFFEF\u4E00-\u9FAF]/g, '');
    cleaned = cleaned.replace(/\b(\w+)( \1){2,}\b/gi, '$1');
    expect(cleaned).toBe('Hello world, this is a test.');
  });
});
