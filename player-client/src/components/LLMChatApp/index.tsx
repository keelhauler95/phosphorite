import { useState, useEffect, useRef } from 'react';
import { LLMChatAppData, LLMChatMessage } from '../../types';
import Teletype from '../Teletype';
import { getApiBaseUrl } from '../../utils/runtimeConfig';
import './style.scss';

const LLM_CHAT_API_BASE = `${getApiBaseUrl().replace(/\/+$/, '')}/llm-chat`;

interface Props {
  appId: string;
  appData: LLMChatAppData;
  username: string;
}

function LLMChatApp({ appId, appData, username }: Props) {
  const [completedText, setCompletedText] = useState(''); // Text that has finished printing
  const [currentlyPrinting, setCurrentlyPrinting] = useState(`Connected to ${appData.modelName}\nType your message and press Enter...`); // Text currently animating
  const [conversationHistory, setConversationHistory] = useState<LLMChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isPrinting, setIsPrinting] = useState(true);
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
  }, [completedText, currentlyPrinting, input]);

  const handleTeletypeComplete = () => {
    // Move currently printing text to completed text
    setCompletedText((prev) => prev + currentlyPrinting);
    setCurrentlyPrinting('');
    setIsPrinting(false);
    inputFieldRef.current?.focus();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isPrinting && !isLoading) {
      setInput(e.currentTarget.value);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isPrinting && !isLoading) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading || isPrinting) return;

    const command = input.trim();

    // Add user prompt + message to completed text
    setCompletedText((prev) => prev + '\n> ' + command);
    setInput('');
    setIsLoading(true);

    const userMessage: LLMChatMessage = {
      role: 'user',
      content: command
    };

    try {
      const response = await fetch(`${LLM_CHAT_API_BASE}/${encodeURIComponent(appId)}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: userMessage.content,
          conversationHistory: conversationHistory,
          username: username
        })
      });

      const data = await response.json();

      let responseText: string;
      if (data.success && data.message) {
        responseText = data.message;
        const assistantMessage: LLMChatMessage = {
          role: 'assistant',
          content: data.message
        };
        setConversationHistory(prev => [...prev, userMessage, assistantMessage]);
      } else if (data.error) {
        responseText = data.error;
        const errorMessage: LLMChatMessage = {
          role: 'assistant',
          content: data.error
        };
        setConversationHistory(prev => [...prev, userMessage, errorMessage]);
      } else {
        responseText = `ERROR: ${appData.modelName} does not have a valid reply`;
        const errorMessage: LLMChatMessage = {
          role: 'assistant',
          content: responseText
        };
        setConversationHistory(prev => [...prev, userMessage, errorMessage]);
      }

      // Start printing the response with teletype effect
      setCurrentlyPrinting('\n' + responseText);
      setIsPrinting(true);
    } catch (error) {
      console.error('Failed to send message:', error);
      const errorText = `ERROR: ${appData.modelName} does not have a valid reply`;
      const errorMessage: LLMChatMessage = {
        role: 'assistant',
        content: errorText
      };
      setConversationHistory(prev => [...prev, userMessage, errorMessage]);
      
      // Start printing error with teletype effect
      setCurrentlyPrinting('\n' + errorText);
      setIsPrinting(true);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="llm-chat-app">
      <div className="chat-content" ref={scrollContainerRef}>
        {completedText && <span className="chat-completed">{completedText}</span>}
        {currentlyPrinting && (
          <Teletype
            text={currentlyPrinting}
            speed={40}
            onComplete={handleTeletypeComplete}
          />
        )}
        {!isPrinting && !isLoading && (
          <div className="chat-input-line">
            <span className="chat-prompt">&gt; </span>
            <input
              ref={inputFieldRef}
              type="text"
              className="chat-input"
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              autoFocus
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default LLMChatApp;
