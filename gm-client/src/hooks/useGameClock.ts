import { useEffect, useState } from 'react';
import { GameTimeState } from '../types';

export type TickPulse = 'pulse-a' | 'pulse-b';

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

export const useGameClock = (gameTime: GameTimeState) => {
  const [displayTime, setDisplayTime] = useState<GameTimeState>(gameTime);
  const [tickPulse, setTickPulse] = useState<TickPulse>('pulse-a');

  useEffect(() => {
    if (gameTime.is_paused) {
      setDisplayTime(gameTime);
      return;
    }

    const intervalId = setInterval(() => {
      const now = Date.now();
      const elapsedMs = now - gameTime.real_time_ref;
      const elapsedSeconds = Math.floor(elapsedMs / 1000);
      const calculatedTime = addSecondsToTime(gameTime, elapsedSeconds);
      setDisplayTime(calculatedTime);
    }, 100);

    return () => clearInterval(intervalId);
  }, [gameTime]);

  useEffect(() => {
    setTickPulse(prev => (prev === 'pulse-a' ? 'pulse-b' : 'pulse-a'));
  }, [displayTime.second]);

  return { displayTime, tickPulse };
};
