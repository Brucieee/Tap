import React, { useEffect, useState } from 'react';

// Flapping Bat Component
const FlappingBat = ({ size }: { size: number }) => (
  <svg
    viewBox="0 0 100 60"
    width={size}
    height={size * 0.6}
    className="overflow-visible"
  >
    <g className="wing-left">
        <path d="M50 30 Q30 5, 10 30 Q20 40, 30 35 Q40 40, 50 30" fill="black" />
    </g>
    <g className="wing-right">
        <path d="M50 30 Q70 5, 90 30 Q80 40, 70 35 Q60 40, 50 30" fill="black" />
    </g>
    <g className="bat-body">
         <path d="M50 25 C48 20, 52 20, 50 25 C45 35, 45 45, 50 45 C55 45, 55 35, 50 25 Z" fill="black" />
         <circle cx="48" cy="22" r="1" fill="white" opacity="0.5" />
         <circle cx="52" cy="22" r="1" fill="white" opacity="0.5" />
    </g>
    
    <style>{`
      .wing-left {
        transform-origin: 50px 30px;
        animation: flap-left 0.15s infinite alternate ease-in-out;
      }
      .wing-right {
        transform-origin: 50px 30px;
        animation: flap-right 0.15s infinite alternate ease-in-out;
      }
      @keyframes flap-left {
        from { transform: rotate(0deg); }
        to { transform: rotate(40deg); }  /* Flaps down */
      }
      @keyframes flap-right {
        from { transform: rotate(0deg); }
        to { transform: rotate(-40deg); } /* Flaps down */
      }
    `}</style>
  </svg>
);

interface Bat {
  id: number;
  x: number;
  y: number;
  size: number;
  duration: number;
  delay: number;
  xDrift: number;
  rotate: number;
}

const BatEffect = ({ trigger, setTrigger }: { trigger: boolean; setTrigger: (v: boolean) => void }) => {
  const [bats, setBats] = useState<Bat[]>([]);

  useEffect(() => {
    if (trigger) {
      // Create a swarm
      const newBats = Array.from({ length: 30 }).map((_, i) => ({
        id: Date.now() + i,
        x: Math.random() * 100, // Random start X
        y: 110, // Start below screen
        size: Math.random() * 40 + 30, // Bigger bats
        duration: Math.random() * 3 + 2, // 2-5s duration
        delay: Math.random() * 1.5,
        // Trajectory control
        xDrift: (Math.random() - 0.5) * 80, // Horizontal drift
        rotate: (Math.random() - 0.5) * 40
      }));
      setBats(newBats);

      // Cleanup
      const timeout = setTimeout(() => {
        setBats([]);
        setTrigger(false);
      }, 6000);

      return () => clearTimeout(timeout);
    }
  }, [trigger, setTrigger]);

  if (!trigger && bats.length === 0) return null;

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: 'none',
        zIndex: 99999,
        overflow: 'hidden'
      }}
    >
      {bats.map((bat: any) => (
        <div
          key={bat.id}
          style={{
            position: 'absolute',
            left: `${bat.x}%`,
            top: '110%',
            width: bat.size,
            height: bat.size,
            // CSS Variables for dynamic animation values
            '--drift': `${bat.xDrift}vw`,
            '--rotate': `${bat.rotate}deg`,
            animation: `flyUp ${bat.duration}s ${bat.delay}s linear forwards`
          } as React.CSSProperties}
        >
          <FlappingBat size={bat.size} />
        </div>
      ))}
      <style>{`
        @keyframes flyUp {
          0% {
            transform: translate(0, 0) scale(0.5) rotate(0deg);
            opacity: 0;
          }
          10% {
            opacity: 1;
            transform: translate(0, -10vh) scale(0.8) rotate(var(--rotate));
          }
          100% {
            transform: translate(var(--drift), -130vh) scale(1.2) rotate(var(--rotate));
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
};

export default BatEffect;
