import { describe, it, expect } from 'vitest';
import { calculateRMS, isSilence } from '../src/utils/audioUtils';

describe('Audio Utils', () => {
    it('calculates RMS of pure silence (128)', () => {
        const data = new Uint8Array(256).fill(128); // 128 is 0 amplitude in 8-bit
        const rms = calculateRMS(data);
        expect(rms).toBe(0);
    });

    it('calculates RMS of "max volume" square wave', () => {
        // Alternating 0 and 255 is max volume
        const data = new Uint8Array(256);
        for (let i = 0; i < 256; i++) {
            data[i] = i % 2 === 0 ? 0 : 255;
        }
        // Amplitudes are -128 and 127. 
        // rms = sqrt((-128^2 + 127^2)/2) roughly
        const rms = calculateRMS(data);
        expect(rms).toBeGreaterThan(120);
    });

    it('detects silence below threshold', () => {
        expect(isSilence(5.0, 10.0)).toBe(true);
    });

    it('detects speech above threshold', () => {
        expect(isSilence(15.0, 10.0)).toBe(false);
    });
});
