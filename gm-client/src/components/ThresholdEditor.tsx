import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

interface ThresholdEditorProps {
  lowerLimit: number;
  upperLimit: number;
  criticalLower: number;
  criticalUpper: number;
  warningLower: number;
  warningUpper: number;
  targetValue: number;
  value: number;
  noise: number;
  responsiveness: number;
  isEditMode?: boolean;
  onLowerLimitChange: (v: number) => void;
  onUpperLimitChange: (v: number) => void;
  onCriticalLowerChange: (v: number) => void;
  onCriticalUpperChange: (v: number) => void;
  onWarningLowerChange: (v: number) => void;
  onWarningUpperChange: (v: number) => void;
  onTargetChange: (v: number) => void;
  onNoiseChange: (v: number) => void;
  onResponsivenessChange: (v: number) => void;
}

type ThresholdLabelStyle = CSSProperties & { ['--threshold-translate-y']?: string };

const ThresholdEditor = ({
  lowerLimit,
  upperLimit,
  criticalLower,
  criticalUpper,
  warningLower,
  warningUpper,
  targetValue,
  value,
  noise,
  responsiveness,
  isEditMode = false,
  onLowerLimitChange,
  onUpperLimitChange,
  onCriticalLowerChange,
  onCriticalUpperChange,
  onWarningLowerChange,
  onWarningUpperChange,
  onTargetChange,
  onNoiseChange,
  onResponsivenessChange
}: ThresholdEditorProps) => {
  const range = Math.max(upperLimit - lowerLimit, 1e-6);
  const maxNoise = Math.max(range * 0.2, 1e-6);

  const thresholdBarRef = useRef<HTMLDivElement | null>(null);
  const currentValueRef = useRef<HTMLDivElement | null>(null);
  const canAdjustBehavior = true;
  const [barHeight, setBarHeight] = useState<number>(48);
  const [barWidth, setBarWidth] = useState<number>(320);
  const [currentExpanded, setCurrentExpanded] = useState<boolean>(false);
  const [wavePhase, setWavePhase] = useState<number>(0);
  const animRef = useRef<number | null>(null);

  useEffect(() => {
    const el = thresholdBarRef.current;
    const measure = () => {
      if (el) {
        setBarHeight(el.clientHeight || 48);
        setBarWidth(el.clientWidth || 320);
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  useEffect(() => {
    let last = performance.now();
    const loop = (now: number) => {
      const dt = (now - last) / 1000; last = now;
      setWavePhase((p) => p + dt * 6);
      animRef.current = requestAnimationFrame(loop);
    };
    if (noise && noise > 0) {
      animRef.current = requestAnimationFrame(loop);
    }
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); animRef.current = null; };
  }, [noise]);

  const clampedNoise = Math.max(0, Math.min(noise, maxNoise));
  const noiseSpanPx = barWidth > 0 ? (clampedNoise / range) * barWidth * 2 : 0;
  const waveWidth = Math.max(2, Math.min(barWidth || 80, noiseSpanPx || 2));

  const wavePathD = (() => {
    const w = waveWidth;
    const h = Math.max(1, barHeight);
    const steps = 48;
    const amp = clampedNoise <= 0 ? 0 : w / 2;
    const freq = 1.2;
    const exponent = 2.2;

    const offsetTarget = 0; // don't offset by target here — the svg is placed at current value

    let d = '';
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const y = t * h;
      const envelope = Math.sin(Math.PI * t);
      const s = Math.sin(wavePhase + i * freq);
      const sharp = Math.sign(s) * Math.pow(Math.abs(s), exponent);
      const x = w / 2 + offsetTarget + sharp * amp * envelope;
      if (i === 0) d = `M ${x.toFixed(2)} ${y.toFixed(2)}`;
      else d += ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
    }
    return d;
  })();


  const LABEL_OFFSET = 8;
  const ROW_SPACING = 22;

  // Build label objects
  const labels = [
    { key: 'criticalLower', pos: criticalLower, type: 'critical', onChange: onCriticalLowerChange },
    { key: 'warningLower', pos: warningLower, type: 'warning', onChange: onWarningLowerChange },
    { key: 'target', pos: targetValue, type: 'target', onChange: onTargetChange },
    { key: 'warningUpper', pos: warningUpper, type: 'warning', onChange: onWarningUpperChange },
    { key: 'criticalUpper', pos: criticalUpper, type: 'critical', onChange: onCriticalUpperChange }
  ];

  // priority: target (3) > critical (2) > warning (1)
  const priorityOf = (t: string) => (t === 'target' ? 3 : t === 'critical' ? 2 : 1);
  const labelWidthPercent = 15; // approx percent of range reserved for a label

  // Place labels: try to keep high-priority labels on the top row; conflicting labels go to successive bottom rows
  const placedTop: Array<{ key: string; left: number }> = [];
  const bottomRows: Array<Array<{ key: string; left: number }>> = [];

  labels
    .slice()
    .sort((a, b) => priorityOf(b.type) - priorityOf(a.type))
    .forEach((lbl) => {
      const leftPercent = ((lbl.pos - lowerLimit) / range) * 100;
      // check overlap with top
      const overlapsTop = placedTop.some((p) => Math.abs(p.left - leftPercent) < labelWidthPercent);
      if (!overlapsTop) {
        placedTop.push({ key: lbl.key, left: leftPercent });
      } else {
        // find a bottom row that doesn't overlap
        let placed = false;
        for (let r = 0; r < bottomRows.length; r++) {
          const row = bottomRows[r];
          const overlaps = row.some((p) => Math.abs(p.left - leftPercent) < labelWidthPercent);
          if (!overlaps) {
            row.push({ key: lbl.key, left: leftPercent });
            placed = true;
            break;
          }
        }
        if (!placed) {
          bottomRows.push([{ key: lbl.key, left: leftPercent }]);
        }
      }
    });

  // helper to get label placement
  const getLabelPlacement = (key: string) => {
    const top = placedTop.find((p) => p.key === key);
    if (top) return { row: -1, left: top.left };
    for (let r = 0; r < bottomRows.length; r++) {
      const found = bottomRows[r].find((p) => p.key === key);
      if (found) return { row: r, left: found.left };
    }
    // fallback: top
    return { row: -1, left: ((labels.find((l) => l.key === key)!.pos - lowerLimit) / range) * 100 };
  };

  // refs for each label so we can read/edit values in place without remounting
  const labelRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [editingValues, setEditingValues] = useState<Record<string, string>>({});

  // Initialize and sync editing buffers from props unless the input is focused
  useEffect(() => {
    const newVals = { ...editingValues };
    labels.forEach((lbl) => {
      const el = labelRefs.current[lbl.key];
      if (!el || !el.contains(document.activeElement)) {
        newVals[lbl.key] = lbl.pos.toFixed(2);
      }
    });
    // min/max
    const minEl = labelRefs.current['min'];
    if (!minEl || !minEl.contains(document.activeElement)) newVals['min'] = lowerLimit.toString();
    const maxEl = labelRefs.current['max'];
    if (!maxEl || !maxEl.contains(document.activeElement)) newVals['max'] = upperLimit.toString();
    setEditingValues(newVals);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labels.map((l) => l.pos).join(','), lowerLimit, upperLimit]);

  // close expanded panel when clicking outside
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (currentExpanded) {
        const el = currentValueRef.current;
        if (el && !el.contains(e.target as Node)) setCurrentExpanded(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [currentExpanded]);

  // when expanded, allow the parameter card to overflow so the panel can extend outside
  useEffect(() => {
    const el = currentValueRef.current;
    if (!el) return;
    const card = el.closest('.parameter-editor-card') as HTMLElement | null;
    if (!card) return;
    if (currentExpanded) card.classList.add('allow-overflow');
    else card.classList.remove('allow-overflow');
    return () => { card.classList.remove('allow-overflow'); };
  }, [currentExpanded]);

  return (
    <div className="threshold-visualizer">
      <div className="threshold-bar-container">
        <div className={`threshold-bar ${isEditMode ? 'edit-mode' : 'live-mode'}`} ref={thresholdBarRef}>
          <div className="threshold-zone zone-critical-lower" style={{ left: '0%', width: `${((criticalLower - lowerLimit) / range) * 100}%` }} />
          <div className="threshold-zone zone-warning-lower" style={{ left: `${((criticalLower - lowerLimit) / range) * 100}%`, width: `${((warningLower - criticalLower) / range) * 100}%` }} />
          <div className="threshold-zone zone-normal" style={{ left: `${((warningLower - lowerLimit) / range) * 100}%`, width: `${((warningUpper - warningLower) / range) * 100}%` }} />
          <div className="threshold-zone zone-warning-upper" style={{ left: `${((warningUpper - lowerLimit) / range) * 100}%`, width: `${((criticalUpper - warningUpper) / range) * 100}%` }} />
          <div className="threshold-zone zone-critical-upper" style={{ left: `${((criticalUpper - lowerLimit) / range) * 100}%`, width: `${((upperLimit - criticalUpper) / range) * 100}%` }} />

          <input
            type="range"
            className={`threshold-slider slider-critical-lower edit-only`}
            min={lowerLimit}
            max={upperLimit}
            step="any"
            value={criticalLower}
            onChange={(e) => onCriticalLowerChange(parseFloat(e.target.value))}
            disabled={!isEditMode}
          />
          <input
            type="range"
            className={`threshold-slider slider-warning-lower edit-only`}
            min={lowerLimit}
            max={upperLimit}
            step="any"
            value={warningLower}
            onChange={(e) => onWarningLowerChange(parseFloat(e.target.value))}
            disabled={!isEditMode}
          />
          <input
            type="range"
            className={`threshold-slider slider-warning-upper edit-only`}
            min={lowerLimit}
            max={upperLimit}
            step="any"
            value={warningUpper}
            onChange={(e) => onWarningUpperChange(parseFloat(e.target.value))}
            disabled={!isEditMode}
          />
          <input
            type="range"
            className={`threshold-slider slider-critical-upper edit-only`}
            min={lowerLimit}
            max={upperLimit}
            step="any"
            value={criticalUpper}
            onChange={(e) => onCriticalUpperChange(parseFloat(e.target.value))}
            disabled={!isEditMode}
          />

          <input type="range" className={`threshold-slider slider-target ${!isEditMode ? 'live-mode' : ''}`} min={lowerLimit} max={upperLimit} step="any" value={targetValue} onChange={(e) => onTargetChange(parseFloat(e.target.value))} />

          <svg className="current-value-wave" width={waveWidth} height={barHeight} viewBox={`0 0 ${waveWidth} ${barHeight}`} preserveAspectRatio="none" style={{ position: 'absolute', left: `${((value - lowerLimit) / range) * 100}%`, transform: 'translateX(-50%)', transition: 'left 0.3s ease-out', pointerEvents: 'none', zIndex: 46 }}>
            <path d={wavePathD} fill="none" stroke="rgba(var(--color-accent-green-rgb), .95)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </svg>

          <div
            ref={(el) => {
              labelRefs.current['min'] = el;
            }}
            className="threshold-value-input input-min"
            style={{ left: `0%` }}
          >
            <input
              type="number"
              step="any"
              disabled={!isEditMode}
              value={editingValues['min'] ?? lowerLimit.toString()}
              onChange={(e) => setEditingValues((s) => ({ ...s, min: (e.target as HTMLInputElement).value }))}
              onBlur={() => {
                // revert to prop value on blur
                setEditingValues((s) => ({ ...s, min: lowerLimit.toString() }));
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const raw = (e.target as HTMLInputElement).value;
                  const v = parseFloat(raw);
                  if (!isNaN(v)) onLowerLimitChange(v);
                  (e.target as HTMLInputElement).blur();
                }
              }}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          {/* Render threshold labels according to computed placements */}
          {
            labels.filter(lbl => isEditMode || lbl.key === 'target').map((lbl) => {
              const placement = getLabelPlacement(lbl.key);
              const cssKey = lbl.key.replace(/([A-Z])/g, '-$1').toLowerCase();
              const isTopRow = placement.row === -1;
              const zIndex = 100 + priorityOf(lbl.type) * 10;
              const top = isTopRow ? 0 : (barHeight + LABEL_OFFSET + placement.row * ROW_SPACING);
              const style: ThresholdLabelStyle = {
                left: `${placement.left}%`,
                top: `${top}px`,
                zIndex
              };
              style['--threshold-translate-y'] = isTopRow ? `calc(-100% - ${LABEL_OFFSET}px)` : '0px';
              return (
                <div
                  key={lbl.key}
                  ref={(el) => {
                    labelRefs.current[lbl.key] = el;
                  }}
                  className={`threshold-value-input input-${cssKey} ${placement.row === -1 ? 'position-top' : 'position-bottom'}`}
                  style={style}
                >
                  <input
                    type="number"
                    step="any"
                    value={editingValues[lbl.key] ?? lbl.pos.toFixed(2)}
                    onChange={(e) => setEditingValues((s) => ({ ...s, [lbl.key]: (e.target as HTMLInputElement).value }))}
                    onBlur={() => {
                      // revert to prop value on blur (no commit)
                      setEditingValues((s) => ({ ...s, [lbl.key]: lbl.pos.toFixed(2) }));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const raw = (e.target as HTMLInputElement).value;
                        const v = parseFloat(raw);
                        if (!isNaN(v)) {
                          lbl.onChange(v);
                          setEditingValues((s) => ({ ...s, [lbl.key]: v.toFixed(2) }));
                        } else {
                          // revert on invalid
                          setEditingValues((s) => ({ ...s, [lbl.key]: lbl.pos.toFixed(2) }));
                        }
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              );
            })
          }

          {/* Current value: always below the bar, allowed to overlap (render on top visually) */}
          <div
            ref={currentValueRef}
            className={`threshold-value-input input-current position-bottom ${currentExpanded ? 'expanded' : ''}`}
            style={{ left: `${((value - lowerLimit) / range) * 100}%`, top: `${barHeight + 8}px`, zIndex: 999, cursor: canAdjustBehavior ? 'pointer' : 'default' }}
            onClick={(e) => {
              if (canAdjustBehavior) {
                e.stopPropagation();
                setCurrentExpanded((s) => !s);
              }
            }}
            role={canAdjustBehavior ? 'button' : undefined}
            tabIndex={canAdjustBehavior ? 0 : -1}
            aria-expanded={currentExpanded}
            onKeyDown={(e) => {
              if (canAdjustBehavior && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                setCurrentExpanded((s) => !s);
              }
            }}
          >
            <div className="current-value-display" aria-live="polite">{value.toFixed(2)}</div>
            <div className="current-expanded-panel" aria-hidden={!currentExpanded} onClick={(e) => e.stopPropagation()}>
              <div className="behavior-slider-group panel">
                <label><span>Responsiveness</span></label>
                <input type="range" className="behavior-slider" min="0" max="1" step="0.001" value={responsiveness} onChange={(e) => onResponsivenessChange(parseFloat(e.target.value))} />
                <div className="slider-labels"><span>Slow</span><span>Fast</span></div>
              </div>

              <div className="behavior-slider-group panel">
                <label><span>Noise</span></label>
                <input type="range" className="behavior-slider" min="0" max={maxNoise} step={Math.max(0.01, maxNoise / 200)} value={noise} onChange={(e) => onNoiseChange(parseFloat(e.target.value))} />
                <div className="slider-labels"><span>None</span><span>Max</span></div>
              </div>
            </div>
          </div>
          <div
            ref={(el) => {
              labelRefs.current['max'] = el;
            }}
            className="threshold-value-input input-max"
            style={{ left: `100%` }}
          >
            <input
              type="number"
              step="any"
              disabled={!isEditMode}
              value={editingValues['max'] ?? upperLimit.toString()}
              onChange={(e) => setEditingValues((s) => ({ ...s, max: (e.target as HTMLInputElement).value }))}
              onBlur={() => {
                // revert to prop value on blur
                setEditingValues((s) => ({ ...s, max: upperLimit.toString() }));
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const raw = (e.target as HTMLInputElement).value;
                  const v = parseFloat(raw);
                  if (!isNaN(v)) onUpperLimitChange(v);
                  (e.target as HTMLInputElement).blur();
                }
              }}
              onClick={(e) => e.stopPropagation()}
            />
          </div>

        </div>

        {/* min/max labels removed — indicators below the bar were removed per request */}
      </div>

      {/* behavior-controls-inline removed: controls are now accessible inside the current-value expanded panel */}
    </div>
  );
};

export default ThresholdEditor;
