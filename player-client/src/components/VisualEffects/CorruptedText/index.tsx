import { useEffect, useRef } from 'react';
import './style.scss';

function CorruptedText() {
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    const glitchChars = '!@#$%^&*()_+{}[]|\\:;"<>?,./~`0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    
    const corruptText = () => {
      // Find all text nodes in the document
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null
      );

      const textNodes: Text[] = [];
      let node;
      while (node = walker.nextNode()) {
        if (node.textContent && node.textContent.trim().length > 0) {
          textNodes.push(node as Text);
        }
      }

      // Aggressively corrupt many characters with very high frequency
      if (textNodes.length > 0) {
        // Corrupt 3-8 random characters per interval
        const corruptionCount = Math.floor(Math.random() * 6) + 3;
        
        for (let c = 0; c < corruptionCount; c++) {
          if (Math.random() < 0.85) { // 85% chance per corruption attempt
            const randomNode = textNodes[Math.floor(Math.random() * textNodes.length)];
            const text = randomNode.textContent || '';
            
            if (text.length > 1) {
              // Corrupt 1-3 positions per node
              const positionsToCorrupt = Math.floor(Math.random() * 3) + 1;
              let corruptedText = text;
              
              for (let p = 0; p < positionsToCorrupt; p++) {
                const charIndex = Math.floor(Math.random() * corruptedText.length);
                const randomChar = glitchChars[Math.floor(Math.random() * glitchChars.length)];
                corruptedText = corruptedText.substring(0, charIndex) + randomChar + corruptedText.substring(charIndex + 1);
              }
              
              randomNode.textContent = corruptedText;
              
              // Store original for restoration
              const originalText = text;
              
              // Restore after very short time
              setTimeout(() => {
                if (randomNode.textContent === corruptedText) {
                  randomNode.textContent = originalText;
                }
              }, 30 + Math.random() * 100);
            }
          }
        }
      }
    };

    intervalRef.current = window.setInterval(corruptText, 80);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  return null; // This effect doesn't render anything
}

export default CorruptedText;
