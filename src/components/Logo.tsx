import React from 'react';

interface LogoProps {
  width?: number;
  height?: number;
  showText?: boolean;
  textColor?: string;
  brandColor?: string;
  dialColor?: string;
  showClock?: boolean;
}

export default function Logo({ 
  width = 100, 
  height = 100, 
  showText = true,
  textColor = '#e0f8f5',
  brandColor = '#e0f8f5',
  dialColor = '#134440',
  showClock = true
}: LogoProps) {
  return (
    <div className="flex flex-col items-center justify-center select-none" style={{ textAlign: 'center' }}>
      {showClock && (
        <svg 
          width={width} 
          height={height} 
          viewBox="0 0 120 110" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Deep Teal Background Face Dial */}
          <circle cx="60" cy="55" r="30" fill={dialColor} />

          {/* Hour Indicator Dots (12, 3, 6, 9 o'clock) */}
          <circle cx="60" cy="35" r="2" fill={brandColor} opacity="0.9" />
          <circle cx="60" cy="75" r="2" fill={brandColor} opacity="0.9" />
          <circle cx="40" cy="55" r="2" fill={brandColor} opacity="0.9" />
          <circle cx="80" cy="55" r="2" fill={brandColor} opacity="0.9" />

          {/* 3 Outer Arc segments (Radius 38) */}
          {/* Top Arc (spans 240° to 300°) */}
          <path 
            d="M 41 22.1 A 38 38 0 0 1 79 22.1" 
            stroke={brandColor} 
            strokeWidth="3.5" 
            strokeLinecap="round" 
            fill="none" 
          />
          
          {/* Right Arc (spans 320° to 80°) */}
          <path 
            d="M 89.1 30.6 A 38 38 0 0 1 66.6 92.4" 
            stroke={brandColor} 
            strokeWidth="3.5" 
            strokeLinecap="round" 
            fill="none" 
          />
          
          {/* Left Arc (spans 100° to 220°) */}
          <path 
            d="M 53.4 92.4 A 38 38 0 0 1 30.9 30.6" 
            stroke={brandColor} 
            strokeWidth="3.5" 
            strokeLinecap="round" 
            fill="none" 
          />

          {/* Clock Hands */}
          {/* Minute Hand (pointing to ~10:30 / 225 degrees) */}
          <line 
            x1="60" 
            y1="55" 
            x2="43.7" 
            y2="38.7" 
            stroke={brandColor} 
            strokeWidth="4" 
            strokeLinecap="round" 
          />
          
          {/* Hour Hand (pointing to ~1:30 / 315 degrees) */}
          <line 
            x1="60" 
            y1="55" 
            x2="69.9" 
            y2="45.1" 
            stroke={brandColor} 
            strokeWidth="4" 
            strokeLinecap="round" 
          />

          {/* Central Pin/Hub */}
          <circle cx="60" cy="55" r="4.5" fill={brandColor} />
          <circle cx="60" cy="55" r="1.5" fill={dialColor} />
        </svg>
      )}
      
      {showText && (
        <div 
          style={{ 
            marginTop: showClock ? '0.75rem' : '0px',
            fontSize: '1.8rem',
            fontWeight: 800,
            letterSpacing: '0.3em',
            textIndent: '0.3em', // Center-align letter-spacing correctly
            color: textColor,
            fontFamily: 'Outfit, Inter, sans-serif',
            textTransform: 'uppercase'
          }}
        >
          TAP
        </div>
      )}
    </div>
  );
}
