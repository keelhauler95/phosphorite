import { useState } from 'react';
import {
  CalendarClock,
  Check,
  ChevronDown,
  ChevronUp,
  Edit3,
  Minus,
  Pause,
  Play,
  Plus,
  X
} from 'lucide-react';
import { GameTimeState } from '../types';
import { gameTimeApi } from '../services/api';
import { useGameClock } from '../hooks/useGameClock';

interface Props {
  gameTime: GameTimeState;
  isConnected: boolean;
  onTimeUpdate: (time: GameTimeState) => void;
  variant?: 'full' | 'controls';
  lockedMode?: 'clock' | 'set';
}

const TIME_CONTROLS = [
  { label: '1h', adjustment: { hours: 1 }, description: '1 hour' },
  { label: '1m', adjustment: { minutes: 1 }, description: '1 minute' },
  { label: '1s', adjustment: { seconds: 1 }, description: '1 second' }
];

const DATE_CONTROLS = [
  { label: '1d', adjustment: { days: 1 }, description: '1 day' },
  { label: '1E', adjustment: { days: 365 }, description: '1 era' }
];

type TimeFieldKey = 'era' | 'day' | 'hour' | 'minute' | 'second';

interface TimeFieldConfig {
  key: TimeFieldKey;
  label: string;
  min: number;
  max?: number;
}

const SET_TIME_FIELDS: TimeFieldConfig[] = [
  { key: 'era', label: 'Era', min: 0 },
  { key: 'day', label: 'Day', min: 1, max: 365 },
  { key: 'hour', label: 'Hour', min: 0, max: 23 },
  { key: 'minute', label: 'Minute', min: 0, max: 59 },
  { key: 'second', label: 'Second', min: 0, max: 59 }
];

type TimeFormState = Record<TimeFieldKey, number>;

const DEFAULT_TIME_FORM: TimeFormState = {
  era: 0,
  day: 1,
  hour: 0,
  minute: 0,
  second: 0
};

function GameTimeBar({ gameTime, isConnected, onTimeUpdate, variant = 'full', lockedMode }: Props) {
  const [setTimeForm, setSetTimeForm] = useState<TimeFormState>(() => ({
    era: gameTime.era ?? DEFAULT_TIME_FORM.era,
    day: gameTime.day ?? DEFAULT_TIME_FORM.day,
    hour: gameTime.hour ?? DEFAULT_TIME_FORM.hour,
    minute: gameTime.minute ?? DEFAULT_TIME_FORM.minute,
    second: gameTime.second ?? DEFAULT_TIME_FORM.second
  }));
  const [showSetTime, setShowSetTime] = useState(() => lockedMode === 'set');
  const { displayTime, tickPulse } = useGameClock(gameTime);
  const isControlsOnly = variant === 'controls';
  const isSetMode = lockedMode ? lockedMode === 'set' : showSetTime;

  const handlePauseResume = async () => {
    try {
      const response = gameTime.is_paused ? await gameTimeApi.resume() : await gameTimeApi.pause();
      onTimeUpdate(response.data);
    } catch (error) {
      console.error('Failed to toggle pause:', error);
    }
  };

  const handleAdvance = async (seconds = 0, minutes = 0, hours = 0, days = 0) => {
    try {
      const response = await gameTimeApi.advance({ seconds, minutes, hours, days });
      onTimeUpdate(response.data);
    } catch (error) {
      console.error('Failed to advance time:', error);
    }
  };

  const handleRollback = async (seconds = 0, minutes = 0, hours = 0, days = 0) => {
    try {
      const response = await gameTimeApi.rollback({ seconds, minutes, hours, days });
      onTimeUpdate(response.data);
    } catch (error) {
      console.error('Failed to rollback time:', error);
    }
  };

  const handleSetTime = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await gameTimeApi.setTime(setTimeForm);
      onTimeUpdate(response.data);
      if (!lockedMode) {
        setShowSetTime(false);
      }
    } catch (error) {
      console.error('Failed to set time:', error);
      alert('Failed to set time');
    }
  };

  const openSetTime = () => {
    setSetTimeForm({
      era: displayTime.era,
      day: displayTime.day,
      hour: displayTime.hour,
      minute: displayTime.minute,
      second: displayTime.second
    });
    if (!lockedMode) {
      setShowSetTime(true);
    }
  };

  const getFieldConfig = (key: TimeFieldKey) => SET_TIME_FIELDS.find((field) => field.key === key)!;

  const clampValue = (value: number, min: number, max?: number) => {
    const upperBound = typeof max === 'number' ? max : Number.POSITIVE_INFINITY;
    return Math.min(Math.max(value, min), upperBound);
  };

  const handleFieldChange = (key: TimeFieldKey, rawValue: number) => {
    const { min, max } = getFieldConfig(key);
    const sanitized = Number.isNaN(rawValue) ? min : rawValue;
    setSetTimeForm((prev) => ({
      ...prev,
      [key]: clampValue(sanitized, min, max)
    }));
  };

  const adjustInlineField = (key: TimeFieldKey, delta: number) => {
    const { min, max } = getFieldConfig(key);
    setSetTimeForm((prev) => ({
      ...prev,
      [key]: clampValue(prev[key] + delta, min, max)
    }));
  };

  const renderDigit = (value: number) => value.toString().padStart(2, '0');

  const applyStep = (
    direction: 'advance' | 'rollback',
    adjustment: Partial<Record<'seconds' | 'minutes' | 'hours' | 'days', number>>
  ) => {
    const seconds = adjustment.seconds || 0;
    const minutes = adjustment.minutes || 0;
    const hours = adjustment.hours || 0;
    const days = adjustment.days || 0;

    if (direction === 'advance') {
      handleAdvance(seconds, minutes, hours, days);
    } else {
      handleRollback(seconds, minutes, hours, days);
    }
  };

  const cardModeClass = isSetMode ? 'mode-set' : 'mode-clock';
  const panelVariantClass = isControlsOnly ? 'controls-only' : '';

  return (
    <div className="game-time-bar">
      <div className={`game-time-card ${gameTime.is_paused ? 'paused' : 'running'} ${cardModeClass}`}>
        <div className="card-veil" aria-hidden="true" />
        {isSetMode ? (
          <div className="spectral-panel set-panel">
            <form className="inline-set-time" onSubmit={handleSetTime}>
              <div className="inline-set-heading">
                <div className="time-icon">
                  <CalendarClock size={18} />
                </div>
                <span className="inline-set-title">Set Game Clock</span>
                <div className="inline-heading-actions">
                  {!lockedMode && (
                    <button
                      type="button"
                      className="inline-action-btn"
                      onClick={() => setShowSetTime(false)}
                      aria-label="Cancel set time"
                    >
                      <X size={14} />
                    </button>
                  )}
                  <button
                    type="submit"
                    className="inline-action-btn primary"
                    disabled={!isConnected}
                    aria-label="Apply new game time"
                  >
                    <Check size={14} />
                  </button>
                </div>
              </div>
              <div className="inline-set-grid">
                {SET_TIME_FIELDS.map(({ key, label, min, max }) => {
                  const fieldId = `set-${key}`;
                  const value = setTimeForm[key];
                  const atMin = value <= min;
                  const atMax = typeof max === 'number' ? value >= max : false;

                  return (
                    <div className="inline-field" key={key}>
                      <label className="sr-only" htmlFor={fieldId}>
                        {label}
                      </label>
                      <div className="inline-input-shell">
                        <input
                          id={fieldId}
                          type="number"
                          min={min}
                          max={max}
                          value={value}
                          placeholder={label}
                          aria-label={label}
                          onChange={(e) => handleFieldChange(key, parseInt(e.target.value, 10))}
                        />
                        <div className="inline-input-arrows">
                          <button
                            type="button"
                            onClick={() => adjustInlineField(key, 1)}
                            disabled={atMax}
                            aria-label={`Increase ${label}`}
                          >
                            <ChevronUp size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => adjustInlineField(key, -1)}
                            disabled={atMin}
                            aria-label={`Decrease ${label}`}
                          >
                            <ChevronDown size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </form>
          </div>
        ) : (
          <div className={`spectral-panel clock-panel ${panelVariantClass}`}>
            <div className="game-time-lines">
              <div className={`date-line ${panelVariantClass}`}>
                {!isControlsOnly && (
                  <div className="line-labels">
                    <div className="time-icon">
                      <CalendarClock size={18} />
                    </div>
                    <div className="date-labels">
                      <span className="time-era">Era {displayTime.era}</span>
                      <span className="time-day">Day {displayTime.day}</span>
                    </div>
                  </div>
                )}
                <div className={`time-step-group time-top-controls ${isControlsOnly ? 'condensed' : ''}`}>
                  <button className="set-time-chip" onClick={openSetTime} disabled={!isConnected}>
                    <Edit3 size={14} />
                    Set
                  </button>
                  {DATE_CONTROLS.map(({ label, adjustment, description }) => (
                    <div className="time-step-control" key={label}>
                      <button
                        type="button"
                        onClick={() => applyStep('rollback', adjustment)}
                        disabled={!isConnected}
                        title={`Subtract ${description}`}
                        aria-label={`Subtract ${description}`}
                      >
                        <Minus size={14} strokeWidth={2.5} />
                      </button>
                      <span>{label}</span>
                      <button
                        type="button"
                        onClick={() => applyStep('advance', adjustment)}
                        disabled={!isConnected}
                        title={`Add ${description}`}
                        aria-label={`Add ${description}`}
                      >
                        <Plus size={14} strokeWidth={2.5} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div className={`clock-line ${panelVariantClass}`}>
                {!isControlsOnly && (
                  <span
                    key={tickPulse}
                    className={`time-digits ${tickPulse} ${gameTime.is_paused ? 'paused' : 'running'}`}
                  >
                    {renderDigit(displayTime.hour)}:{renderDigit(displayTime.minute)}:{renderDigit(displayTime.second)}
                  </span>
                )}
                <div className={`time-step-group ${isControlsOnly ? 'condensed' : ''}`}>
                  {TIME_CONTROLS.map(({ label, adjustment, description }) => (
                    <div className="time-step-control" key={label}>
                      <button
                        type="button"
                        onClick={() => applyStep('rollback', adjustment)}
                        disabled={!isConnected}
                        title={`Subtract ${description}`}
                        aria-label={`Subtract ${description}`}
                      >
                        <Minus size={14} strokeWidth={2.5} />
                      </button>
                      <span>{label}</span>
                      <button
                        type="button"
                        onClick={() => applyStep('advance', adjustment)}
                        disabled={!isConnected}
                        title={`Add ${description}`}
                        aria-label={`Add ${description}`}
                      >
                        <Plus size={14} strokeWidth={2.5} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {!isControlsOnly && (
              <div className="time-side-actions">
                <button
                  className={`time-toggle-btn ${gameTime.is_paused ? 'paused' : 'running'}`}
                  onClick={handlePauseResume}
                  disabled={!isConnected}
                  aria-label={gameTime.is_paused ? 'Resume game time' : 'Pause game time'}
                  title={gameTime.is_paused ? 'Resume' : 'Pause'}
                >
                  {gameTime.is_paused ? <Play size={24} /> : <Pause size={24} />}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default GameTimeBar;
