import React from 'react';
import { MicIcon, StopIcon } from './Icons';
import Waveform from './Waveform';

interface RecorderViewProps {
    status: 'idle' | 'starting' | 'recording' | 'processing' | 'error';
    duration: number;
    wordCount: number | null;
    onToggle: () => void;
    formatTime: (seconds: number) => string;
}

const RecorderView: React.FC<RecorderViewProps> = ({
    status,
    duration,
    wordCount,
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
            </div>
        </>
    );
};

export default RecorderView;
