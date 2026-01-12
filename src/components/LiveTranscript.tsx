import { useRef, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Sparkles, Copy, Check, Mic } from 'lucide-react';
import { createLogger } from '../utils/logger';

const log = createLogger('LiveTranscript');

interface LiveTranscriptProps {
  transcript: string;
  isRecording: boolean;
  wordCount: number | null;
  label?: string;
  variant?: 'blue' | 'amber';
}

export function LiveTranscript({
  transcript,
  isRecording,
  wordCount,
  label = 'Live Transcript',
  variant = 'blue',
}: LiveTranscriptProps) {
  const transcriptRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!transcript) return;
    try {
      await navigator.clipboard.writeText(transcript);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      log.error('Failed to copy to clipboard', { error: err });
    }
  };

  // Auto-scroll to bottom when transcript updates
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [transcript]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, height: 0 }}
      animate={{ opacity: 1, y: 0, height: 'auto' }}
      exit={{ opacity: 0, y: 20, height: 0 }}
      transition={{ duration: 0.3 }}
      className="relative mb-4"
    >
      <div className="flex items-center justify-between mb-3">
        {/* Label */}
        <div className="flex items-center gap-2">
          {variant === 'amber' ? (
            <Mic className="w-4 h-4 text-amber-400" />
          ) : (
            <Sparkles className="w-4 h-4 text-blue-400" />
          )}
          <span
            className={`text-xs tracking-wide uppercase ${variant === 'amber' ? 'text-amber-400/60' : 'text-white/60'}`}
          >
            {label}
          </span>
        </div>

        {/* Word Count & Copy */}
        <div className="flex items-center gap-3">
          {wordCount !== null && (
            <span className="text-white/40 text-xs font-mono">{wordCount} words</span>
          )}
          {transcript && (
            <button
              onClick={handleCopy}
              className="p-1 rounded hover:bg-white/10 transition-colors cursor-pointer"
              title={copied ? 'Copied!' : 'Copy transcript'}
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-green-400" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-white/40 hover:text-white/60" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Transcript container */}
      <div
        ref={transcriptRef}
        className={`relative backdrop-blur-xl rounded-2xl border p-5 max-h-48 overflow-y-auto scroll-smooth ${
          variant === 'amber'
            ? 'bg-amber-500/10 border-amber-500/20'
            : 'bg-black/40 border-white/10'
        }`}
      >
        {/* Transcript text */}
        {transcript ? (
          <p
            className={`text-sm leading-relaxed font-mono pr-12 ${variant === 'amber' ? 'text-amber-200/90' : 'text-white/90'}`}
          >
            {transcript}
            {isRecording && (
              <span
                className={`inline-block w-1.5 h-4 ml-0.5 align-middle animate-pulse ${variant === 'amber' ? 'bg-amber-400' : 'bg-blue-400'}`}
              />
            )}
          </p>
        ) : (
          <div
            className={`flex items-center gap-2 text-sm ${variant === 'amber' ? 'text-amber-400/40' : 'text-white/40'}`}
          >
            {isRecording && (
              <div className="flex gap-1 animate-pulse">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${variant === 'amber' ? 'bg-amber-400' : 'bg-blue-400'}`}
                />
                <span
                  className={`w-1.5 h-1.5 rounded-full ${variant === 'amber' ? 'bg-amber-400' : 'bg-blue-400'}`}
                />
                <span
                  className={`w-1.5 h-1.5 rounded-full ${variant === 'amber' ? 'bg-amber-400' : 'bg-blue-400'}`}
                />
              </div>
            )}
            <span className="font-mono">
              {isRecording ? 'Listening...' : 'Waiting for speech...'}
            </span>
          </div>
        )}

        {/* Subtle gradient overlay at bottom */}
        <div
          className={`absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t pointer-events-none rounded-b-2xl ${
            variant === 'amber' ? 'from-amber-900/40' : 'from-black/60'
          } to-transparent`}
        />
      </div>
    </motion.div>
  );
}
