import React, { useState, useMemo, useEffect, useRef } from 'react';
import Teletype from '../Teletype';
import './style.scss';

export interface LogEntry {
  id: string;
  timestamp: string; // Serialized GameTime JSON
  severity: 'info' | 'important' | 'warning' | 'error';
  author: string;
  text: string;
}

export interface LogbookAppProps {
  entries: LogEntry[];
  currentGameTime?: {
    era: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
  } | null;
}

interface GameTime {
  era: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const LogbookApp: React.FC<LogbookAppProps> = ({ entries, currentGameTime }) => {
  const [currentEra, setCurrentEra] = useState(currentGameTime?.era ?? 1);
  const [currentDay, setCurrentDay] = useState(currentGameTime?.day ?? 1);
  const [eraInput, setEraInput] = useState(currentEra.toString());
  const [dayInput, setDayInput] = useState(currentDay.toString());
  const entriesContainerRef = useRef<HTMLDivElement | null>(null);

  // Parse GameTime from JSON string
  const parseGameTime = (jsonStr: string): GameTime => {
    try {
      return JSON.parse(jsonStr);
    } catch {
      return { era: 1, day: 1, hour: 0, minute: 0, second: 0 };
    }
  };

  // Get entries for the current day, sorted by time descending
  const entriesForDay = useMemo(() => {
    return entries
      .filter(entry => {
        const gt = parseGameTime(entry.timestamp);
        return gt.era === currentEra && gt.day === currentDay;
      })
      .sort((a, b) => {
        const gtA = parseGameTime(a.timestamp);
        const gtB = parseGameTime(b.timestamp);
        // Sort by time descending (newest first)
        const timeA = gtA.hour * 10000 + gtA.minute * 100 + gtA.second;
        const timeB = gtB.hour * 10000 + gtB.minute * 100 + gtB.second;
        return timeB - timeA;
      });
  }, [entries, currentEra, currentDay]);

  const scrollPageToTop = () => {
    const container = document.querySelector('.terminal-content') as HTMLElement | null;
    if (container) {
      container.scrollTop = 0;
    }
  };

  useEffect(() => {
    scrollPageToTop();
  }, []);

  const handlePreviousDay = () => {
    if (currentDay > 1) {
      const newDay = currentDay - 1;
      setCurrentDay(newDay);
      setDayInput(newDay.toString());
    } else if (currentEra > 1) {
      const newEra = currentEra - 1;
      setCurrentEra(newEra);
      setCurrentDay(365);
      setEraInput(newEra.toString());
      setDayInput('365');
    } else {
      setCurrentDay(1);
      setDayInput('1');
    }
  };

  const handleNextDay = () => {
    if (currentDay < 365) {
      const newDay = currentDay + 1;
      setCurrentDay(newDay);
      setDayInput(newDay.toString());
    } else {
      const newEra = currentEra + 1;
      setCurrentEra(newEra);
      setCurrentDay(1);
      setEraInput(newEra.toString());
      setDayInput('1');
    }
  };

  const handleGoToDay = () => {
    const era = parseInt(eraInput, 10);
    const day = parseInt(dayInput, 10);

    if (Number.isNaN(era) || era < 0) {
      setEraInput(currentEra.toString());
      return;
    }
    if (Number.isNaN(day) || day <= 0) {
      setDayInput(currentDay.toString());
      return;
    }

    setCurrentEra(era);
    setCurrentDay(day);
  };

  const formatTime = (jsonStr: string): string => {
    const gt = parseGameTime(jsonStr);
    return `${String(gt.hour).padStart(2, '0')}:${String(gt.minute).padStart(2, '0')}:${String(gt.second).padStart(2, '0')}`;
  };

  useEffect(() => {
    if (entriesContainerRef.current) {
      entriesContainerRef.current.scrollTop = 0;
    }
  }, [currentEra, currentDay, entriesForDay.length]);

  return (
    <div className="logbook-app">
      <div className="logbook-controls">
        <button type="button" className="logbook-link" onClick={handlePreviousDay}>
          <Teletype text="< Previous Day" speed={45} autoScroll={false} />
        </button>
        
        <div className="logbook-date-section">
          <div className="logbook-date-inputs">
            <span className="date-label">ERA.</span>
            <input
              type="number"
              inputMode="numeric"
              className="date-input date-input-era"
              value={eraInput}
              onChange={(event) => setEraInput(event.target.value)}
            />
            <span className="date-label">DAY.</span>
            <input
              type="number"
              inputMode="numeric"
              className="date-input date-input-day"
              value={dayInput}
              onChange={(event) => setDayInput(event.target.value)}
            />
          </div>
          <button type="button" className="logbook-link" onClick={handleGoToDay} aria-label="Go to entered date">
            <Teletype text="> Go" speed={45} autoScroll={false} />
          </button>
        </div>

        <button type="button" className="logbook-link logbook-next" onClick={handleNextDay}>
          <Teletype text="Next Day >" speed={45} autoScroll={false} />
        </button>
      </div>

      <div className="logbook-entries" ref={entriesContainerRef}>
        {entriesForDay.length === 0 ? (
          <div className="no-entries">
            <Teletype text="-- No entries for this day --" speed={60} autoScroll={false} />
          </div>
        ) : (
          <div className="entries-list">
            {entriesForDay.map((entry, index) => {
              const time = formatTime(entry.timestamp);
              const severity = entry.severity.toUpperCase();
              const author = entry.author;
              const text = entry.text;
              const entryText = `${time} [${severity}] ${author}\n${text}`;
              return (
                <Teletype
                  key={entry.id}
                  text={entryText}
                  speed={60}
                  className="log-entry"
                  autoScroll={false}
                  startDelay={index * 200}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default LogbookApp;
