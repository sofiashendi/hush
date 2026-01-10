import { useState, useEffect, useRef, useCallback } from 'react';
import { calculateRMS } from '../utils/audioUtils';

export type RecordingStatus = 'idle' | 'starting' | 'recording' | 'processing' | 'error';

interface UseRecordingOptions {
    isModelReadyRef: React.RefObject<boolean>;
    autoPasteRef: React.RefObject<boolean>;
    showSettings: boolean;
}

interface UseRecordingReturn {
    status: RecordingStatus;
    duration: number;
    wordCount: number | null;
    transcript: string;
    handleToggle: () => void;
    clearTranscript: () => void;
}

/**
 * Hook to manage audio recording, VAD, and transcription.
 */
export function useRecording({ isModelReadyRef, autoPasteRef, showSettings }: UseRecordingOptions): UseRecordingReturn {
    // State
    const [status, setStatus] = useState<RecordingStatus>('idle');
    const [duration, setDuration] = useState(0);
    const [wordCount, setWordCount] = useState<number | null>(null);
    const [transcript, setTranscript] = useState('');

    // Audio Refs
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<number | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const maxVolumeRef = useRef<number>(0);
    const animationFrameRef = useRef<number | null>(null);
    const streamRef = useRef<MediaStream | null>(null);

    // VAD Refs
    const silenceStartRef = useRef<number | null>(null);
    const isSpeakingRef = useRef<boolean>(false);
    const transcriptionQueueRef = useRef<Promise<void>>(Promise.resolve());
    const statusRef = useRef(status);
    const lastToggleTimeRef = useRef<number>(0);

    // Sync status ref
    useEffect(() => { statusRef.current = status; }, [status]);

    // Initialize audio
    const initAudio = useCallback(async () => {
        if (streamRef.current) return;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            const audioContext = new AudioContext();
            const analyser = audioContext.createAnalyser();
            const source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);
            sourceRef.current = source;
            analyser.fftSize = 2048;
            audioContextRef.current = audioContext;
            analyserRef.current = analyser;
            console.log('[useRecording] Microphone ready.');
        } catch (err) {
            console.error('[useRecording] Failed to init microphone:', err);
        }
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        initAudio();
        return () => {
            if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
            if (audioContextRef.current) audioContextRef.current.close();
        };
    }, [initAudio]);

    // Process audio
    const processAudio = useCallback(async (audioBlob: Blob, isSegment: boolean, sessionMaxVolume: number) => {
        try {
            if (sessionMaxVolume < 3.0) {
                console.log('[useRecording] Skipped low volume segment:', sessionMaxVolume);
                if (!isSegment) setStatus('idle');
                return;
            }

            const arrayBuffer = await audioBlob.arrayBuffer();
            const data = await window.electronAPI.transcribeAudio(arrayBuffer) as { text: string };
            const text = data.text;

            let cleanedText = text;

            // Minimal cleanup (local whisper.cpp handles most hallucinations)
            // 1. Remove CJK characters if accidentally transcribed
            cleanedText = cleanedText.replace(/[\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\uFF00-\uFFEF\u4E00-\u9FAF]/g, '');

            // 2. Remove repetitive word patterns (e.g., "the the the")
            cleanedText = cleanedText.replace(/\b(\w+)( \1){2,}\b/gi, '$1');

            cleanedText = cleanedText.trim();

            if (cleanedText.length === 0) {
                console.log('[useRecording] Filtered empty:', text);
                if (!isSegment) setStatus('idle');
                return;
            }

            if (typeof cleanedText === 'string') {
                const count = cleanedText.split(/\s+/).length;

                if (count > 0) {
                    setWordCount(prev => (prev || 0) + count);
                    setTranscript(prev => {
                        const space = prev.length > 0 ? ' ' : '';
                        return prev + space + cleanedText;
                    });

                    await window.electronAPI.pasteText(cleanedText + ' ', autoPasteRef.current);
                }
            }
            if (!isSegment) setStatus('idle');

        } catch (error) {
            console.error(error);
            if (!isSegment) setStatus('error');
            setTimeout(() => setStatus('idle'), 3000);
        }
    }, [autoPasteRef]);

    // Start recording
    const startRecording = useCallback(async () => {
        if (statusRef.current !== 'idle') return;
        setTranscript('');

        if (!streamRef.current || !audioContextRef.current) {
            await initAudio();
            if (!streamRef.current) return;
        }

        setStatus('starting');
        statusRef.current = 'starting';

        try {
            const stream = streamRef.current!;
            const audioContext = audioContextRef.current!;
            const analyser = analyserRef.current!;

            if (audioContext.state === 'suspended') await audioContext.resume();

            maxVolumeRef.current = 0;
            silenceStartRef.current = null;
            isSpeakingRef.current = false;
            audioChunksRef.current = [];

            let segmentStartTime = Date.now();
            let isVadTriggered = false;
            let isFlushing = false;
            const lastFlushTimeRef = { current: Date.now() };
            const lastActivityTimeRef = { current: Date.now() };
            const MIN_SEGMENT_DURATION_MS = 400;
            const MIN_FLUSH_INTERVAL_MS = 1000;

            const flushSegment = () => {
                if (isFlushing) return;

                const now = Date.now();
                const segmentDuration = now - segmentStartTime;
                const timeSinceLastFlush = now - lastFlushTimeRef.current;

                if (timeSinceLastFlush < MIN_FLUSH_INTERVAL_MS) {
                    return;
                }

                if (segmentDuration < MIN_SEGMENT_DURATION_MS) {
                    return;
                }

                const isSilence = maxVolumeRef.current < 5.0;
                if (isSilence && !isSpeakingRef.current) {
                    audioChunksRef.current = [];
                    segmentStartTime = Date.now();
                    lastFlushTimeRef.current = Date.now();
                    maxVolumeRef.current = 0;
                    return;
                }

                isFlushing = true;
                isVadTriggered = true;

                if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                    mediaRecorderRef.current.stop();
                } else {
                    isFlushing = false;
                    isVadTriggered = false;
                }
            };

            const checkVolume = () => {
                const dataArray = new Uint8Array(analyser.fftSize);
                analyser.getByteTimeDomainData(dataArray);
                const rms = calculateRMS(dataArray);
                if (rms > maxVolumeRef.current) maxVolumeRef.current = rms;

                const now = Date.now();

                if (rms > 3.0) {
                    lastActivityTimeRef.current = now;
                }

                if (rms > 8.0) {
                    silenceStartRef.current = null;
                    isSpeakingRef.current = true;
                } else {
                    if (!silenceStartRef.current) silenceStartRef.current = now;
                    else if (now - silenceStartRef.current > 1000 && isSpeakingRef.current) {
                        flushSegment();
                    }
                }

                const MAX_SEGMENT_SIZE_BYTES = 5 * 1024 * 1024;
                const MAX_SEGMENT_DURATION_MS = 30 * 60 * 1000;
                const currentSize = audioChunksRef.current.reduce((sum, chunk) => sum + chunk.size, 0);
                const segmentAge = now - segmentStartTime;

                if ((currentSize > MAX_SEGMENT_SIZE_BYTES || segmentAge > MAX_SEGMENT_DURATION_MS) && audioChunksRef.current.length > 0) {
                    console.log(`[VAD] Safety flush: Size=${(currentSize / 1024 / 1024).toFixed(1)}MB`);
                    isSpeakingRef.current = true;
                    flushSegment();
                }

                if (statusRef.current === 'recording' || statusRef.current === 'starting') {
                    animationFrameRef.current = requestAnimationFrame(checkVolume);
                }
            };
            checkVolume();

            const createMediaRecorder = () => {
                const recorder = new MediaRecorder(stream);
                mediaRecorderRef.current = recorder;

                recorder.ondataavailable = (e) => {
                    if (e.data.size > 0) {
                        audioChunksRef.current.push(e.data);
                    }
                };

                recorder.onstop = async () => {
                    const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                    audioChunksRef.current = [];
                    const sessionMaxVolume = maxVolumeRef.current;

                    if (isVadTriggered) {
                        isVadTriggered = false;
                        isFlushing = false;
                        lastFlushTimeRef.current = Date.now();
                        segmentStartTime = Date.now();
                        silenceStartRef.current = null;
                        isSpeakingRef.current = false;
                        maxVolumeRef.current = 0;

                        transcriptionQueueRef.current = transcriptionQueueRef.current.then(async () => {
                            if (blob.size > 0) {
                                await processAudio(blob, true, sessionMaxVolume);
                            }
                        });

                        if (statusRef.current === 'recording') {
                            createMediaRecorder();
                            mediaRecorderRef.current?.start(100);
                        }
                    } else {
                        if (timerRef.current) clearInterval(timerRef.current);
                        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
                        setDuration(0);

                        silenceStartRef.current = null;
                        isSpeakingRef.current = false;
                        maxVolumeRef.current = 0;

                        console.log(`[Stop] User stopped. Discarding final segment: ${blob.size} bytes`);
                        setStatus('idle');
                    }
                };

                return recorder;
            };

            createMediaRecorder();
            mediaRecorderRef.current?.start(100);
            setStatus('recording');
            statusRef.current = 'recording';
            setWordCount(null);
            setDuration(0);

            const startTime = Date.now();
            timerRef.current = window.setInterval(() => {
                setDuration(Math.floor((Date.now() - startTime) / 1000));
            }, 100);

        } catch (err) {
            console.error(err);
            setStatus('idle');
        }
    }, [initAudio, processAudio]);

    // Stop recording
    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
        }
    }, []);

    // Toggle recording
    const handleToggle = useCallback(() => {
        console.log('[useRecording] Toggle triggered. Status:', statusRef.current);
        if (showSettings || !isModelReadyRef.current) return;

        const now = Date.now();
        if (now - lastToggleTimeRef.current < 250) {
            console.log('[useRecording] Debounced');
            return;
        }
        lastToggleTimeRef.current = now;

        if (statusRef.current === 'recording') {
            console.log('[useRecording] Stopping...');
            stopRecording();
        } else if (statusRef.current === 'idle') {
            console.log('[useRecording] Starting...');
            startRecording();
        }
    }, [showSettings, isModelReadyRef, startRecording, stopRecording]);

    // Clear transcript
    const clearTranscript = useCallback(() => {
        setTranscript('');
        setWordCount(null);
    }, []);

    return {
        status,
        duration,
        wordCount,
        transcript,
        handleToggle,
        clearTranscript
    };
}
