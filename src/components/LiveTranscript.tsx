import React, { useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { Sparkles } from 'lucide-react';

interface LiveTranscriptProps {
  transcript: string;
}

export function LiveTranscript({ transcript }: LiveTranscriptProps) {
  const transcriptRef = useRef<HTMLDivElement>(null);

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
      {/* Label */}
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-blue-400" />
        <span className="text-white/60 text-xs tracking-wide uppercase">Live Transcript</span>
      </div>

      {/* Transcript container */}
      <div
        ref={transcriptRef}
        className="relative backdrop-blur-xl bg-black/40 rounded-2xl border border-white/10 p-5 max-h-48 overflow-y-auto scroll-smooth"
      >
        {/* Code-style dots indicator */}


        {/* Transcript text */}
        {transcript ? (
          <motion.p
            className="text-white/90 text-sm leading-relaxed font-mono pr-12"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {transcript}
            <motion.span
              className="inline-block w-1.5 h-4 bg-blue-400 ml-0.5 align-middle"
              animate={{ opacity: [1, 0, 1] }}
              transition={{ duration: 0.8, repeat: Infinity }}
            />
          </motion.p>
        ) : (
          <div className="flex items-center gap-2 text-white/40 text-sm">
            <motion.div
              className="flex gap-1"
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              <span className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
              <span className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
              <span className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
            </motion.div>
            <span className="font-mono">Waiting for speech...</span>
          </div>
        )}

        {/* Subtle gradient overlay at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-black/60 to-transparent pointer-events-none rounded-b-2xl" />
      </div>
    </motion.div>
  );
}