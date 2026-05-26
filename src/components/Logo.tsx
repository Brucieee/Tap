import React from 'react';

interface LogoProps {
  width?: number;
  height?: number;
  showText?: boolean;
}

export default function Logo({ width = 110, height = 48, showText = true }: LogoProps) {
  return (
    <div className="logo-container">
      <svg 
        width={width} 
        height={height} 
        viewBox="0 0 120 54" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
        style={{ filter: 'drop-shadow(0 4px 8px rgba(17, 51, 85, 0.06))' }}
      >
        {/* Blue Ribbon Segment (Right hand wave loop) */}
        <path 
          d="M60 27C72 15 84 8 98 8C110 8 116 16 116 27C116 38 110 46 98 46C82 46 70 35 60 27Z" 
          fill="#2974a6" 
        />
        
        {/* Orange Ribbon Segment (Left hand wave loop) */}
        <path 
          d="M60 27C48 39 36 46 22 46C10 46 4 38 4 27C4 16 10 8 22 8C38 8 50 19 60 27Z" 
          fill="#f08c64" 
        />
        
        {/* Overlapping core accent to create the beautiful woven ribbon effect */}
        <path 
          d="M52 20.6C55.2 23.2 58.4 25.8 61.6 28.4C65.5 25.3 69.4 22.2 73 19C69 13.5 61.5 8 54 8C48 8 43 11 39 15C43.5 16.5 48 18.5 52 20.6Z" 
          fill="#f08c64" 
          opacity="0.95"
        />
        <path 
          d="M68 33.4C64.8 30.8 61.6 28.2 58.4 25.6C54.5 28.7 50.6 31.8 47 35C51 40.5 58.5 46 66 46C72 46 77 43 81 39C76.5 37.5 72 35.5 68 33.4Z" 
          fill="#2974a6" 
          opacity="0.95"
        />
      </svg>
      {showText && <span className="logo-text">TAP</span>}
    </div>
  );
}
