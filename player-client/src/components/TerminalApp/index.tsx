import React, { useState, useRef, useEffect } from 'react';
import Teletype from '../Teletype';
import { terminalApi } from '../../services/api';
import { socketService } from '../../services/socket';
import './style.scss';

interface TerminalAppProps {
  appId: string;
  username: string;
  onBackToMenu: () => void;
}

const TerminalApp: React.FC<TerminalAppProps> = ({ appId, username, onBackToMenu }) => {
  const [completedText, setCompletedText] = useState(''); // Text that has finished printing
  const [currentlyPrinting, setCurrentlyPrinting] = useState('Terminal App v2.0 - Type "help" for available commands'); // Text currently animating
  const [currentTextIsRejected, setCurrentTextIsRejected] = useState(false); // Whether current text is a rejection response
  const [inputValue, setInputValue] = useState('');
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  const [isPrinting, setIsPrinting] = useState(true);
  const [pendingExecutionId, setPendingExecutionId] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState<string>('/');
    const formatPrompt = () => `${currentPath || '/'}> `;

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputFieldRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when content changes
  useEffect(() => {
    if (scrollContainerRef.current) {
      setTimeout(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
        }
      }, 0);
    }
  }, [completedText, currentlyPrinting, inputValue]);

  // Listen for terminal command responses from GM
  useEffect(() => {
    const unsubscribe = socketService.on('terminal:command_responded', (payload: any) => {
      console.log('[TerminalApp] Received terminal:command_responded event:', payload);
      console.log('[TerminalApp] Current appId:', appId, 'Payload appId:', payload.data?.appId);
      console.log('[TerminalApp] Current pendingExecutionId:', pendingExecutionId, 'Payload execution id:', payload.data?.execution?.id);
      
      // The payload structure is { event, data: { appId, execution }, timestamp }
      if (payload.data?.appId === appId && payload.data?.execution?.id === pendingExecutionId) {
        console.log('[TerminalApp] Match found! Processing response...');
        
        const isRejected = payload.data.execution.status === 'rejected';
        
        // Determine the response to show
        let responseText = payload.data.execution.response;
        
        // If rejected with no message, show a generic error
        if (isRejected && (!responseText || !responseText.trim())) {
          responseText = 'ERROR: Command execution failed - insufficient permissions or invalid operation';
        }

        // Move current printing to completed, then start printing GM response
        if (currentlyPrinting) {
          setCompletedText((prev) => prev + currentlyPrinting);
        }
        setCurrentlyPrinting('\n' + responseText);
        setCurrentTextIsRejected(isRejected);
        setIsWaitingForResponse(false);
        setIsPrinting(true);
        setPendingExecutionId(null);
      } else {
        console.log('[TerminalApp] No match - ignoring event');
      }
    });

    // Cleanup on unmount
    return () => {
      unsubscribe();
    };
  }, [appId, pendingExecutionId, currentlyPrinting]);

  const handleTeletypeComplete = () => {
    // Move currently printing text to completed text
    setCompletedText((prev) => prev + currentlyPrinting);
    setCurrentlyPrinting('');
    setCurrentTextIsRejected(false); // Reset rejection flag
    setIsPrinting(false);
    inputFieldRef.current?.focus();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isPrinting && !isWaitingForResponse) {
      setInputValue(e.currentTarget.value);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isPrinting && !isWaitingForResponse) {
      e.preventDefault();
      handleSubmitCommand();
    }
  };

  const handleSubmitCommand = async () => {
    const command = inputValue.trim();

    if (!command) {
      return;
    }

    // Add the prompt + command to completed text
    setCompletedText((prev) => prev + '\n' + formatPrompt() + command);
    setInputValue('');

    // Check for exit command (handled client-side)
    if (command.toLowerCase() === 'exit') {
      setCurrentlyPrinting('\nExiting terminal...');
      setCurrentTextIsRejected(false);
      setIsPrinting(true);
      setTimeout(() => {
        onBackToMenu();
      }, 1000);
      return;
    }

    // Execute command via backend
    setIsPrinting(true);
    try {
      const result = await terminalApi.executeCommand(appId, username, command);

      if (result.currentPath) {
        setCurrentPath(result.currentPath);
      }

      if (result.status === 'error') {
        // Error response (command not found or parsing error)
        setCurrentlyPrinting('\n' + result.response);
        setCurrentTextIsRejected(false);
      } else if (result.status === 'pending') {
        // Command requires GM approval
        setPendingExecutionId(result.executionId || null);
        setIsWaitingForResponse(true);
        
        // Show waiting message with teletype
        setCurrentlyPrinting('\nThe command is being executed, please wait ...');
        setCurrentTextIsRejected(false);
        setIsPrinting(true);
      } else if (result.status === 'auto-responded') {
        // Immediate auto-response
        // Handle special exit marker
        if (result.response === '[TERMINAL_EXIT]') {
          setCurrentlyPrinting('\nExiting terminal...');
          setCurrentTextIsRejected(false);
          setTimeout(() => {
            onBackToMenu();
          }, 1000);
        } else {
          setCurrentlyPrinting('\n' + result.response);
          setCurrentTextIsRejected(false);
        }
      }
    } catch (error: any) {
      console.error('Error executing command:', error);
      setCurrentlyPrinting('\nError: ' + error.message);
    }
  };

  return (
    <div className="terminal-app">
      <div className="terminal-content" ref={scrollContainerRef}>
        {completedText && <span className="terminal-completed">{completedText}</span>}
        {currentlyPrinting && (
          <span className={currentTextIsRejected ? 'terminal-rejected' : ''}>
            <Teletype 
              text={currentlyPrinting} 
              speed={120} 
              onComplete={handleTeletypeComplete} 
            />
          </span>
        )}
        {!isPrinting && !isWaitingForResponse && (
          <div className="terminal-input-line">
            <span className="terminal-prompt">{formatPrompt()}</span>
            <input
              ref={inputFieldRef}
              type="text"
              className="terminal-input-inline"
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              autoFocus
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default TerminalApp;


