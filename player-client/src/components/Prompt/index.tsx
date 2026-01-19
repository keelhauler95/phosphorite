import React, { useState, useEffect, useRef, useCallback } from 'react';
import './style.scss';

interface PromptProps {
  prompt?: string;
  onSubmit?: (value: string) => void;
  className?: string;
  disabled?: boolean;
  password?: boolean;
  autoFocus?: boolean;
}

const Prompt: React.FC<PromptProps> = ({ 
  prompt = '$> ',
  onSubmit,
  className = '',
  disabled = false,
  password = false,
  autoFocus = false
}) => {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const characterPattern = useRef(/[a-zA-Z0-9 ,.<>/?;:'"\[\]{}\-_=+`~!@#$%^&*()\\|]/);

  const focusInput = useCallback(() => {
    if (disabled) {
      return;
    }

    const input = inputRef.current;
    if (!input) {
      return;
    }

    try {
      input.focus({ preventScroll: true });
    } catch {
      input.focus();
    }

    const end = input.value.length;
    input.setSelectionRange(end, end);
  }, [disabled]);

  useEffect(() => {
    if (disabled) {
      inputRef.current?.blur();
      return;
    }

    if (autoFocus) {
      const frame = requestAnimationFrame(() => {
        focusInput();
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [autoFocus, disabled, focusInput]);

  const sanitizeInput = useCallback((text: string) => {
    if (!text) {
      return '';
    }

    let next = '';
    for (const char of text) {
      if (characterPattern.current.test(char)) {
        next += char;
      }
    }
    return next;
  }, []);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) {
      return;
    }
    const sanitized = sanitizeInput(event.target.value);
    setValue(sanitized);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) {
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      if (onSubmit && value.trim()) {
        onSubmit(value.trim());
        setValue('');
      }
    }
  };

  const handleClick = () => {
    focusInput();
  };

  const displayValue = password ? '•'.repeat(value.length) : value;

  return (
    <div 
      className={`__prompt__ ${disabled ? 'disabled' : ''} ${className}`}
      onClick={handleClick}
    >
      <input
        ref={inputRef}
        className="prompt-input"
        type={password ? 'password' : 'text'}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        inputMode="text"
      />
      <span className="prompt">{prompt}</span>
      <span className="input">{displayValue}</span>
      <span className="cursor">_</span>
    </div>
  );
};

export default Prompt;
