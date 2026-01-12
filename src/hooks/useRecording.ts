import { useState, useEffect, useRef, useCallback } from 'react';
import { calculateRMS } from '../utils/audioUtils';
import { createLogger } from '../utils/logger';

const log = createLogger('Recording');

// Volume thresholds for Voice Activity Detection (VAD)
const LOW_VOLUME_THRESHOLD = 3.0; // Minimum volume to process audio
const SILENCE_THRESHOLD = 5.0; // Below this is considered silence
const SPEAKING_THRESHOLD = 8.0; // Above this indicates active speech

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
export function useRecording({
  isModelReadyRef,
  autoPasteRef,
  showSettings,
}: UseRecordingOptions): UseRecordingReturn {
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
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

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

      // Connect analyser to a silent gain node to complete the audio graph
      // Without this, the analyser may not receive audio data in newer Chromium
      const silentGain = audioContext.createGain();
      silentGain.gain.value = 0;
      analyser.connect(silentGain);
      silentGain.connect(audioContext.destination);

      sourceRef.current = source;
      analyser.fftSize = 2048;
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      log.info('Microphone ready');
    } catch (err) {
      log.error('Failed to init microphone', err);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    initAudio();
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach((track) => track.stop());
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, [initAudio]);

  // Process audio
  const processAudio = useCallback(
    async (audioBlob: Blob, isSegment: boolean, sessionMaxVolume: number) => {
      try {
        // Only skip low volume for VAD-triggered segments, not manual stops
        if (isSegment && sessionMaxVolume < LOW_VOLUME_THRESHOLD) {
          log.info('Skipped low volume segment', { sessionMaxVolume });
          return;
        }

        const arrayBuffer = await audioBlob.arrayBuffer();
        const data = (await window.electronAPI.transcribeAudio(arrayBuffer)) as { text: string };
        const text = data.text;

        let cleanedText = text;

        // Minimal cleanup (local whisper.cpp handles most hallucinations)
        // 1. Remove CJK characters if accidentally transcribed
        cleanedText = cleanedText.replace(
          /[\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\uFF00-\uFFEF\u4E00-\u9FAF]/g,
          ''
        );

        // 2. Remove repetitive word patterns (e.g., "the the the")
        cleanedText = cleanedText.replace(/\b(\w+)( \1){2,}\b/gi, '$1');

        cleanedText = cleanedText.trim();

        if (cleanedText.length === 0) {
          log.info('Filtered empty', { originalText: text });
          if (!isSegment) setStatus('idle');
          return;
        }

        if (typeof cleanedText === 'string') {
          const count = cleanedText.split(/\s+/).length;

          if (count > 0) {
            setWordCount((prev) => (prev || 0) + count);
            setTranscript((prev) => {
              const space = prev.length > 0 ? ' ' : '';
              return prev + space + cleanedText;
            });

            await window.electronAPI.pasteText(cleanedText + ' ', autoPasteRef.current);
          }
        }
        if (!isSegment) setStatus('idle');
      } catch (error) {
        log.error('Process audio error', error);
        if (!isSegment) setStatus('error');
        setTimeout(() => setStatus('idle'), 3000);
      }
    },
    [autoPasteRef]
  );

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

        const isSilence = maxVolumeRef.current < SILENCE_THRESHOLD;
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

        if (rms > LOW_VOLUME_THRESHOLD) {
          lastActivityTimeRef.current = now;
        }

        if (rms > SPEAKING_THRESHOLD) {
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

        if (
          (currentSize > MAX_SEGMENT_SIZE_BYTES || segmentAge > MAX_SEGMENT_DURATION_MS) &&
          audioChunksRef.current.length > 0
        ) {
          log.debug('Safety flush', { sizeMB: (currentSize / 1024 / 1024).toFixed(1) });
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
            // User manually stopped - transcribe any remaining audio
            if (timerRef.current) clearInterval(timerRef.current);
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            setDuration(0);

            silenceStartRef.current = null;
            isSpeakingRef.current = false;

            log.info('User stopped. Processing final segment', { bytes: blob.size });

            if (blob.size > 0) {
              // Process the final segment - set status to processing while we wait
              setStatus('processing');
              transcriptionQueueRef.current = transcriptionQueueRef.current.then(async () => {
                await processAudio(blob, false, sessionMaxVolume);
              });
            } else {
              setStatus('idle');
            }

            maxVolumeRef.current = 0;
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
      log.error('Start recording error', err);
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
    log.info('Toggle triggered', { status: statusRef.current });
    if (showSettings || !isModelReadyRef.current) return;

    const now = Date.now();
    if (now - lastToggleTimeRef.current < 250) {
      log.debug('Debounced');
      return;
    }
    lastToggleTimeRef.current = now;

    if (statusRef.current === 'recording') {
      log.info('Stopping');
      stopRecording();
    } else if (statusRef.current === 'idle') {
      log.info('Starting');
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
    clearTranscript,
  };
}
