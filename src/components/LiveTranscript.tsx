import React, { useRef, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Sparkles, Copy, Check } from 'lucide-react';

interface LiveTranscriptProps {
  transcript: string;
  isRecording: boolean;
  wordCount: number | null;
}

export function LiveTranscript({ transcript, isRecording, wordCount }: LiveTranscriptProps) {
  console.log('[LiveTranscript Render] Len:', transcript.length, 'Msg:', transcript.substring(0, 20));
  const transcriptRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!transcript) return;
    try {
      await navigator.clipboard.writeText(transcript);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
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
      className="relative"
    >
      <div className="flex items-center justify-between mb-3">
        {/* Label */}
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-blue-400" />
          <span className="text-white/60 text-xs tracking-wide uppercase">Live Transcript</span>
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
        className="relative backdrop-blur-xl bg-black/40 rounded-2xl border border-white/10 p-5 max-h-48 overflow-y-auto scroll-smooth"
      >
        {/* Transcript text - Simplified rendering to ensure visibility */}
        {transcript ? (
          <p className="text-white/90 text-sm leading-relaxed font-mono pr-12">
            {transcript}
            {isRecording && (
              <span className="inline-block w-1.5 h-4 bg-blue-400 ml-0.5 align-middle animate-pulse" />
            )}
          </p>
        ) : (
          <div className="flex items-center gap-2 text-white/40 text-sm">
            {isRecording && (
              <div className="flex gap-1 animate-pulse">
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
              </div>
            )}
            <span className="font-mono">{isRecording ? "Listening..." : "Waiting for speech..."}</span>
          </div>
        )}

        {/* Subtle gradient overlay at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-black/60 to-transparent pointer-events-none rounded-b-2xl" />
      </div>
    </motion.div>
  );
}