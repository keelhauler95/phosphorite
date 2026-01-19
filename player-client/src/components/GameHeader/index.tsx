import React, { useState, useEffect } from 'react';
import { GameTimeState } from '../../types';
import './style.scss';

interface GameHeaderProps {
  username: string;
  gameTime: GameTimeState | null;
  headerText?: string;
}

const GameHeader: React.FC<GameHeaderProps> = React.memo(({ username, gameTime, headerText = 'PHOSPHORITE' }) => {
  const [displayTime, setDisplayTime] = useState<GameTimeState | null>(gameTime);

  const addSecondsToTime = (time: GameTimeState, seconds: number): GameTimeState => {
    let { era, day, hour, minute, second } = time;

    second += seconds;

    while (second >= 60) {
      second -= 60;
      minute += 1;
    }

    while (minute >= 60) {
      minute -= 60;
      hour += 1;
    }

    while (hour >= 24) {
      hour -= 24;
      day += 1;
    }

    while (day > 365) {
      day -= 365;
      era += 1;
    }

    return { ...time, era, day, hour, minute, second };
  };

  // Update display time every 100ms when running
  useEffect(() => {
    if (!gameTime) {
      setDisplayTime(null);
      return;
    }

    if (gameTime.is_paused) {
      // When paused, just show the current game time
      setDisplayTime(gameTime);
      return;
    }

    // Initialize display time immediately
    const now = Date.now();
    const elapsedMs = now - gameTime.real_time_ref;
    const elapsedSeconds = Math.floor(elapsedMs / 1000);
    const initialTime = addSecondsToTime(gameTime, elapsedSeconds);
    setDisplayTime(initialTime);

    // When running, calculate elapsed time and update display
    const intervalId = setInterval(() => {
      const now = Date.now();
      const elapsedMs = now - gameTime.real_time_ref;
      const elapsedSeconds = Math.floor(elapsedMs / 1000);

      const calculatedTime = addSecondsToTime(gameTime, elapsedSeconds);
      setDisplayTime(calculatedTime);
    }, 100); // Update every 100ms for smooth display

    return () => clearInterval(intervalId);
  }, [gameTime]);

  const formatGameTime = (time: GameTimeState | null): string => {
    if (!time) return '0.0 00:00:00';
    const hours = String(time.hour).padStart(2, '0');
    const minutes = String(time.minute).padStart(2, '0');
    const seconds = String(time.second).padStart(2, '0');
    return `${time.era}.${time.day} ${hours}:${minutes}:${seconds}`;
  };

  return (
    <>
      <div className="game-header">
        <span className="game-header-left">{headerText} | USER: {username}</span>
        <span className="game-header-right">{formatGameTime(displayTime)}</span>
      </div>
      <div className="game-header-separator"></div>
    </>
  );
});

GameHeader.displayName = 'GameHeader';

export default GameHeader;
