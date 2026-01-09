import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AppIcon } from './components/AppIcon';
import { MicrophoneButton } from './components/MicrophoneButton';
import { LiveTranscript } from './components/LiveTranscript';
import { SettingsPanel } from './components/SettingsPanel';
import { Settings, X } from 'lucide-react';
import { calculateRMS } from './utils/audioUtils';

export default function App() {
    // Logic State
    const [status, setStatus] = useState<'idle' | 'starting' | 'recording' | 'processing' | 'error'>('idle');
    const [duration, setDuration] = useState(0);
    const [wordCount, setWordCount] = useState<number | null>(null);
    const [transcript, setTranscript] = useState('');

    // UI State
    const [isMinimized, setIsMinimized] = useState(false);
    const [showSettings, setShowSettings] = useState(false);

    // Config State
    const [apiUrl, setApiUrl] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [autoPaste, setAutoPaste] = useState(false);

    // Refs
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<number | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const maxVolumeRef = useRef<number>(0);
    const animationFrameRef = useRef<number | null>(null);
    const streamRef = useRef<MediaStream | null>(null);

    // Continuous Dictation Refs
    const silenceStartRef = useRef<number | null>(null);
    const isSpeakingRef = useRef<boolean>(false);
    const hasPlaceholderRef = useRef<boolean>(false);
    const transcriptionQueueRef = useRef<Promise<void>>(Promise.resolve());
    const statusRef = useRef(status);
    const autoPasteRef = useRef(autoPaste);
    const lastToggleTimeRef = useRef<number>(0);

    // Sync Refs
    useEffect(() => { statusRef.current = status; }, [status]);
    useEffect(() => { autoPasteRef.current = autoPaste; }, [autoPaste]);

    // Load Config
    const loadConfig = async () => {
        try {
            const config = await window.electronAPI.getConfig();
            if (config.apiUrl) setApiUrl(config.apiUrl);
            if (config.apiKey) setApiKey(config.apiKey);
            if (config.autoPaste !== undefined) setAutoPaste(config.autoPaste);
            // Note: No longer auto-opening settings - local Whisper doesn't need API keys
        } catch (e) {
            console.error("Config load error", e);
        }
    };

    useEffect(() => {
        const originalLog = console.log;
        const originalError = console.error;
        console.log = (...args) => { originalLog(...args); window.electronAPI.log(args.map(a => String(a)).join(' ')); };
        console.error = (...args) => { originalError(...args); window.electronAPI.log('ERROR: ' + args.map(a => String(a)).join(' ')); };

        const removeToggleListener = window.electronAPI.onToggleRecording(() => {
            handleToggle();
        });

        loadConfig();
        initAudio();

        return () => {
            // Restore console to prevent N-wrapping on HMR
            console.log = originalLog;
            console.error = originalError;

            removeToggleListener();
            if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
            if (audioContextRef.current) audioContextRef.current.close();
        };
    }, []);

    const initAudio = async () => {
        if (streamRef.current) return;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            const audioContext = new AudioContext();
            const analyser = audioContext.createAnalyser();
            const source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);
            sourceRef.current = source; // Keep ref
            analyser.fftSize = 2048;
            audioContextRef.current = audioContext;
            analyserRef.current = analyser;
            console.log('Microphone ready.');
        } catch (err) {
            console.error('Failed to init microphone:', err);
        }
    };

    const handleToggle = () => {
        console.log('[HandleToggle] Triggered. StatusRef:', statusRef.current);
        if (showSettings) return;
        const now = Date.now();
        if (now - lastToggleTimeRef.current < 250) {
            console.log('[HandleToggle] Debounced');
            return;
        }
        lastToggleTimeRef.current = now;

        if (statusRef.current === 'recording') {
            console.log('[HandleToggle] Stopping...');
            stopRecording();
        }
        else if (statusRef.current === 'idle') {
            console.log('[HandleToggle] Starting...');
            startRecording();
        }
    };

    const startRecording = async () => {
        if (statusRef.current !== 'idle') return;
        setTranscript('');

        if (!streamRef.current || !audioContextRef.current) {
            await initAudio();
            if (!streamRef.current) return;
        }

        setStatus('starting');
        statusRef.current = 'starting'; // Manual sync for immediate loop check

        try {
            const stream = streamRef.current!;
            const audioContext = audioContextRef.current!;
            const analyser = analyserRef.current!;

            if (audioContext.state === 'suspended') await audioContext.resume();

            maxVolumeRef.current = 0;
            silenceStartRef.current = null;
            isSpeakingRef.current = false;
            audioChunksRef.current = [];

            // Track segment start time for minimum duration validation
            let segmentStartTime = Date.now();

            let isVadTriggered = false;
            let isFlushing = false;
            const lastFlushTimeRef = { current: Date.now() };
            const lastActivityTimeRef = { current: Date.now() };
            const MIN_SEGMENT_DURATION_MS = 400; // Minimum audio duration to send
            const MIN_FLUSH_INTERVAL_MS = 1000; // Rate limit: max 1 flush per second

            const flushSegment = () => {
                if (isFlushing) return;

                const now = Date.now();
                const segmentDuration = now - segmentStartTime;
                const timeSinceLastFlush = now - lastFlushTimeRef.current;

                // Rate limiting: but DON'T discard - just delay the flush
                if (timeSinceLastFlush < MIN_FLUSH_INTERVAL_MS) {
                    // Don't log this - happens every frame
                    return; // Audio keeps accumulating, will flush on next check
                }

                // Minimum duration check
                if (segmentDuration < MIN_SEGMENT_DURATION_MS) {
                    return;
                }

                // Don't flush if it was just silence (threshold lowered to match speech detection)
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

                // Stop the recorder - onstop will process and restart
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

                // Speech detection (threshold lowered from 20 to 8 for quieter mics)
                if (rms > 8.0) {
                    silenceStartRef.current = null;
                    isSpeakingRef.current = true;
                } else {
                    if (!silenceStartRef.current) silenceStartRef.current = now;
                    else if (now - silenceStartRef.current > 1000 && isSpeakingRef.current) {
                        flushSegment();
                    }
                }

                // Safety limits for long recordings
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

            // Helper to create and start a new MediaRecorder
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
                        // VAD flush - process and restart recorder
                        isVadTriggered = false;
                        isFlushing = false;
                        lastFlushTimeRef.current = Date.now();
                        segmentStartTime = Date.now();
                        silenceStartRef.current = null;
                        isSpeakingRef.current = false;
                        maxVolumeRef.current = 0;

                        // Process audio asynchronously
                        transcriptionQueueRef.current = transcriptionQueueRef.current.then(async () => {
                            if (blob.size > 0) {
                                await processAudio(blob, true, sessionMaxVolume);
                            }
                        });

                        // Restart recorder for next segment (if still recording)
                        if (statusRef.current === 'recording') {
                            createMediaRecorder();
                            mediaRecorderRef.current?.start(100); // 100ms timeslice for periodic ondataavailable
                        }
                    } else {
                        // User stopped recording - DON'T send final segment (it's mostly silence)
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
            mediaRecorderRef.current?.start(100); // 100ms timeslice for periodic ondataavailable
            setStatus('recording');
            statusRef.current = 'recording'; // Manual sync for immediate loop check
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
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
        }
    };

    const processAudio = async (audioBlob: Blob, isSegment: boolean, sessionMaxVolume: number) => {
        try {
            // Filter out silence/noise segments to prevent hallucinations
            // Even segments need some volume presence
            if (sessionMaxVolume < 3.0) {
                console.log('[Process] Skipped low volume segment:', sessionMaxVolume);
                if (!isSegment) setStatus('idle');
                return;
            }

            const arrayBuffer = await audioBlob.arrayBuffer();
            const data = await window.electronAPI.transcribeAudio(arrayBuffer, false) as { text: string };
            const text = data.text;

            let cleanedText = text;

            // Minimal cleanup (whisper-large-v3-turbo with vad_filter handles hallucinations well)
            // 1. Remove CJK characters if accidentally transcribed
            cleanedText = cleanedText.replace(/[\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\uFF00-\uFFEF\u4E00-\u9FAF]/g, '');

            // 2. Remove repetitive word patterns (e.g., "the the the")
            cleanedText = cleanedText.replace(/\b(\w+)( \1){2,}\b/gi, '$1');

            cleanedText = cleanedText.trim();

            if (cleanedText.length === 0) {
                console.log('[Process] Filtered empty:', text);
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

                    const deleteCount = hasPlaceholderRef.current ? 3 : 0;
                    await window.electronAPI.pasteText(cleanedText + ' ', autoPasteRef.current, deleteCount);
                    hasPlaceholderRef.current = false;
                }
            }
            if (!isSegment) setStatus('idle');

        } catch (error) {
            console.error(error);
            if (!isSegment) setStatus('error');
            setTimeout(() => setStatus('idle'), 3000);
        }
    };

    console.log('[App Render] Status:', status, 'Transcript Len:', transcript.length);


    return (
        <div className="min-h-screen bg-transparent flex items-center justify-center p-4">
            <AnimatePresence mode="wait">
                {showSettings ? (
                    <SettingsPanel
                        key="settings"
                        onClose={() => {
                            console.log('[App] onClose called, setting showSettings to false');
                            setShowSettings(false);
                            console.log('[App] showSettings should now be false');
                            loadConfig();
                        }}
                    />
                ) : !isMinimized ? (
                    <motion.div
                        key="full"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="relative w-full max-w-2xl"
                    >
                        <div className={`relative backdrop-blur-3xl bg-black/80 rounded-3xl border border-white/10 shadow-2xl overflow-hidden transition-colors ${status === 'error' ? 'border-red-500/50' : ''}`}>
                            {/* Background */}
                            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                                <motion.div
                                    className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full blur-3xl"
                                    style={{ background: '#0A84FF' }}
                                    initial={{ opacity: 0.1, scale: 1 }}
                                    animate={{
                                        scale: status === 'recording' ? [1, 1.2, 1] : 1,
                                        opacity: status === 'recording' ? [0.2, 0.3, 0.2] : 0.1,
                                    }}
                                    transition={{
                                        duration: 2,
                                        repeat: status === 'recording' ? Infinity : 0,
                                        ease: 'easeInOut'
                                    }}
                                />
                                <motion.div
                                    className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full blur-3xl"
                                    style={{ background: '#30D158' }}
                                    initial={{ opacity: 0.08, scale: 1 }}
                                    animate={{
                                        scale: status === 'recording' ? [1, 1.3, 1] : 1,
                                        opacity: status === 'recording' ? [0.2, 0.25, 0.2] : 0.08,
                                    }}
                                    transition={{
                                        duration: 3,
                                        repeat: status === 'recording' ? Infinity : 0,
                                        delay: 0.5,
                                        ease: 'easeInOut'
                                    }}
                                />
                            </div>

                            {/* Header */}
                            <div className="relative px-6 py-4 border-b border-white/10 flex items-center justify-between draggable">
                                <div className="flex items-center gap-3">
                                    <div>
                                        <h1 className="text-white/90 tracking-tight font-medium">Hush</h1>
                                        <p className="text-white/40 text-xs">AI-Powered Dictation</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 no-drag">
                                    <button onClick={() => setShowSettings(true)} className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 transition-colors flex items-center justify-center border border-white/10 cursor-pointer">
                                        <Settings className="w-4 h-4 text-white/60" />
                                    </button>
                                    <button onClick={() => window.electronAPI.hideWindow()} className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 transition-colors flex items-center justify-center border border-white/10 cursor-pointer">
                                        <X className="w-4 h-4 text-white/60" />
                                    </button>
                                </div>
                            </div>

                            {/* Body */}
                            <div className="relative px-8 py-12 space-y-8">
                                <div className="flex justify-center">
                                    <MicrophoneButton
                                        isRecording={status === 'recording' || status === 'starting'}
                                        onToggle={handleToggle}
                                    />
                                </div>

                                <motion.div
                                    className="text-center"
                                    animate={{
                                        opacity: status === 'recording' ? [0.6, 1, 0.6] : 1,
                                    }}
                                    transition={{ duration: 2, repeat: status === 'recording' ? Infinity : 0 }}
                                >
                                    <p className={`text-sm ${status === 'error' ? 'text-red-400' : 'text-white/80'}`}>
                                        {status === 'idle' && 'Click to start dictation'}
                                        {status === 'starting' && 'Warming up...'}
                                        {status === 'recording' && 'Listening...'}
                                        {status === 'processing' && 'Transcribing...'}
                                        {status === 'error' && 'Error: Check Settings'}
                                    </p>
                                </motion.div>

                                <AnimatePresence>
                                    {(status === 'recording' || status === 'processing' || transcript) && (
                                        <LiveTranscript
                                            transcript={transcript}
                                            isRecording={status === 'recording' || status === 'starting'}
                                            wordCount={wordCount}
                                        />
                                    )}
                                </AnimatePresence>
                            </div>

                            {/* Footer */}
                            <div className="relative px-6 py-3 border-t border-white/10 bg-white/5">
                                <p className="text-white/40 text-xs text-center">
                                    Press <kbd className="px-2 py-0.5 rounded bg-white/10 border border-white/20 text-white/60 font-mono">Cmd + '</kbd> to start/stop
                                </p>
                            </div>
                        </div>
                    </motion.div>
                ) : (
                    <motion.button
                        key="minimized"
                        onClick={() => setIsMinimized(false)}
                        className="relative w-16 h-16 rounded-2xl backdrop-blur-3xl bg-black/90 border border-white/10 shadow-2xl hover:scale-110 transition-transform cursor-pointer"
                    >
                        <div className="w-full h-full p-3"><AppIcon /></div>
                    </motion.button>
                )}
            </AnimatePresence>
        </div>
    );
}
