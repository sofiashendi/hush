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
    const [rawTranscript, setRawTranscript] = useState(''); // Raw Whisper output for comparison

    // UI State
    const [isMinimized, setIsMinimized] = useState(false);
    const [showSettings, setShowSettings] = useState(false);

    // Config State
    const [apiUrl, setApiUrl] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [autoPaste, setAutoPaste] = useState(false);
    const [aiPolish, setAiPolish] = useState(false);

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
    const aiPolishRef = useRef(aiPolish);
    const lastToggleTimeRef = useRef<number>(0);

    // Sync Refs
    useEffect(() => { statusRef.current = status; }, [status]);
    useEffect(() => { autoPasteRef.current = autoPaste; }, [autoPaste]);
    useEffect(() => { aiPolishRef.current = aiPolish; }, [aiPolish]);

    // Load Config
    const loadConfig = async () => {
        try {
            const config = await window.electronAPI.getConfig();
            if (config.apiUrl) setApiUrl(config.apiUrl);
            if (config.apiKey) setApiKey(config.apiKey);
            if (config.autoPaste !== undefined) setAutoPaste(config.autoPaste);
            if (config.aiPolish !== undefined) setAiPolish(config.aiPolish);

            if (!config.apiUrl || !config.apiKey) {
                setShowSettings(true);
            }
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
        setRawTranscript('');

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

            let isFlushing = false;
            const lastFlushTimeRef = { current: Date.now() };
            const lastActivityTimeRef = { current: Date.now() };
            const MIN_SEGMENT_DURATION_MS = 400; // Minimum audio duration to send
            const MIN_FLUSH_INTERVAL_MS = 1000; // Rate limit: max 1 flush per second

            // Pending chunks for processing (captured by requestData)
            let pendingBlob: Blob | null = null;
            let pendingMaxVolume = 0;

            const flushSegment = () => {
                if (isFlushing) return;

                const now = Date.now();
                const segmentDuration = now - segmentStartTime;
                const timeSinceLastFlush = now - lastFlushTimeRef.current;

                // Rate limiting: but DON'T discard - just delay the flush
                // Audio chunks will continue accumulating until we can flush
                if (timeSinceLastFlush < MIN_FLUSH_INTERVAL_MS) {
                    return; // Audio keeps accumulating, will flush on next check after rate limit expires
                }

                // Minimum duration check: prevent sending very short audio
                if (segmentDuration < MIN_SEGMENT_DURATION_MS) {
                    console.log(`[VAD] Segment too short: ${segmentDuration}ms`);
                    return;
                }

                // Don't flush if it was just silence (stricter threshold)
                const isSilence = maxVolumeRef.current < 8.0;

                // If it's silence and we haven't spoken yet, just reset.
                if (isSilence && !isSpeakingRef.current) {
                    // Drop this segment entirely
                    audioChunksRef.current = [];
                    segmentStartTime = Date.now();
                    lastFlushTimeRef.current = Date.now();
                    maxVolumeRef.current = 0;
                    return;
                }

                console.log(`[VAD] Flushing segment. MaxRMS: ${maxVolumeRef.current.toFixed(2)}, Duration: ${segmentDuration}ms`);
                isFlushing = true;
                pendingMaxVolume = maxVolumeRef.current;

                // Use requestData() instead of stop() - this gets current chunks WITHOUT stopping recording
                if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                    mediaRecorderRef.current.requestData();
                } else {
                    isFlushing = false;
                }
            };

            const checkVolume = () => {
                const dataArray = new Uint8Array(analyser.fftSize);
                analyser.getByteTimeDomainData(dataArray);
                const rms = calculateRMS(dataArray);
                if (rms > maxVolumeRef.current) maxVolumeRef.current = rms;

                const now = Date.now();

                // VAD Logic (RMS 3.0 for Activity - Safe default)
                if (rms > 3.0) {
                    lastActivityTimeRef.current = now;
                }

                // Threshold for Speech (20.0 - Speech start)
                // Raised to 20.0 to avoid ambient noise and breathing
                if (rms > 20.0) {
                    silenceStartRef.current = null;
                    isSpeakingRef.current = true;
                } else {
                    // Silence logic
                    if (!silenceStartRef.current) silenceStartRef.current = now;
                    // Wait 1000ms (1 second) of silence before flushing.
                    // Snappy response.
                    else if (now - silenceStartRef.current > 1000 && isSpeakingRef.current) {
                        flushSegment();
                    }
                }

                // Safety limits: Force flush to prevent hitting CF's 25MB limit
                // ~5MB = ~30 minutes of WebM audio
                const MAX_SEGMENT_SIZE_BYTES = 5 * 1024 * 1024;
                const MAX_SEGMENT_DURATION_MS = 30 * 60 * 1000; // 30 minutes
                const currentSize = audioChunksRef.current.reduce((sum, chunk) => sum + chunk.size, 0);
                const segmentAge = now - segmentStartTime;

                if ((currentSize > MAX_SEGMENT_SIZE_BYTES || segmentAge > MAX_SEGMENT_DURATION_MS) && audioChunksRef.current.length > 0) {
                    console.log(`[VAD] Safety flush: Size=${(currentSize / 1024 / 1024).toFixed(1)}MB, Age=${Math.floor(segmentAge / 1000)}s`);
                    // Force set speaking to true so flushSegment doesn't skip
                    isSpeakingRef.current = true;
                    flushSegment();
                }

                if (statusRef.current === 'recording' || statusRef.current === 'starting') {
                    animationFrameRef.current = requestAnimationFrame(checkVolume);
                }
            };
            checkVolume();

            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    if (isFlushing) {
                        // This is data from requestData() - process it
                        audioChunksRef.current.push(e.data);
                        pendingBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                        audioChunksRef.current = []; // Clear for next segment

                        const blobToProcess = pendingBlob;
                        const volumeToProcess = pendingMaxVolume;

                        // Reset state for next segment
                        segmentStartTime = Date.now();
                        lastFlushTimeRef.current = Date.now();
                        silenceStartRef.current = null;
                        isSpeakingRef.current = false;
                        maxVolumeRef.current = 0;
                        isFlushing = false;
                        pendingBlob = null;

                        // Process asynchronously
                        transcriptionQueueRef.current = transcriptionQueueRef.current.then(async () => {
                            if (blobToProcess.size > 0) {
                                await processAudio(blobToProcess, true, volumeToProcess);
                            }
                        });
                    } else {
                        // Normal accumulation during recording
                        audioChunksRef.current.push(e.data);
                    }
                }
            };

            mediaRecorder.onstop = async () => {
                // Only called when user stops recording (not during VAD flushes)
                if (timerRef.current) clearInterval(timerRef.current);
                if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
                setDuration(0);

                const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                audioChunksRef.current = [];
                const sessionMaxVolume = maxVolumeRef.current;

                silenceStartRef.current = null;
                isSpeakingRef.current = false;
                maxVolumeRef.current = 0;

                // Only send to API if there's meaningful audio content
                // Skip if blob is too small (likely silence after VAD flush)
                const MIN_BLOB_SIZE = 5000; // ~50ms of audio minimum
                const hasMeaningfulAudio = blob.size > MIN_BLOB_SIZE;
                console.log(`[Stop] Final segment: size=${blob.size}, sending=${hasMeaningfulAudio}`);

                transcriptionQueueRef.current = transcriptionQueueRef.current.then(async () => {
                    if (hasMeaningfulAudio) {
                        setStatus('processing');
                        await processAudio(blob, false, sessionMaxVolume);
                    } else {
                        console.log(`[Stop] Skipped empty/silent final segment`);
                        setStatus('idle');
                    }
                });
            };

            mediaRecorder.start();
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
            const data = await window.electronAPI.transcribeAudio(arrayBuffer, aiPolishRef.current) as { text: string; raw?: string };
            const text = data.text;
            const rawText = data.raw || text; // Raw Whisper output for comparison

            let cleanedText = text;

            // 1. Remove known hallucination phrases (case insensitive)
            // Only filter CLEAR hallucination patterns, not single common words
            const phrasesToRemove = [
                'Subtitles by', 'Thank you for watching', 'Amara.org', 'MBC News', 'Kim Ji-hoon'
            ];
            phrasesToRemove.forEach(p => {
                cleanedText = cleanedText.replace(new RegExp(p, 'gi'), '');
            });

            // 2. Remove non-ASCII (Chinese/Korean/Symbols) if mostly garbage
            cleanedText = cleanedText.replace(/[\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\uFF00-\uFFEF\u4E00-\u9FAF\u2605-\u2606\u2190-\u2195\u203B]/g, '');

            // 3. Remove repetitive "you you you" patterns
            cleanedText = cleanedText.replace(/\b(\w+)( \1){2,}\b/gi, '');

            cleanedText = cleanedText.trim();

            const isShortGarbage = cleanedText.length < 5 && /^[0-9.%$]+$/.test(cleanedText);

            if (cleanedText.length === 0 || isShortGarbage) {
                console.log('[Process] Filtered empty/garbage:', text);
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
                    // Also update raw transcript for comparison
                    setRawTranscript(prev => {
                        const space = prev.length > 0 ? ' ' : '';
                        return prev + space + rawText;
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
                            setShowSettings(false);
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
                                        {status === 'processing' && 'Polishing & Pasting...'}
                                        {status === 'error' && 'Error: Check Settings'}
                                    </p>
                                </motion.div>

                                <AnimatePresence>
                                    {(status === 'recording' || status === 'processing' || transcript) && (
                                        <>
                                            {/* Comparison Panel - Raw Whisper output */}
                                            {aiPolish && rawTranscript && rawTranscript !== transcript && (
                                                <motion.div
                                                    initial={{ opacity: 0, height: 0 }}
                                                    animate={{ opacity: 1, height: 'auto' }}
                                                    exit={{ opacity: 0, height: 0 }}
                                                    className="mb-3"
                                                >
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <span className="text-amber-400/60 text-xs tracking-wide uppercase">Raw Whisper</span>
                                                    </div>
                                                    <div className="backdrop-blur-xl bg-amber-500/5 rounded-xl border border-amber-500/20 p-3 max-h-24 overflow-y-auto">
                                                        <p className="text-amber-200/70 text-xs font-mono">{rawTranscript}</p>
                                                    </div>
                                                </motion.div>
                                            )}
                                            <LiveTranscript
                                                transcript={transcript}
                                                isRecording={status === 'recording' || status === 'starting'}
                                                wordCount={wordCount}
                                            />
                                        </>
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
