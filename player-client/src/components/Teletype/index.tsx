import React, { useState, useEffect, useRef, useContext, createContext } from 'react';
import './style.scss';

// Global context to track autoscroll interrupt state
const AutoScrollContext = createContext<{
  isInterrupted: boolean;
  interrupt: () => void;
}>({ isInterrupted: false, interrupt: () => {} });

export const useAutoScrollInterrupt = () => useContext(AutoScrollContext);

export const AutoScrollProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isInterrupted, setIsInterrupted] = useState(false);
  const interruptTimerRef = useRef<number | null>(null);

  const interrupt = () => {
    setIsInterrupted(true);
    
    // Clear existing timer
    if (interruptTimerRef.current !== null) {
      clearTimeout(interruptTimerRef.current);
    }
    
    // Re-enable after 5 seconds of no scroll activity
    interruptTimerRef.current = window.setTimeout(() => {
      setIsInterrupted(false);
      interruptTimerRef.current = null;
    }, 5000);
  };

  useEffect(() => {
    return () => {
      if (interruptTimerRef.current !== null) {
        clearTimeout(interruptTimerRef.current);
      }
    };
  }, []);

  return (
    <AutoScrollContext.Provider value={{ isInterrupted, interrupt }}>
      {children}
    </AutoScrollContext.Provider>
  );
};

interface TeletypeProps {
  text: string;
  speed?: number; // Characters per second
  onComplete?: () => void;
  className?: string;
  autoScroll?: boolean; // whether to auto scroll into view as it types
  startDelay?: number; // delay before animation begins
  scrollOnStart?: boolean; // scroll once when animation begins
}

const Teletype: React.FC<TeletypeProps> = ({ 
  text, 
  speed = 30, 
  onComplete,
  className = '',
  autoScroll = true,
  startDelay = 0,
  scrollOnStart = false
}) => {
  const [displayedText, setDisplayedText] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const normalizedDelay = Math.max(0, startDelay);
  const { isInterrupted, interrupt } = useAutoScrollInterrupt();
  const prevIsActiveRef = useRef(false);
  const typingTimeoutRef = useRef<number | null>(null);
  const onCompleteRef = useRef(onComplete);
  const textRef = useRef(text);
  const speedRef = useRef(speed);

  // Keep refs up to date
  useEffect(() => {
    onCompleteRef.current = onComplete;
    textRef.current = text;
    speedRef.current = speed;
  });

  // Reset and start animation when text or delay changes
  useEffect(() => {
    setDisplayedText('');
    setCurrentIndex(0);
    prevIsActiveRef.current = false;
    setIsActive(false);

    // Clear any existing typing timeout
    if (typingTimeoutRef.current !== null) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }

    const startTyping = () => {
      setIsActive(true);
      
      // Immediately start the typing loop
      let index = 0;
      const typeNextChar = () => {
        if (index >= textRef.current.length) {
          if (onCompleteRef.current) {
            onCompleteRef.current();
          }
          return;
        }

        setDisplayedText(textRef.current.slice(0, index + 1));
        setCurrentIndex(index + 1);
        index++;

        typingTimeoutRef.current = window.setTimeout(typeNextChar, 1000 / speedRef.current);
      };

      typeNextChar();
    };

    const startTimer = normalizedDelay > 0
      ? window.setTimeout(startTyping, normalizedDelay)
      : window.setTimeout(startTyping, 0);

    return () => {
      clearTimeout(startTimer);
      if (typingTimeoutRef.current !== null) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
    };
  }, [text, normalizedDelay]);

  // Scroll to bottom when text updates (only if not interrupted at that moment)
  useEffect(() => {
    if (autoScroll && !isInterrupted && containerRef.current && displayedText) {
      // Scroll the container into view
      containerRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [displayedText, autoScroll]);

  // Scroll on start (only when isActive transitions from false to true)
  useEffect(() => {
    const wasInactive = !prevIsActiveRef.current;
    const isNowActive = isActive;
    prevIsActiveRef.current = isActive;

    if (scrollOnStart && wasInactive && isNowActive && !isInterrupted && containerRef.current) {
      containerRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [isActive, scrollOnStart]);

  // Detect user scroll to interrupt autoscroll
  useEffect(() => {
    if (!autoScroll && !scrollOnStart) return;

    const handleScroll = () => {
      interrupt();
    };

    const container = document.querySelector('.terminal-content');
    if (container) {
      container.addEventListener('wheel', handleScroll, { passive: true });
      container.addEventListener('touchmove', handleScroll, { passive: true });
    }

    return () => {
      if (container) {
        container.removeEventListener('wheel', handleScroll);
        container.removeEventListener('touchmove', handleScroll);
      }
    };
  }, [autoScroll, scrollOnStart, interrupt]);

  return (
    <div ref={containerRef} className={`teletype ${className}`}>
      <pre>{displayedText}</pre>
      {currentIndex < text.length && <span className="cursor">_</span>}
    </div>
  );
};

export default Teletype;
