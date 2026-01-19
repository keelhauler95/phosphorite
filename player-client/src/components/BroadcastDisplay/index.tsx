import { useEffect, useRef, useState } from 'react';
import Teletype from '../Teletype';
import './style.scss';

interface BroadcastDisplayProps {
  type: 'text' | 'image';
  content: string;
  mimeType?: string;
  duration: number;
  onComplete: () => void;
}

const BroadcastDisplay: React.FC<BroadcastDisplayProps> = ({
  type,
  content,
  mimeType,
  duration,
  onComplete
}) => {
  const timerRef = useRef<number | null>(null);
  const extraDelayRef = useRef<number | null>(null);
  const [durationExpired, setDurationExpired] = useState(false);
  const [teletypeComplete, setTeletypeComplete] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    // Set timer to track when duration expires
    timerRef.current = window.setTimeout(() => {
      setDurationExpired(true);
    }, duration * 1000);

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
      if (extraDelayRef.current !== null) {
        clearTimeout(extraDelayRef.current);
      }
    };
  }, [duration]);

  // For images, complete immediately when duration expires
  // For text, complete when both duration expires AND teletype finishes (with 1 second extra delay)
  useEffect(() => {
    if (type === 'image' && durationExpired) {
      // Start exit animation
      setIsExiting(true);
      // Wait for animation to complete before calling onComplete
      setTimeout(() => {
        onComplete();
      }, 500); // Match animation duration
    } else if (type === 'text' && durationExpired && teletypeComplete) {
      // Wait 1 extra second after teletype completes
      extraDelayRef.current = window.setTimeout(() => {
        // Start exit animation
        setIsExiting(true);
        // Wait for animation to complete before calling onComplete
        setTimeout(() => {
          onComplete();
        }, 500); // Match animation duration
      }, 1000);
    }
  }, [type, durationExpired, teletypeComplete, onComplete]);

  const handleTeletypeComplete = () => {
    setTeletypeComplete(true);
  };

  if (type === 'image') {
    const imageSrc = `data:${mimeType || 'image/png'};base64,${content}`;
    return (
      <div className={`broadcast-display image-broadcast ${isExiting ? 'exiting' : ''}`}>
        <div className="broadcast-image-container">
          <img src={imageSrc} alt="Broadcast" className="broadcast-image" />
        </div>
      </div>
    );
  }

  return (
    <div className={`broadcast-display text-broadcast ${isExiting ? 'exiting' : ''}`}>
      <div className="broadcast-text-content">
        <Teletype text={content} speed={120} onComplete={handleTeletypeComplete} />
      </div>
    </div>
  );
};

export default BroadcastDisplay;
