import { useEffect, useRef } from 'react';
import './style.scss';

function GlitchEffect() {
  const containerRef = useRef<HTMLDivElement>(null);
  const timeoutsRef = useRef<number[]>([]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const root = document.querySelector('.phosphor-terminal') as HTMLElement | null;
    let active = true;

    const trackTimeout = (id: number) => {
      timeoutsRef.current.push(id);
      return id;
    };

    // Trigger intense glitch events at random intervals
    const triggerIntenseGlitch = () => {
      if (!active) return;
      container.classList.add('glitch-intense');
      if (root) root.classList.add('glitching-text');
      
      // Remove after glitch completes
      const duration = 150 + Math.random() * 250;
      trackTimeout(window.setTimeout(() => {
        if (!active) return;
        container.classList.remove('glitch-intense');
        if (root) root.classList.remove('glitching-text');
      }, duration));

      // Schedule next glitch - much more frequent
      const nextGlitch = Math.random() * 2000 + 500; // 0.5-2.5 seconds
      trackTimeout(window.setTimeout(triggerIntenseGlitch, nextGlitch));
    };

    triggerIntenseGlitch();

    return () => {
      // Cleanup: stop future glitches and remove classes
      active = false;
      timeoutsRef.current.forEach((id) => clearTimeout(id));
      timeoutsRef.current = [];
      container.classList.remove('glitch-intense');
      if (root) root.classList.remove('glitching-text');
    };
  }, []);

  return (
    <div ref={containerRef} className="visual-effect glitch-effect">
      <div className="glitch-layer glitch-layer-1" />
      <div className="glitch-layer glitch-layer-2" />
      <div className="glitch-layer glitch-layer-3" />
      <div className="glitch-layer glitch-layer-4" />
      <div className="glitch-scanline" />
    </div>
  );
}

export default GlitchEffect;
