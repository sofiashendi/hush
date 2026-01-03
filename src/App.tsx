import { useState, useEffect, useRef } from 'react';
import { calculateRMS } from './utils/audioUtils';
import { GearIcon } from './components/Icons';
import SettingsForm from './components/SettingsForm';
import RecorderView from './components/RecorderView';

function App() {
    const [status, setStatus] = useState<'idle' | 'starting' | 'recording' | 'processing' | 'error'>('idle');
    const [duration, setDuration] = useState(0);
    const [wordCount, setWordCount] = useState<number | null>(null);

    // Settings State
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [apiUrl, setApiUrl] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [autoPaste, setAutoPaste] = useState(false);
    const [aiPolish, setAiPolish] = useState(false);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<number | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const maxVolumeRef = useRef<number>(0);
    const animationFrameRef = useRef<number | null>(null);

    // Continuous Dictation Refs
    const silenceStartRef = useRef<number | null>(null);
    const isSpeakingRef = useRef<boolean>(false);
    const hasPlaceholderRef = useRef<boolean>(false); // Track if we typed '...'
    const transcriptionQueueRef = useRef<Promise<void>>(Promise.resolve());

    useEffect(() => {
        // Override console.log to pipe to terminal
        const originalLog = console.log;
        const originalError = console.error;

        console.log = (...args) => {
            // Keep original behavior
            originalLog(...args);
            // Send to main process
            window.electronAPI.log(args.map(a => String(a)).join(' '));
        };

        console.error = (...args) => {
            originalError(...args);
            window.electronAPI.log('ERROR: ' + args.map(a => String(a)).join(' '));
        };

        console.log('App Mounted - Logger Initialized');

        const removeToggleListener = window.electronAPI.onToggleRecording(() => {
            console.log('Received toggle-recording event');
            handleToggle();
        });

        // Load Config on Mount
        window.electronAPI.getConfig().then(config => {
            if (config.apiUrl) setApiUrl(config.apiUrl);
            if (config.apiKey) setApiKey(config.apiKey);
            if (config.autoPaste !== undefined) setAutoPaste(config.autoPaste);
            if (config.aiPolish !== undefined) setAiPolish(config.aiPolish); // Load Polish setting

            // If missing keys, open settings automatically
            if (!config.apiUrl || !config.apiKey) {
                setIsSettingsOpen(true);
            }
        });

        return () => {
            removeToggleListener();
        };

    }, []); // Empty dependency ensures we use ref/functional updates correctly

    // Use a ref to track current status for the event listener closure
    const statusRef = useRef(status);
    useEffect(() => {
        statusRef.current = status;

        // Update Tray Title based on Status
        // Update Tray Title based on Status
        let title = ' 🎙️'; // Default for Idle
        if (status === 'recording') title = ' 🔴 Rec';
        else if (status === 'processing') title = ' ⏳';
        else if (status === 'error') title = ' ⚠️';

        window.electronAPI.setTrayTitle(title);
    }, [status]);

    // Refs for closures
    const autoPasteRef = useRef(autoPaste);
    const aiPolishRef = useRef(aiPolish);

    useEffect(() => { autoPasteRef.current = autoPaste }, [autoPaste]);
    useEffect(() => { aiPolishRef.current = aiPolish }, [aiPolish]);

    const lastToggleTimeRef = useRef<number>(0);

    const handleToggle = () => {
        // Ignored if settings are open
        if (isSettingsOpen) return;

        const now = Date.now();
        if (now - lastToggleTimeRef.current < 250) {
            console.log('Ignored rapid toggle');
            return;
        }
        lastToggleTimeRef.current = now;

        const current = statusRef.current;
        if (current === 'recording') {
            stopRecording();
        } else if (current === 'idle') {
            startRecording();
        }
    };

    const saveSettings = async () => {
        const success = await window.electronAPI.saveConfig({ apiUrl, apiKey, autoPaste, aiPolish });
        if (success) {
            setIsSettingsOpen(false);
        }
    };

    // Stream Ref
    const streamRef = useRef<MediaStream | null>(null);

    // PERSISTENT AUDIO: Init Once, Keep Alive for Low Latency
    useEffect(() => {
        const initAudio = async () => {
            if (streamRef.current) return;

            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                streamRef.current = stream;

                const audioContext = new AudioContext();
                const analyser = audioContext.createAnalyser();
                const source = audioContext.createMediaStreamSource(stream);
                source.connect(analyser);
                analyser.fftSize = 256;

                audioContextRef.current = audioContext;
                analyserRef.current = analyser;
                console.log('Microphone pre-warmed & ready.');
            } catch (err) {
                console.error('Failed to init microphone:', err);
            }
        };
        initAudio();

        return () => {
            // Cleanup only on App Unmount
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
            if (audioContextRef.current) {
                audioContextRef.current.close();
            }
        };
    }, []);


    const startRecording = async () => {
        if (statusRef.current !== 'idle') return;

        // Ensure stream is ready
        if (!streamRef.current || !audioContextRef.current) {
            console.log('Microphone not ready, initializing now...');
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true
                    }
                });
                streamRef.current = stream;

                const audioContext = new AudioContext();
                const analyser = audioContext.createAnalyser();
                const source = audioContext.createMediaStreamSource(stream);
                source.connect(analyser);
                analyser.fftSize = 256;

                audioContextRef.current = audioContext;
                analyserRef.current = analyser;
                sourceRef.current = source;
            } catch (e) {
                console.error("Critical: Could not init audio", e);
                return;
            }
        }

        setStatus('starting');

        try {
            const stream = streamRef.current!;
            const audioContext = audioContextRef.current!;
            const analyser = analyserRef.current!;

            if (audioContext.state === 'suspended') {
                await audioContext.resume();
            }

            // Reset Refs
            maxVolumeRef.current = 0;
            silenceStartRef.current = null;
            isSpeakingRef.current = false;
            audioChunksRef.current = [];

            // NEW STRATEGY: Stop and Restart MediaRecorder to get valid headers every time
            let isVadTriggered = false;
            let isFlushing = false; // Lock to prevent multiple stop calls

            const flushSegment = () => {
                if (isFlushing) return; // Prevent re-entry loop

                console.log('Flushing Segment (Restarting Recorder)...');

                // LOCK immediately so checkVolume doesn't trigger this again in the next frame
                isFlushing = true;

                // Mark that this was triggered by VAD
                isVadTriggered = true;

                // Stopping triggers onstop, which handles the processing AND restart
                if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                    mediaRecorderRef.current.stop();
                } else {
                    isFlushing = false; // Release lock if we failed to stop
                }
            };

            const checkVolume = () => {
                const dataArray = new Uint8Array(analyser.fftSize);
                analyser.getByteTimeDomainData(dataArray);

                const rms = calculateRMS(dataArray);

                if (rms > maxVolumeRef.current) {
                    maxVolumeRef.current = rms;
                }

                // VAD Logic (Threshold: 10.0 RMS)
                const now = Date.now();
                if (rms > 10.0) {
                    // Speaking
                    silenceStartRef.current = null;
                    isSpeakingRef.current = true;
                } else {
                    // Silence
                    if (!silenceStartRef.current) {
                        silenceStartRef.current = now;
                    } else {
                        // Check duration (700ms)
                        const diff = now - silenceStartRef.current;
                        if (diff > 700 && isSpeakingRef.current) {
                            // Silence Threshold Met -> Flush
                            flushSegment();
                        }
                    }
                }

                if (statusRef.current === 'recording' || statusRef.current === 'starting') {
                    animationFrameRef.current = requestAnimationFrame(checkVolume);
                }
            };
            checkVolume();


            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) audioChunksRef.current.push(event.data);
            };

            mediaRecorder.onstop = async () => {
                // Ensure timer/animation frame cleanup only if we are truly stopping (not VAD restart)
                if (!isVadTriggered) {
                    if (timerRef.current) clearInterval(timerRef.current);
                    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);

                    // DO NOT close AudioContext/Source as we reuse them
                    setDuration(0);
                }

                // Create Blob
                const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                audioChunksRef.current = []; // Clear immediately

                // Capture Max Volume for this session BEFORE resetting
                const sessionMaxVolume = maxVolumeRef.current;

                // Reset VAD state
                silenceStartRef.current = null;
                isSpeakingRef.current = false;
                maxVolumeRef.current = 0;

                // Process Audio
                // If VAD triggered, we process as segment
                // If manual stop, it's final
                const isSegment = isVadTriggered;

                // Queue the transcription
                transcriptionQueueRef.current = transcriptionQueueRef.current.then(async () => {
                    if (blob.size > 0) {
                        // We set status processing HERE immediately for final
                        if (!isSegment) setStatus('processing');
                        await processAudio(blob, isSegment, sessionMaxVolume);
                    } else {
                        console.log('Blob size is 0, skipping.');
                    }
                });

                // RESTART if VAD triggered
                if (isVadTriggered) {
                    console.log('Restarting Recorder immediately...');
                    isVadTriggered = false;
                    isFlushing = false; // UNLOCK for next segment
                    mediaRecorder.start();
                    console.log('Recorder restarted.');
                } else {
                    console.log('Manual stop, cleaning up.');
                    if (blob.size === 0) setStatus('idle');
                }
            };

            // Remove timeslice - we want the whole blob on stop
            console.log('Starting new MediaRecorder session...');
            mediaRecorder.start();

            setStatus('recording');
            setWordCount(null);

            setDuration(0);
            const startTime = Date.now();
            timerRef.current = window.setInterval(() => {
                setDuration(Math.floor((Date.now() - startTime) / 1000));
            }, 100);

        } catch (err) {
            console.error('Error accessing microphone:', err);
            setStatus('idle');
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
            // Don't stop tracks - keep stream alive
        }
    };

    const processAudio = async (audioBlob: Blob, isSegment: boolean, sessionMaxVolume: number) => {
        try {
            // Check for Silence (re-check volume for safety, though VAD handles this)
            // 0.47 was seen in logs. Lowering to 0.1 to be safe.
            if (!isSegment && sessionMaxVolume < 0.1) {
                console.log(`Skipping API: Volume too low (Final Check: ${sessionMaxVolume.toFixed(2)} < 0.1).`);
                setStatus('idle');
                return;
            }

            console.log(`[Transcribe] Sending to ${apiUrl} [Polish: ${aiPolishRef.current}]`);

            // Pass aiPolish flag to Electron
            const arrayBuffer = await audioBlob.arrayBuffer();
            const data = await window.electronAPI.transcribeAudio(arrayBuffer, aiPolishRef.current);
            const text = data.text;

            const hallucinations = ['Subtitles by', 'Thank you for watching', 'Amara.org', 'You', '1.5%', '0.5%', '%'];
            const isShortGarbage = text.length < 5 && /^[0-9.%$]+$/.test(text.trim());

            if (hallucinations.some(h => text.includes(h)) || (text.length < 30 && isShortGarbage)) {
                console.log('Filtered hallucination:', text);
                if (!isSegment) setStatus('idle');
                return;
            }

            if (typeof text === 'string') {
                const trimmed = text.trim();
                const count = trimmed.length > 0 ? trimmed.split(/\s+/).length : 0;
                setWordCount(prev => (prev || 0) + count); // Accumulate count

                if (count > 0) {
                    // Smart Paste logic handles the pasting
                    // We just need to trigger it
                    const deleteCount = hasPlaceholderRef.current ? 3 : 0;
                    await window.electronAPI.pasteText(text + ' ', autoPasteRef.current, deleteCount);
                    hasPlaceholderRef.current = false; // Reset
                }
            }

            if (!isSegment) setStatus('idle');

        } catch (error) {
            console.error('Transcription failed:', error);
            if (hasPlaceholderRef.current) {
                // Feature removed, just log
                console.log('Error during transcription, placeholder cleanup skipped (feature removed)');
                hasPlaceholderRef.current = false;
            }
            if (!isSegment) {
                setStatus('error');
                setTimeout(() => setStatus('idle'), 3000);
            }
        }
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className={`widget ${status === 'recording' ? 'recording' : ''} ${status === 'error' ? 'error' : ''}`}>

            <div className={`settings-toggle ${isSettingsOpen ? 'active' : ''}`} onClick={() => setIsSettingsOpen(!isSettingsOpen)}>
                <GearIcon />
            </div>

            {isSettingsOpen ? (
                <SettingsForm
                    apiUrl={apiUrl}
                    apiKey={apiKey}
                    autoPaste={autoPaste}
                    aiPolish={aiPolish}
                    onApiUrlChange={setApiUrl}
                    onApiKeyChange={setApiKey}
                    onAutoPasteChange={setAutoPaste}
                    onAiPolishChange={setAiPolish}
                    onSave={saveSettings}
                />
            ) : (
                <RecorderView
                    status={status}
                    duration={duration}
                    wordCount={wordCount}
                    onToggle={handleToggle}
                    formatTime={formatTime}
                />
            )}
        </div>
    );
}

export default App;
