import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Trash2 } from 'lucide-react';
import { GameTimeState, NumericalParameter, TextualParameter } from '../types';
import ThresholdEditor from './ThresholdEditor';
import { getParameterStatus, ParameterStatus } from '../utils/telemetry';

const TELEMETRY_TICK_SECONDS = 1; // backend telemetryService updates every second when game time runs
const TARGET_TOLERANCE_MIN = 0.05;
const TARGET_ERROR_RATIO = 0.01; // must match backend TARGET_ERROR_RATIO
const RESPONSIVENESS_EXPONENT = 7.2; // keeps slider midpoint ≈10 minutes
const RESPONSIVENESS_MIN_SETTLE_SECONDS = 1; // instant case
const RESPONSIVENESS_MAX_SETTLE_SECONDS = 24 * 60 * 60; // ~24 hours
const RESPONSIVENESS_EPSILON = 0.0001;

const pad = (n: number) => n.toString().padStart(2, '0');

const addSecondsToGameTime = (time: GameTimeState, seconds: number): GameTimeState => {
  let era = time.era;
  let day = time.day;
  let hour = time.hour;
  let minute = time.minute;
  let second = time.second + seconds;

  while (second >= 60) { second -= 60; minute += 1; }
  while (second < 0) { second += 60; minute -= 1; }
  while (minute >= 60) { minute -= 60; hour += 1; }
  while (minute < 0) { minute += 60; hour -= 1; }
  while (hour >= 24) { hour -= 24; day += 1; }
  while (hour < 0) { hour += 24; day -= 1; }
  while (day > 365) { day -= 365; era += 1; }
  while (day < 1) {
    if (era > 0) {
      era -= 1;
      day += 365;
    } else {
      day = 1; hour = 0; minute = 0; second = 0;
      break;
    }
  }

  return { ...time, era, day, hour, minute, second };
};

// Compact game-time format requested by UI: ERA.DAYTHH:MM:SS -> e.g. 2.123T14:03:05
const formatGameTimeShort = (time: GameTimeState) => `${time.era}.${time.day}T${pad(time.hour)}:${pad(time.minute)}:${pad(time.second)}`;

const formatEtaDuration = (seconds: number | null) => {
  if (seconds === null || !isFinite(seconds)) return '—';
  if (seconds <= 1) return '-';
  const total = Math.round(seconds);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes && parts.length < 2) parts.push(`${minutes}m`);
  if (!days && !hours && !minutes) parts.push(`${secs}s`);
  return `~${parts.slice(0, 2).join(' ')}`;
};

const clampResponsiveness = (value: number) => Math.max(0, Math.min(1, value));

const sliderToSettleSeconds = (raw: number) => {
  const r = clampResponsiveness(raw);
  if (r <= RESPONSIVENESS_EPSILON) return Infinity;
  if (r >= 1 - RESPONSIVENESS_EPSILON) return RESPONSIVENESS_MIN_SETTLE_SECONDS;
  const pow = Math.pow(1 - r, RESPONSIVENESS_EXPONENT);
  return RESPONSIVENESS_MIN_SETTLE_SECONDS + (RESPONSIVENESS_MAX_SETTLE_SECONDS - RESPONSIVENESS_MIN_SETTLE_SECONDS) * pow;
};

const computeStepFactor = (raw: number) => {
  const clamped = clampResponsiveness(raw);
  if (clamped <= RESPONSIVENESS_EPSILON) return 0;
  if (clamped >= 1 - RESPONSIVENESS_EPSILON) return 1;
  const settleSeconds = sliderToSettleSeconds(clamped);
  if (!isFinite(settleSeconds) || settleSeconds <= 0) return 0;
  return 1 - Math.pow(TARGET_ERROR_RATIO, 1 / settleSeconds);
};

interface ParameterEditorProps {
  parameter: NumericalParameter | TextualParameter | null;
  isNew: boolean;
  compact?: boolean;
  currentGameTime?: GameTimeState;
  onSave: (param: NumericalParameter | TextualParameter) => void;
  onCancel?: () => void;
  onDelete?: () => void;
}

type ParameterType = 'numerical' | 'textual';

function ParameterEditor({ parameter, isNew, compact = false, currentGameTime, onSave, onCancel, onDelete }: ParameterEditorProps) {
  const isNumericalParam = (param: NumericalParameter | TextualParameter): param is NumericalParameter => {
    return 'targetValue' in param;
  };
  
  const isNumerical = parameter ? isNumericalParam(parameter) : true;
  const numericalParam = isNumerical && parameter ? parameter as NumericalParameter : null;
  const textualParam = !isNumerical && parameter ? parameter as TextualParameter : null;
  
  // Common fields
  const [paramType, setParamType] = useState<ParameterType>(isNumerical ? 'numerical' : 'textual');
  const [name, setName] = useState(parameter?.name || '');
  const [unit, setUnit] = useState(parameter?.unit || '');
  
  // Numerical fields
  const [value, setValue] = useState(numericalParam?.value ?? 50);
  const [lowerLimit, setLowerLimit] = useState(numericalParam?.lowerLimit ?? 0);
  const [upperLimit, setUpperLimit] = useState(numericalParam?.upperLimit ?? 100);
  const defaultCriticalLower = lowerLimit + (upperLimit - lowerLimit) * 0.1;
  const defaultCriticalUpper = upperLimit - (upperLimit - lowerLimit) * 0.1;
  const defaultWarningLower = lowerLimit + (upperLimit - lowerLimit) * 0.2;
  const defaultWarningUpper = upperLimit - (upperLimit - lowerLimit) * 0.2;
  
  const [criticalLower, setCriticalLower] = useState(numericalParam?.criticalLower ?? defaultCriticalLower);
  const [criticalUpper, setCriticalUpper] = useState(numericalParam?.criticalUpper ?? defaultCriticalUpper);
  const [warningLower, setWarningLower] = useState(numericalParam?.warningLower ?? defaultWarningLower);
  const [warningUpper, setWarningUpper] = useState(numericalParam?.warningUpper ?? defaultWarningUpper);
  const [targetValue, setTargetValue] = useState(numericalParam?.targetValue ?? 50);
  const [noise, setNoise] = useState(numericalParam?.noise ?? 0);
  const [responsiveness, setResponsiveness] = useState(numericalParam?.responsiveness ?? 0.1);
  
  // Edit mode state
  const [isEditMode, setIsEditMode] = useState(isNew);
  
  // Textual fields
  const [textValue, setTextValue] = useState(textualParam?.value ?? '');
  const [expectedValue, setExpectedValue] = useState(textualParam?.expectedValue ?? '');
  const nameInputRef = useRef<HTMLTextAreaElement | null>(null);
  const statusLabelMap: Record<ParameterStatus, string> = {
    nominal: 'Nominal',
    warning: 'Warning',
    alarm: 'Alarm'
  };
  const snapshotKey = useMemo(() => {
    if (paramType === 'numerical') {
      return JSON.stringify({
        type: 'numerical',
        name: name.trim(),
        unit: unit.trim(),
        lowerLimit,
        upperLimit,
        criticalLower,
        criticalUpper,
        warningLower,
        warningUpper,
        noise,
        responsiveness,
        targetValue
      });
    }
    return JSON.stringify({
      type: 'textual',
      name: name.trim(),
      unit: unit.trim(),
      value: textValue,
      expectedValue
    });
  }, [paramType, name, unit, lowerLimit, upperLimit, criticalLower, criticalUpper, warningLower, warningUpper, noise, responsiveness, targetValue, textValue, expectedValue]);
  const lastSavedKeyRef = useRef(snapshotKey);
  const buildPayload = useCallback((): NumericalParameter | TextualParameter => {
    const trimmedName = name.trim();
    const trimmedUnit = unit.trim();

    if (paramType === 'numerical') {
      const savedValue = (!isNew && parameter && isNumericalParam(parameter))
        ? (parameter as NumericalParameter).value
        : value;

      return {
        name: trimmedName,
        unit: trimmedUnit,
        value: savedValue,
        lowerLimit,
        upperLimit,
        criticalLower,
        criticalUpper,
        warningLower,
        warningUpper,
        noise,
        responsiveness,
        targetValue
      };
    }

    return {
      name: trimmedName,
      unit: trimmedUnit,
      value: textValue,
      expectedValue
    };
  }, [name, unit, paramType, isNew, parameter, value, lowerLimit, upperLimit, criticalLower, criticalUpper, warningLower, warningUpper, noise, responsiveness, targetValue, textValue, expectedValue]);

  const adjustNameHeight = () => {
    const el = nameInputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 110)}px`;
  };

  useEffect(() => {
    adjustNameHeight();
  }, [name, isEditMode]);

  const etaSeconds = useMemo(() => {
    if (!isNumerical) return null;
    const error = Math.abs(targetValue - value);
    if (error === 0) return 0;
    const tolerance = Math.max(TARGET_TOLERANCE_MIN, error * TARGET_ERROR_RATIO);
    if (error <= tolerance) return TELEMETRY_TICK_SECONDS;
    const stepFactor = computeStepFactor(responsiveness);
    if (stepFactor <= 0) return null;
    if (stepFactor >= 1 - RESPONSIVENESS_EPSILON) return TELEMETRY_TICK_SECONDS;
    const decay = 1 - stepFactor;
    if (decay <= 0 || decay >= 1) return TELEMETRY_TICK_SECONDS;
    const ratio = tolerance / error;
    if (ratio <= 0 || ratio >= 1) return TELEMETRY_TICK_SECONDS;
    const steps = Math.log(ratio) / Math.log(decay);
    if (!isFinite(steps) || steps < 0) return TELEMETRY_TICK_SECONDS;
    return Math.max(TELEMETRY_TICK_SECONDS, steps * TELEMETRY_TICK_SECONDS);
  }, [isNumerical, targetValue, value, responsiveness]);

  const etaGameTime = useMemo(() => {
    if (!currentGameTime || etaSeconds === null || !isFinite(etaSeconds)) return null;
    return addSecondsToGameTime(currentGameTime, Math.round(etaSeconds));
  }, [currentGameTime, etaSeconds]);

  const parameterStatus = useMemo<ParameterStatus>(() => {
    if (paramType === 'numerical') {
      const snapshot: NumericalParameter = {
        name,
        unit,
        value,
        lowerLimit,
        upperLimit,
        criticalLower,
        criticalUpper,
        warningLower,
        warningUpper,
        noise,
        responsiveness,
        targetValue
      };
      return getParameterStatus(snapshot);
    }

    const snapshot: TextualParameter = {
      name,
      unit,
      value: textValue,
      expectedValue
    };
    return getParameterStatus(snapshot);
  }, [paramType, name, unit, value, lowerLimit, upperLimit, criticalLower, criticalUpper, warningLower, warningUpper, noise, responsiveness, targetValue, textValue, expectedValue]);

  // Helper to check if two labels overlap based on their position
  // Label width is ~70px, so we need to check if positions are within ~80px
  // Convert to percentage of range for consistency
  // (Overlap detection now handled inside `ThresholdEditor`)

  // Enforce threshold ordering: lowerLimit <= criticalLower <= warningLower <= warningUpper <= criticalUpper <= upperLimit
  const clampThreshold = (value: number, min: number, max: number) => {
    return Math.max(min, Math.min(value, max));
  };

  const handleCriticalLowerChange = (val: number) => {
                const clamped = clampThreshold(val, lowerLimit, warningLower);
                setCriticalLower(clamped);
              };

              const handleWarningLowerChange = (val: number) => {
                const clamped = clampThreshold(val, criticalLower, warningUpper);
                setWarningLower(clamped);
              };

              const handleWarningUpperChange = (val: number) => {
                const clamped = clampThreshold(val, warningLower, criticalUpper);
                setWarningUpper(clamped);
              };

              const handleCriticalUpperChange = (val: number) => {
                const clamped = clampThreshold(val, warningUpper, upperLimit);
                setCriticalUpper(clamped);
              };

              // Update thresholds when limits change
              useEffect(() => {
                if (paramType === 'numerical') {
                  setCriticalLower((prev: number) => clampThreshold(prev, lowerLimit, upperLimit));
                  setCriticalUpper((prev: number) => clampThreshold(prev, lowerLimit, upperLimit));
                  setWarningLower((prev: number) => clampThreshold(prev, lowerLimit, upperLimit));
                  setWarningUpper((prev: number) => clampThreshold(prev, lowerLimit, upperLimit));
                  setTargetValue((prev: number) => clampThreshold(prev, lowerLimit, upperLimit));
                  setValue((prev: number) => clampThreshold(prev, lowerLimit, upperLimit));
                }
              }, [lowerLimit, upperLimit, paramType]);

              // Sync local `value` with incoming prop updates so the current-value marker moves
              useEffect(() => {
                if (isNumerical && parameter) {
                  const incoming = (parameter as NumericalParameter).value;
                  if (typeof incoming === 'number' && incoming !== value) {
                    setValue(incoming);
                  }
                }
                // Only depend on the parameter.value to avoid clobbering other local edits
              }, [parameter && (parameter as NumericalParameter).value]);

              const saveParameter = useCallback((snapshotOverride?: string) => {
                if (!name.trim()) return;
                const payload = buildPayload();
                onSave(payload);
                lastSavedKeyRef.current = snapshotOverride ?? snapshotKey;
              }, [buildPayload, name, onSave, snapshotKey]);

              // Auto-save in compact mode when editable fields change
              useEffect(() => {
                if (!compact || isNew || !parameter) return;
                if (snapshotKey === lastSavedKeyRef.current) return;
                const timer = setTimeout(() => {
                  saveParameter(snapshotKey);
                }, 500);
                return () => clearTimeout(timer);
              }, [compact, isNew, parameter, snapshotKey, saveParameter]);
  const isReadOnly = !isEditMode && !isNew;

  return (
    <div className={`parameter-editor-card ${compact ? 'compact' : ''} status-${parameterStatus}`}>
      <div className="parameter-editor-header">
        <div className="parameter-meta-inline">
          <span className={`parameter-status-dot ${parameterStatus}`} aria-label={`${statusLabelMap[parameterStatus]} status`} />
          <textarea
            ref={nameInputRef}
            rows={1}
            className={`parameter-inline-input name ${!isEditMode && !isNew ? 'read-only' : ''}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            readOnly={!isEditMode && !isNew}
            placeholder="Parameter name"
          />
          <span className="parameter-unit-group">
            <input
              type="text"
              className={`parameter-inline-input unit ${!isEditMode && !isNew ? 'read-only' : ''}`}
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              readOnly={!isEditMode && !isNew}
              placeholder="unit"
            />
          </span>
        </div>
        <div className="parameter-editor-header-right">
          <span className={`parameter-status-pill ${parameterStatus}`}>
            {statusLabelMap[parameterStatus]}
          </span>
          {isNew && (
            <div className="parameter-editor-type-toggle">
              <label>
                <input
                  type="radio"
                  value="numerical"
                  checked={paramType === 'numerical'}
                  onChange={() => setParamType('numerical')}
                />
                Numerical
              </label>
              <label>
                <input
                  type="radio"
                  value="textual"
                  checked={paramType === 'textual'}
                  onChange={() => setParamType('textual')}
                />
                Textual
              </label>
            </div>
          )}
          <div className={`mode-toggle-pill ${isEditMode ? 'is-edit' : 'is-live'}`} role="group" aria-label="Parameter mode">
            <span className="pill-indicator" aria-hidden />
            <button
              type="button"
              className={!isEditMode ? 'active' : ''}
              onClick={() => setIsEditMode(false)}
              aria-pressed={!isEditMode}
              disabled={isNew}
            >
              Live
            </button>
            <button
              type="button"
              className={isEditMode ? 'active' : ''}
              onClick={() => setIsEditMode(true)}
              aria-pressed={isEditMode}
            >
              Edit
            </button>
          </div>
          {onDelete && (
            <button className="ghost-btn icon danger square" onClick={onDelete} title="Delete parameter">
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="parameter-editor-body">
        {paramType === 'numerical' ? (
          <div className="parameter-section">
            <ThresholdEditor
              lowerLimit={lowerLimit}
              upperLimit={upperLimit}
              criticalLower={criticalLower}
              criticalUpper={criticalUpper}
              warningLower={warningLower}
              warningUpper={warningUpper}
              targetValue={targetValue}
              value={value}
              noise={noise}
              responsiveness={responsiveness}
              isEditMode={isEditMode}
              onLowerLimitChange={setLowerLimit}
              onUpperLimitChange={setUpperLimit}
              onCriticalLowerChange={handleCriticalLowerChange}
              onCriticalUpperChange={handleCriticalUpperChange}
              onWarningLowerChange={handleWarningLowerChange}
              onWarningUpperChange={handleWarningUpperChange}
              onTargetChange={(v) => setTargetValue(v)}
              onNoiseChange={(v) => setNoise(v)}
              onResponsivenessChange={(v) => setResponsiveness(v)}
            />
          </div>
        ) : (
          <div className="parameter-section">
            <div className="parameter-field-row">
              <label>
                Current Value
                <input
                  type="text"
                  className={`text-parameter-input ${isReadOnly ? 'read-only' : ''}`}
                  value={textValue}
                  onChange={(e) => setTextValue(e.target.value)}
                  placeholder="Current text value"
                  readOnly={isReadOnly}
                />
              </label>
              <label>
                Expected Value
                <input
                  type="text"
                  className={`text-parameter-input ${isReadOnly ? 'read-only' : ''}`}
                  value={expectedValue}
                  onChange={(e) => setExpectedValue(e.target.value)}
                  placeholder="Expected text value (optional)"
                  readOnly={isReadOnly}
                />
              </label>
            </div>
          </div>
        )}

        <div className="parameter-stats-row">
            <div className="parameter-stat-card eta">
              <span className="parameter-stat-label">ETA</span>
              <span className="parameter-stat-value">{isNumerical ? formatEtaDuration(etaSeconds) : '—'}</span>
            </div>
            <div className="parameter-stat-card target-time">
              <span className="parameter-stat-label">Target Reached At</span>
              <span className="parameter-stat-value">{isNumerical && etaGameTime ? formatGameTimeShort(etaGameTime) : '—'}</span>
            </div>
        </div>

        {!compact && (
          <div className="parameter-editor-actions">
            <button className="primary-btn" onClick={() => saveParameter()} disabled={!name.trim()}>
              Save Parameter
            </button>
            {onCancel && (
              <button className="ghost-btn" onClick={onCancel}>
                Cancel
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ParameterEditor;
