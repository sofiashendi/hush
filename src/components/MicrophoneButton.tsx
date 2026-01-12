import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';

interface MicrophoneButtonProps {
  isRecording: boolean;
  onToggle: () => void;
}

export function MicrophoneButton({ isRecording, onToggle }: MicrophoneButtonProps) {
  // 7 Bars for a symmetric, premium waveform look
  const [levels, setLevels] = useState<number[]>(new Array(7).fill(0.1));

  // Gradient colors from Blue -> Green
  const barColors = [
    '#0A84FF', // Blue
    '#1A98F5',
    '#2AACEC',
    '#3ABFE2',
    '#4AD3D9',
    '#5AE7CF',
    '#30D158', // Green
  ];

  // Simulate organic symmetric voice activity
  useEffect(() => {
    if (isRecording) {
      const interval = setInterval(() => {
        setLevels(() => {
          // Generate a "center" energy peak
          const centerEnergy = Math.random() * 0.7 + 0.3; // 0.3 to 1.0

          // Create symmetric falloff
          return [
            centerEnergy * 0.3 + Math.random() * 0.1, // Outer Left
            centerEnergy * 0.6 + Math.random() * 0.1, // Mid Left
            centerEnergy * 0.85 + Math.random() * 0.1, // Inner Left
            centerEnergy, // Center (Peak)
            centerEnergy * 0.85 + Math.random() * 0.1, // Inner Right
            centerEnergy * 0.6 + Math.random() * 0.1, // Mid Right
            centerEnergy * 0.3 + Math.random() * 0.1, // Outer Right
          ];
        });
      }, 100);

      return () => clearInterval(interval);
    } else {
      setLevels(new Array(7).fill(0.1));
    }
  }, [isRecording]);

  return (
    <div className="relative">
      {/* Waveform rings when recording (Subtle & Premium) */}
      {isRecording && (
        <>
          {[1, 2].map((ring, i) => (
            <motion.div
              key={ring}
              className="absolute inset-0 rounded-full border border-white/10"
              initial={{ opacity: 0, scale: 1 }}
              animate={{
                opacity: [0, 0.3, 0],
                scale: [1, 1.4 + i * 0.2],
              }}
              transition={{
                duration: 2.5,
                repeat: Infinity,
                delay: i * 0.5,
                ease: 'easeOut',
              }}
            />
          ))}
        </>
      )}

      <motion.button
        onClick={onToggle}
        className="relative w-32 h-32 rounded-full backdrop-blur-xl bg-white/10 border border-white/20 flex items-center justify-center group overflow-hidden cursor-pointer"
        style={{
          borderColor: isRecording ? '#0A84FF' : '#ffffff20',
        }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        animate={{
          boxShadow: isRecording
            ? [
                '0 0 0px rgba(10, 132, 255, 0)',
                '0 0 30px rgba(10, 132, 255, 0.4)',
                '0 0 0px rgba(10, 132, 255, 0)',
              ]
            : '0 0 20px rgba(255, 255, 255, 0.05)',
        }}
        transition={{ duration: 3, repeat: isRecording ? Infinity : 0 }}
      >
        {/* Active Gradient Background */}
        <motion.div
          className="absolute inset-0 opacity-20"
          style={{
            background: isRecording
              ? 'radial-gradient(circle at center, rgba(10, 132, 255, 0.8) 0%, transparent 70%)'
              : 'none',
          }}
          animate={{ scale: isRecording ? [0.8, 1.2, 0.8] : 1 }}
          transition={{ duration: 3, repeat: Infinity }}
        />

        {!isRecording ? (
          // Static Mic Icon (Gradient)
          <svg viewBox="0 0 512 512" className="w-16 h-16 relative z-10 drop-shadow-md">
            <defs>
              <linearGradient id="btnMicGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#0A84FF" />
                <stop offset="100%" stopColor="#30D158" />
              </linearGradient>
            </defs>
            <g>
              <rect x="216" y="160" width="80" height="120" rx="40" fill="url(#btnMicGradient)" />
              <path
                d="M 186 310 Q 186 340 216 340 L 296 340 Q 326 340 326 310"
                stroke="url(#btnMicGradient)"
                strokeWidth="32"
                fill="none"
                strokeLinecap="round"
              />
              <line
                x1="256"
                y1="340"
                x2="256"
                y2="380"
                stroke="url(#btnMicGradient)"
                strokeWidth="32"
                strokeLinecap="round"
              />
              <line
                x1="220"
                y1="380"
                x2="292"
                y2="380"
                stroke="url(#btnMicGradient)"
                strokeWidth="32"
                strokeLinecap="round"
              />
            </g>
          </svg>
        ) : (
          // Premium Waveform Animation
          <div className="flex items-center justify-center gap-1.5 h-16 relative z-10 w-full">
            {levels.map((level, i) => (
              <motion.div
                key={i}
                className="w-1.5 rounded-full"
                style={{
                  backgroundColor: barColors[i],
                  boxShadow: `0 0 10px ${barColors[i]}60`,
                }}
                animate={{
                  height: `${Math.max(8, level * 50)}px`,
                }}
                transition={{
                  duration: 0.1, // Fast updates for responsiveness
                  ease: 'linear',
                }}
              />
            ))}
          </div>
        )}
      </motion.button>
    </div>
  );
}
