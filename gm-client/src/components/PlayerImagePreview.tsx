import { useEffect, useRef, useState } from 'react';

const TICK_MS = 150;
const STEPS = [0.01, 0.02, 0.03, 0.05, 0.08, 0.13, 0.21, 0.34, 0.55, 0.89, 1];
const DEFAULT_LOOP_MS = 30_000;

interface PlayerImagePreviewProps {
  src: string;
  loopIntervalMs?: number;
}

function PlayerImagePreview({ src, loopIntervalMs = DEFAULT_LOOP_MS }: PlayerImagePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const tempCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationTimerRef = useRef<number | null>(null);
  const loopTimerRef = useRef<number | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  const hasImage = Boolean(src);

  const clearAnimationTimer = () => {
    if (animationTimerRef.current) {
      window.clearInterval(animationTimerRef.current);
      animationTimerRef.current = null;
    }
  };

  const clearLoopTimer = () => {
    if (loopTimerRef.current) {
      window.clearTimeout(loopTimerRef.current);
      loopTimerRef.current = null;
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const resampleImage = (scale: number) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const img = imageRef.current;

    if (!canvas || !ctx || !img) return;

    const width = canvas.width;
    const height = canvas.height;

    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    let tempCanvas = tempCanvasRef.current;
    if (!tempCanvas) {
      tempCanvas = document.createElement('canvas');
      tempCanvasRef.current = tempCanvas;
    }

    tempCanvas.width = targetWidth;
    tempCanvas.height = targetHeight;

    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;

    tempCtx.imageSmoothingEnabled = false;
    tempCtx.clearRect(0, 0, targetWidth, targetHeight);
    tempCtx.drawImage(img, 0, 0, targetWidth, targetHeight);

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(tempCanvas, 0, 0, width, height);
    ctx.restore();
  };

  const playCycle = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const img = imageRef.current;

    if (!canvas || !ctx || !img) return;

    const width = Math.max(1, img.width || canvas.width || 1);
    const height = Math.max(1, img.height || canvas.height || 1);

    canvas.width = width;
    canvas.height = height;

    clearAnimationTimer();
    setIsAnimating(true);

    let stepIndex = 0;
    resampleImage(STEPS[stepIndex]);
    stepIndex += 1;

    animationTimerRef.current = window.setInterval(() => {
      if (stepIndex >= STEPS.length) {
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        setIsAnimating(false);
        clearAnimationTimer();

        if (loopIntervalMs > 0) {
          clearLoopTimer();
          loopTimerRef.current = window.setTimeout(() => {
            playCycle();
          }, loopIntervalMs);
        }
        return;
      }

      resampleImage(STEPS[stepIndex]);
      stepIndex += 1;
    }, TICK_MS);
  };

  useEffect(() => {
    return () => {
      clearAnimationTimer();
      clearLoopTimer();
    };
  }, []);

  useEffect(() => {
    clearAnimationTimer();
    clearLoopTimer();
    setIsAnimating(false);

    if (!src) {
      clearCanvas();
      imageRef.current = null;
      return;
    }

    const img = new Image();
    imageRef.current = img;

    img.onload = () => {
      playCycle();
    };

    img.src = src;

    return () => {
      img.onload = null;
    };
  }, [src, loopIntervalMs]);

  return (
    <div className="player-image-preview-frame">
      <div className={`broadcast-preview-screen player-image-preview-screen ${hasImage ? '' : 'is-empty'}`}>
        {hasImage ? (
          <>
            {isAnimating && (
              <div className="player-image-progress" aria-live="polite">
                Calibrating signal
                <span className="player-image-progress-dots" aria-hidden="true" />
              </div>
            )}
            <canvas ref={canvasRef} aria-label="Simulated player image preview" />
          </>
        ) : (
          <div className="player-image-empty-state">
            <p>No image selected yet.</p>
            <span className="panel-helper">Players currently see nothing.</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default PlayerImagePreview;
