export function AppIcon() {
  return (
    <svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
      <defs>
        {/* Main gradient for microphone - vibrant blue to green */}
        <linearGradient id="micGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0A84FF" />
          <stop offset="50%" stopColor="#5AC8FA" />
          <stop offset="100%" stopColor="#30D158" />
        </linearGradient>

        {/* Subtle shine */}
        <linearGradient id="shine" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* macOS squircle base - clean dark background */}
      <path
        d="M 140 32 C 89.072 32 47.36 48.416 32 77.824 C 16.64 107.232 32 158.976 32 180 L 32 332 C 32 353.024 16.64 404.768 32 434.176 C 47.36 463.584 89.072 480 140 480 L 372 480 C 422.928 480 464.64 463.584 480 434.176 C 495.36 404.768 480 353.024 480 332 L 480 180 C 480 158.976 495.36 107.232 480 77.824 C 464.64 48.416 422.928 32 372 32 Z"
        fill="#1C1C1E"
      />

      {/* Subtle top shine */}
      <path
        d="M 140 32 C 89.072 32 47.36 48.416 32 77.824 C 16.64 107.232 32 158.976 32 180 L 32 200 C 32 200 50 50 256 50 C 462 50 480 200 480 200 L 480 180 C 480 158.976 495.36 107.232 480 77.824 C 464.64 48.416 422.928 32 372 32 Z"
        fill="url(#shine)"
      />

      {/* Simple, bold microphone shape */}
      <g>
        {/* Mic capsule */}
        <rect x="216" y="160" width="80" height="120" rx="40" fill="url(#micGradient)" />

        {/* Mic stand arc */}
        <path
          d="M 186 310 Q 186 340 216 340 L 296 340 Q 326 340 326 310"
          stroke="url(#micGradient)"
          strokeWidth="16"
          fill="none"
          strokeLinecap="round"
        />

        {/* Mic stand vertical */}
        <line
          x1="256"
          y1="340"
          x2="256"
          y2="380"
          stroke="url(#micGradient)"
          strokeWidth="16"
          strokeLinecap="round"
        />

        {/* Mic base */}
        <line
          x1="220"
          y1="380"
          x2="292"
          y2="380"
          stroke="url(#micGradient)"
          strokeWidth="16"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}
