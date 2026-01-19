import React, { useState, useEffect, useRef } from 'react';
import { GameApp, Message, GameTimeState } from '../../types';
import GameHeader from '../GameHeader';
import Teletype from '../Teletype';
import './style.scss';

interface MainMenuProps {
  username: string;
  apps: GameApp[];
  messages: Message[];
  gameTime: GameTimeState | null;
  headerText?: string;
  onSelectApp: (app: GameApp) => void;
  onSelectMail: () => void;
  onLogout: () => void;
  commsEnabled?: boolean;
}

const MainMenu: React.FC<MainMenuProps> = ({
  username,
  apps,
  messages,
  gameTime,
  headerText,
  onSelectApp,
  onSelectMail,
  onLogout,
  commsEnabled = true
}) => {
  const unreadCount = messages.filter(m => !m.read_status?.[username]).length;
  const [showMailUnreadBadge, setShowMailUnreadBadge] = useState(false);
  const delayIncrementMs = 200; // 0.2s stagger
  const appDelayOffset = commsEnabled ? 1 : 0;
  const logoutDelayIndex = (commsEnabled ? 1 : 0) + apps.length;
  const badgeTimerRef = useRef<number | null>(null);

  // Reset badge animation when component mounts or messages change
  useEffect(() => {
    setShowMailUnreadBadge(false);
    if (badgeTimerRef.current !== null) {
      clearTimeout(badgeTimerRef.current);
      badgeTimerRef.current = null;
    }
  }, [messages.length]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (badgeTimerRef.current !== null) {
        clearTimeout(badgeTimerRef.current);
      }
    };
  }, []);

  const handleCommsTeletypeComplete = () => {
    // Defer the state update to avoid re-rendering during sibling Teletype initialization
    if (badgeTimerRef.current !== null) {
      clearTimeout(badgeTimerRef.current);
    }
    badgeTimerRef.current = window.setTimeout(() => {
      setShowMailUnreadBadge(true);
      badgeTimerRef.current = null;
    }, 0);
  };

  return (
    <div className="main-menu">
      <GameHeader username={username} gameTime={gameTime} headerText={headerText} />

      <div className="menu-content">
        {(commsEnabled || apps.length > 0) && (
          <div className="menu-section menu-list">
            {commsEnabled && (
              <div className="menu-entry" key="comms">
                <span className="menu-link" onClick={onSelectMail}>
                  <Teletype 
                    text="> Comms" 
                    speed={28} 
                    onComplete={handleCommsTeletypeComplete}
                    autoScroll={false}
                    startDelay={0}
                    scrollOnStart={true}
                  />
                </span>
                {showMailUnreadBadge && unreadCount > 0 && (
                  <span className="unread-badge">
                    <Teletype 
                      text={` (${unreadCount} unread)`} 
                      speed={35} 
                      autoScroll={false}
                      startDelay={0}
                    />
                  </span>
                )}
              </div>
            )}

            {apps.map((app, index) => {
              // Random speed between 20 and 40 cps, seeded by app id for consistency
              const speed = 20 + (parseInt(app.id.toString().split('').reduce((a, b) => a + b.charCodeAt(0), 0).toString().slice(-2)) % 21);
              const startDelayMs = (appDelayOffset + index) * delayIncrementMs;
              
              return (
                <div className="menu-entry" key={app.id}>
                  <span className="menu-link" onClick={() => onSelectApp(app)}>
                    <Teletype 
                      text={`> ${app.name}`} 
                      speed={speed} 
                      autoScroll={false}
                      startDelay={startDelayMs}
                      scrollOnStart={true}
                    />
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div className="menu-section">
          <span className="menu-link" onClick={onLogout}>
            <Teletype 
              text="> Logout" 
              speed={30} 
              autoScroll={false}
              startDelay={logoutDelayIndex * delayIncrementMs}
              scrollOnStart={true}
            />
          </span>
        </div>
      </div>
    </div>
  );
};

export default MainMenu;
