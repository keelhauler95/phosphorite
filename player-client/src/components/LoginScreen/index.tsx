import React, { useState, useEffect } from 'react';
import Teletype from '../Teletype';
import Prompt from '../Prompt';
import { charactersApi } from '../../services/api';
import { Character } from '../../types';
import './style.scss';

interface LoginScreenProps {
  onLogin: (character: Character) => void;
  loginText?: string;
  systemMessage?: string;
}

type LoginStep = 'welcome' | 'username_prompt' | 'username_input' | 'password_prompt' | 'password_input' | 'authenticating_prompt' | 'error';

const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin, loginText = 'WELCOME TO THE PHOSPHORITE TERMINAL', systemMessage }) => {
  const [step, setStep] = useState<LoginStep>('welcome');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [authDots, setAuthDots] = useState(0);

  useEffect(() => {
    if (step !== 'welcome') {
      return;
    }

    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') {
        return;
      }
      e.preventDefault();
      setStep('username_prompt');
    };

    const handlePointerDown = (e: PointerEvent) => {
      e.preventDefault();
      setStep('username_prompt');
    };

    window.addEventListener('keydown', handleKeyPress);
    window.addEventListener('pointerdown', handlePointerDown, { passive: false });

    return () => {
      window.removeEventListener('keydown', handleKeyPress);
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [step]);

  const handleTeletypeComplete = () => {
    if (step === 'username_prompt') {
      setStep('username_input');
    } else if (step === 'password_prompt') {
      setStep('password_input');
    } else if (step === 'authenticating_prompt') {
      // After "Authenticating..." is shown, wait 2 seconds before redirecting
      setTimeout(() => {
        // The actual login happens in handlePasswordSubmit, so by now
        // the parent component should have been notified and redirected
        // If we're still here after 2 seconds, something went wrong
      }, 2000);
    }
  };

  const handleUsernameSubmit = (value: string) => {
    setUsername(value);
    setStep('password_prompt');
  };

  const handlePasswordSubmit = async (passwordInput: string) => {
    setPassword(passwordInput);
    setStep('authenticating_prompt');
    setAuthDots(0);

    try {
      const character = await charactersApi.login(username, passwordInput);
      
      // Animate dots appearing one by one, then redirect
      let dots = 0;
      const maxDots = 3;
      const dotInterval = setInterval(() => {
        dots++;
        setAuthDots(dots);
        if (dots >= maxDots) {
          clearInterval(dotInterval);
          // Wait a bit more before redirecting
          setTimeout(() => {
            onLogin(character);
          }, 500);
        }
      }, 500); // Each dot appears every 500ms
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
      setStep('error');

      // Reset after error
      setTimeout(() => {
        setStep('welcome');
        setUsername('');
        setPassword('');
        setError('');
      }, 3000);
    }
  };

  return (
    <div className="login-screen">
      {systemMessage && (
        <div className="login-system-message">
          {systemMessage}
        </div>
      )}

      {step === 'welcome' && (
        <Teletype
          text={`${loginText}

Press ENTER or tap to continue.`}
          speed={40}
        />
      )}

      {step === 'username_prompt' && (
        <Teletype
          text={`Username: `}
          speed={60}
          onComplete={handleTeletypeComplete}
        />
      )}

      {step === 'username_input' && (
        <div>
          <div className="login-prompt-line">
            <span>Username: </span>
            <Prompt
              prompt=""
              onSubmit={handleUsernameSubmit}
              autoFocus={true}
            />
          </div>
        </div>
      )}

      {step === 'password_prompt' && (
        <div>
          <div className="login-static-line">Username: {username}</div>
          <Teletype
            text={`Password: `}
            speed={60}
            onComplete={handleTeletypeComplete}
          />
        </div>
      )}

      {step === 'password_input' && (
        <div>
          <div className="login-static-line">Username: {username}</div>
          <div className="login-prompt-line">
            <span>Password: </span>
            <Prompt
              prompt=""
              onSubmit={handlePasswordSubmit}
              password={true}
              autoFocus={true}
            />
          </div>
        </div>
      )}

      {step === 'authenticating_prompt' && (
        <div>
          <div className="login-static-line">Username: {username}</div>
          <div className="login-static-line">Password: {'•'.repeat(password.length)}</div>
          <div className="login-static-line">Authenticating{'.'.repeat(authDots)}</div>
        </div>
      )}

      {step === 'error' && (
        <div className="login-error">
          <div className="error-message">
            ERROR: {error}
          </div>
          <div className="error-retry">
            Returning to login screen...
          </div>
        </div>
      )}
    </div>
  );
};

export default LoginScreen;
