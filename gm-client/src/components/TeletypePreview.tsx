import { useEffect, useRef, useState } from 'react';

interface TeletypePreviewProps {
  text: string;
  speed?: number;
  onComplete?: () => void;
}

const DEFAULT_SPEED = 120;

function TeletypePreview({ text, speed = DEFAULT_SPEED, onComplete }: TeletypePreviewProps) {
  const [displayedText, setDisplayedText] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const typingTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    setDisplayedText('');
    setCurrentIndex(0);
  }, [text]);

  useEffect(() => {
    if (currentIndex < text.length) {
      typingTimeoutRef.current = window.setTimeout(() => {
        setDisplayedText((prev) => prev + text[currentIndex]);
        setCurrentIndex((prev) => prev + 1);
      }, 1000 / speed);
    } else if (currentIndex === text.length && onComplete) {
      onComplete();
    }

    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
    };
  }, [currentIndex, text, speed, onComplete]);

  return (
    <div className="preview-teletype">
      <pre>{displayedText}</pre>
      {currentIndex < text.length && <span className="preview-cursor">_</span>}
    </div>
  );
}

export default TeletypePreview;
