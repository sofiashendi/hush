import React from 'react';
import { MicIcon, StopIcon, CopyIcon } from './Icons';
import Waveform from './Waveform';

interface RecorderViewProps {
    status: 'idle' | 'starting' | 'recording' | 'processing' | 'error';
    duration: number;
    wordCount: number | null;
    transcript: string;
    onToggle: () => void;
    formatTime: (seconds: number) => string;
}

// Helper to copy
const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
};

const RecorderView: React.FC<RecorderViewProps> = ({
    status,
    duration,
    wordCount,
    transcript,
    onToggle,
    formatTime
}) => {
    return (
        <>
            <div className="icon-area">
                <div className="icon-box" onClick={onToggle}>
                    {status === 'recording' ? <StopIcon /> : <MicIcon />}
                </div>
                <span className="meta">Press Cmd + '</span>
            </div>

            <div className="content">
                <div className="header">
                    <span className="title">
                        {status === 'idle' && 'Voice Input'}
                        {status === 'recording' && 'Listening...'}
                        {status === 'processing' && 'Thinking...'}
                        {status === 'error' && 'Error'}
                    </span>

                    <span className="status">
                        {status === 'recording' && formatTime(duration)}
                        {status === 'idle' && wordCount !== null && `${wordCount} words recorded`}
                    </span>
                </div>

                <div className="subtitle">
                    {status === 'idle' && (wordCount !== null ? 'Ready to paste (copied to clipboard)' : 'Activate to start recording.')}
                    {status === 'recording' && <Waveform />}
                    {status === 'processing' && <div className="progress"><div className="progress-bar" /></div>}
                    {status === 'error' && <span style={{ color: '#ff453a' }}>Service failed (Check Settings)</span>}
                </div>

                {/* Live Transcript Box */}
                {(transcript || status === 'recording' || status === 'processing') && (
                    <div className="transcript-box">
                        <textarea
                            readOnly
                            value={transcript + (status === 'recording' ? '...' : '')}
                            placeholder="Listening..."
                        />
                        {transcript && (
                            <button className="copy-btn" onClick={() => copyToClipboard(transcript)} title="Copy to Clipboard">
                                <CopyIcon />
                            </button>
                        )}
                    </div>
                )}
            </div>
        </>
    );
};

export default RecorderView;
