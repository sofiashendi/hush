export const calculateRMS = (dataArray: Uint8Array): number => {
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
        const amplitude = dataArray[i] - 128; // Center around 0 (silence is 128 in Uint8)
        sum += amplitude * amplitude;
    }
    return Math.sqrt(sum / dataArray.length);
};

export const isSilence = (rms: number, threshold: number): boolean => {
    return rms < threshold;
};
