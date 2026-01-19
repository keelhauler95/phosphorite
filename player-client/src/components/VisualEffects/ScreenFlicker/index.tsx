import { useEffect, useRef } from 'react';
import './style.scss';

function ScreenFlicker() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Schedule random, unpredictable blackout moments
    const scheduleBlackout = () => {
      // Random interval between 0.5-5 seconds - much more frequent
      const interval = Math.random() * 4500 + 500;
      
      setTimeout(() => {
        // Add blackout class
        container.classList.add('blackout');
        
        // Random duration: mostly short (50-300ms) but occasionally longer (300-800ms)
        let duration;
        if (Math.random() < 0.8) {
          duration = Math.random() * 250 + 50; // 50-300ms (80% of time)
        } else {
          duration = Math.random() * 500 + 300; // 300-800ms (20% of time)
        }
        
        setTimeout(() => {
          container.classList.remove('blackout');
        }, duration);

        // Schedule next blackout
        scheduleBlackout();
      }, interval);
    };

    scheduleBlackout();

    return () => {
      // Cleanup
    };
  }, []);

  return (
    <div ref={containerRef} className="visual-effect screen-flicker">
      <div className="flicker-overlay" />
      <div className="blackout-overlay" />
    </div>
  );
}

export default ScreenFlicker;
