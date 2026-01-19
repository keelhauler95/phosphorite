import { useEffect, useRef } from 'react';
import './style.scss';

function StaticNoise() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const opacityRef = useRef(0.5);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size - use lower resolution internally for better performance
    const scale = 0.75; // Render at 75% resolution, upscale with CSS
    canvas.width = Math.floor(window.innerWidth * scale);
    canvas.height = Math.floor(window.innerHeight * scale);

    // Manage opacity jumps at ~5 second intervals with wider range
    const scheduleNextOpacityChange = () => {
      const interval = Math.random() * 2000 + 1500; // 1.5-3.5 seconds (very frequent)
      setTimeout(() => {
        const newOpacity = Math.random() * 0.4 + 0.6; // 60-100%
        opacityRef.current = newOpacity;
        scheduleNextOpacityChange();
      }, interval);
    };
    scheduleNextOpacityChange();

    const targetFps = 30; // cap to 30 FPS to reduce CPU
    const minFrameTime = 1000 / targetFps;

    const drawStatic = (now?: number) => {
      // frame skip
      if (now !== undefined) {
        const elapsed = now - lastFrameTimeRef.current;
        if (elapsed < minFrameTime) {
          animationRef.current = requestAnimationFrame(drawStatic);
          return;
        }
        lastFrameTimeRef.current = now;
      }

      const imageData = ctx.createImageData(canvas.width, canvas.height);
      const data = imageData.data;

      // Generate terminal-colored noise (less green, more blue)
      for (let i = 0; i < data.length; i += 4) {
        // Random terminal color - adjusted ratio
        const colorType = Math.random();
        let r, g, b;
        
        if (colorType < 0.35) {
          // Green (terminal phosphor) - reduced from 50%
          const baseGreen = Math.random() * 120 + 100; // 100-220 green
          r = Math.random() * 40;
          g = baseGreen;
          b = Math.random() * 50;
        } else if (colorType < 0.5) {
          // Amber/yellow - reduced
          const baseYellow = Math.random() * 130 + 100;
          r = baseYellow;
          g = Math.random() * 90 + 70;
          b = Math.random() * 30;
        } else {
          // Cyan/Blue - increased from 20% to 50%
          r = Math.random() * 40;
          g = Math.random() * 140 + 80;
          b = Math.random() * 180 + 75; // Much more blue
        }
        
        data[i] = r;     // Red
        data[i + 1] = g; // Green
        data[i + 2] = b; // Blue
        
        // Slightly reduced intensity to improve performance
        const intensity = (Math.random() * 110 + 140) * opacityRef.current; // 140-250 scaled for slightly stronger effect
        data[i + 3] = Math.min(255, intensity); // Alpha
      }

      ctx.putImageData(imageData, 0, 0);
      animationRef.current = requestAnimationFrame(drawStatic);
    };

    // initialize last frame
    lastFrameTimeRef.current = performance.now();
    drawStatic(lastFrameTimeRef.current);

    // Handle resize
    const handleResize = () => {
      // Adaptive scaling: go lower on very large displays
      const baseScale = 0.75;
      const pixels = window.innerWidth * window.innerHeight;
      const scale = pixels > 3000000 ? 0.6 : baseScale; // >3MPx drop to 60%
      canvas.width = Math.floor(window.innerWidth * scale);
      canvas.height = Math.floor(window.innerHeight * scale);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <div className="visual-effect static-noise">
      <canvas ref={canvasRef} className="static-canvas" />
    </div>
  );
}

export default StaticNoise;
