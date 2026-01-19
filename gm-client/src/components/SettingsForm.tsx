import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { SketchPicker, ColorResult } from 'react-color';
import { PlayerThemeSettings, ThemePreset, ThemeEffectSettings } from '../types';
import { ChevronDown, Info } from 'lucide-react';
import { SETTINGS_SECTIONS, type SettingsSection } from './settingsSections';
import GamestateView from './GamestateView';

const DEFAULT_HEADER = 'PHOSPHORITE';
const DEFAULT_LOGIN = 'WELCOME TO THE PHOSPHORITE TERMINAL';

const DEFAULT_EFFECT_SETTINGS: ThemeEffectSettings = {
  embers: {
    primaryColor: '#ffbd81',
    secondaryColor: '#ff8f3e',
    driftSpeed: 1,
    density: 32,
    glow: 0.5,
    swayAmount: 36,
    swaySpeed: 7
  },
  heartbeat: {
    coreColor: '#d4f9fa',
    ringColor: '#ff3c00',
    pulseRate: 2.6,
    intensity: 0.55
  },
  silicon: {
    gridColor: '#78d1ff',
    glareColor: '#88ffff',
    sweepSpeed: 8,
    gridScale: 48
  }
};

const createEffectSettings = (overrides?: Partial<ThemeEffectSettings>): ThemeEffectSettings => ({
  embers: { ...DEFAULT_EFFECT_SETTINGS.embers, ...(overrides?.embers || {}) },
  heartbeat: { ...DEFAULT_EFFECT_SETTINGS.heartbeat, ...(overrides?.heartbeat || {}) },
  silicon: { ...DEFAULT_EFFECT_SETTINGS.silicon, ...(overrides?.silicon || {}) }
});

const DEFAULT_THEME: PlayerThemeSettings = {
  presetId: 'phosphor',
  palette: {
    foreground: '#d4f9fa',
    background: '#000c0c',
    alert: '#ff3c00',
    gradient: {
      type: 'radial',
      angle: 135,
      start: '#1a2f30',
      end: '#000000',
      radius: 68,
      intensity: 0.85,
      enabled: true
    },
    glow: {
      foreground: 0.5,
      background: 0.35,
      alert: 0.5
    },
    media: {
      hueShift: 135,
      saturation: 1.2,
      brightness: 0.82,
      contrast: 1.05
    }
  },
  typography: {
    fontFamily: '"Vga", Menlo, Monaco, Consolas, "Courier New", monospace',
    fontScale: 1,
    lineHeightScale: 1,
    letterSpacingScale: 1
  },
  effects: {
    scanlines: true,
    staticNoise: true,
    vignette: true,
    chromaticAberration: false,
    embers: false,
    heartbeat: false,
    grid: false,
    glare: false
  },
  effectSettings: createEffectSettings()
};

const COLOR_SWATCHES = ['#d4f9fa', '#ffb347', '#57f2c7', '#ff3c00', '#c6f68d', '#ffffff', '#000000', '#1a2f30', '#17090d'];

const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'phosphor',
    name: 'Phosphor',
    description: 'Flickering CRT glass drowns the room in static.',
    theme: DEFAULT_THEME
  },
  {
    id: 'silicon',
    name: 'Silicon',
    description: 'Modern circuitry hums with surgical precision.',
    theme: {
      presetId: 'silicon',
      palette: {
        foreground: '#e3f6ff',
        background: '#02060c',
        alert: '#6ef9ff',
        gradient: {
          type: 'linear',
          angle: 130,
          start: '#02060c',
          end: '#0f1b2a',
          radius: 82,
          intensity: 0.9,
          enabled: true
        },
        glow: {
          foreground: 0.35,
          background: 0.2,
          alert: 0.45
        },
        media: {
          hueShift: -15,
          saturation: 1.05,
          brightness: 1.02,
          contrast: 1.2
        }
      },
      typography: {
        fontFamily: '"Nasalization", "Vga", Menlo, Monaco, Consolas, "Courier New", monospace',
        fontScale: 0.96,
        lineHeightScale: 1.3,
        letterSpacingScale: 1
      },
      effects: {
        scanlines: false,
        staticNoise: false,
        vignette: false,
        chromaticAberration: false,
        embers: false,
        heartbeat: false,
        grid: true,
        glare: true
      },
      effectSettings: createEffectSettings({
        silicon: {
          gridColor: '#6ef9ff',
          glareColor: '#c2ffff',
          sweepSpeed: 9,
          gridScale: 36
        }
      })
    }
  },
  {
    id: 'sulfur',
    name: 'Sulfur',
    description: 'Caustic warning lights hiss through the dark.',
    theme: {
      presetId: 'sulfur',
      palette: {
        foreground: '#f7f48b',
        background: '#050100',
        alert: '#ff6b3d',
        gradient: {
          type: 'linear',
          angle: 105,
          start: '#1a0900',
          end: '#050100',
          radius: 70,
          intensity: 0.95,
          enabled: true
        },
        glow: {
          foreground: 0.65,
          background: 0.5,
          alert: 0.7
        },
        media: {
          hueShift: 24,
          saturation: 1.35,
          brightness: 0.9,
          contrast: 1.25
        }
      },
      typography: {
        fontFamily: '"Vga", Menlo, Monaco, Consolas, "Courier New", monospace',
        fontScale: 0.98,
        lineHeightScale: 1.04,
        letterSpacingScale: 1
      },
      effects: {
        scanlines: true,
        staticNoise: true,
        vignette: true,
        chromaticAberration: false,
        embers: true,
        heartbeat: false,
        grid: false,
        glare: false
      },
      effectSettings: createEffectSettings({
        embers: {
          primaryColor: '#ffb347',
          secondaryColor: '#ff6b3d',
          driftSpeed: 0.9,
          density: 26,
          glow: 0.7,
          swayAmount: 84,
          swaySpeed: 6
        }
      })
    }
  },
  {
    id: 'neon',
    name: 'Neon',
    description: 'Vaporwave neon and cyberpunk glow pulse unnaturally.',
    theme: {
      presetId: 'neon',
      palette: {
        foreground: '#d8f9ff',
        background: '#030013',
        alert: '#ff1fb0',
        gradient: {
          type: 'radial',
          angle: 120,
          start: '#13002b',
          end: '#030013',
          radius: 80,
          intensity: 0.9,
          enabled: true
        },
        glow: {
          foreground: 0.7,
          background: 0.25,
          alert: 0.75
        },
        media: {
          hueShift: 195,
          saturation: 1.5,
          brightness: 0.95,
          contrast: 1.2
        }
      },
      typography: {
        fontFamily: '"SAIBA 45", "Vga", Menlo, Monaco, Consolas, "Courier New", monospace',
        fontScale: 1,
        lineHeightScale: 1.15,
        letterSpacingScale: 1
      },
      effects: {
        scanlines: true,
        staticNoise: false,
        vignette: true,
        chromaticAberration: true,
        embers: false,
        heartbeat: false,
        grid: false,
        glare: false
      },
      effectSettings: createEffectSettings()
    }
  },
  {
    id: 'osmium',
    name: 'Osmium',
    description: 'Alien darkstone breathes an ominous green light.',
    theme: {
      presetId: null,
      palette: {
        foreground: '#0c6414',
        background: '#000000',
        alert: '#adc240',
        gradient: {
          type: 'radial',
          angle: 90,
          start: '#000000',
          end: '#005e33',
          radius: 61,
          intensity: 0.15,
          enabled: true
        },
        glow: {
          foreground: 1,
          background: 0.8,
          alert: 1
        },
        media: {
          hueShift: 53,
          saturation: 1,
          brightness: 0.6,
          contrast: 1
        }
      },
      typography: {
        fontFamily: '"Lovecraft Diary", "Vga", Menlo, Monaco, Consolas, "Courier New", monospace',
        fontScale: 1.04,
        lineHeightScale: 1.3,
        letterSpacingScale: 1.5
      },
      effects: {
        scanlines: false,
        staticNoise: false,
        vignette: true,
        chromaticAberration: false,
        embers: true,
        heartbeat: true,
        grid: false,
        glare: false
      },
      effectSettings: createEffectSettings({
        embers: {
          primaryColor: '#8c00ff',
          secondaryColor: '#00ff2e',
          driftSpeed: 0.25,
          density: 72,
          glow: 0.5,
          swayAmount: 120,
          swaySpeed: 14
        },
        heartbeat: {
          coreColor: '#009671',
          ringColor: '#00b524',
          pulseRate: 3.2,
          intensity: 0.6
        },
        silicon: {
          gridColor: '#2ff9c9',
          glareColor: '#b4fff5',
          sweepSpeed: 6.4,
          gridScale: 52
        }
      })
    }
  }
];

const THEME_PRESET_ALIAS: Record<string, string> = {
  'satellite-blue': 'phosphor',
  'silicon-glass': 'silicon',
  'verdant-signal': 'sulfur',
  'chlorine': 'sulfur',
  'furnace-amber': 'neon',
  'sulfur-warning': 'sulfur',
  'neon-dream': 'neon',
  'osmium-vein': 'osmium'
};

const remapPresetId = (value?: string | null): string | null => {
  if (!value) {
    return null;
  }
  const slug = value.toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!slug) {
    return null;
  }
  return THEME_PRESET_ALIAS[slug] || slug;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const BASE_VIEWPORT_WIDTH = 1920;
const BASE_VIEWPORT_HEIGHT = 1080;
const pxToViewportWidth = (value: number) => `${((value / BASE_VIEWPORT_WIDTH) * 100).toFixed(4)}vw`;
const formatViewportWidth = (value: number) => `${((value / BASE_VIEWPORT_WIDTH) * 100).toFixed(2)}vw`;
const formatViewportHeight = (value: number) => `${((value / BASE_VIEWPORT_HEIGHT) * 100).toFixed(2)}vh`;

type PreviewEmberParticle = {
  id: string;
  style: CSSProperties & Record<string, string>;
};

type EffectKey = keyof PlayerThemeSettings['effects'];

const EFFECT_SUMMARY: Record<EffectKey, { label: string; hint: string }> = {
  scanlines: { label: 'Scanlines overlay', hint: 'Adds faint scanlines so the UI feels like an old monitor.' },
  staticNoise: { label: 'Static noise', hint: 'Layers a soft static texture over the background.' },
  vignette: { label: 'Vignette halo', hint: 'Darkens the corners to pull focus toward the center.' },
  chromaticAberration: { label: 'Chromatic aberration', hint: 'Offsets RGB channels slightly for a glitchy shimmer.' },
  embers: { label: 'Ash drift & sparks', hint: 'Lets slow ember trails drift upward behind the interface.' },
  heartbeat: { label: 'Heartbeat pulse', hint: 'Adds a heartbeat-like pulse to the background.' },
  grid: { label: 'Grid', hint: 'Etches a precise lattice so the UI feels fabricated in glass.' },
  glare: { label: 'Glare', hint: 'Sweeps a glassy ribbon of light across the viewport at intervals.' }
};

const EFFECT_CARD_ORDER: EffectKey[] = [
  'scanlines',
  'staticNoise',
  'vignette',
  'chromaticAberration',
  'embers',
  'heartbeat',
  'grid',
  'glare'
];

type EffectColorConfig = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};

const FONT_OPTIONS = [
  { label: 'VGA (default)', value: '"Vga", Menlo, Monaco, Consolas, "Courier New", monospace' },
  { label: 'Dignity of Labour', value: '"Dignity of Labour", "Vga", Menlo, Monaco, Consolas, "Courier New", monospace' },
  { label: 'Lovecraft Diary', value: '"Lovecraft Diary", "Vga", Menlo, Monaco, Consolas, "Courier New", monospace' },
  { label: 'SAIBA 45', value: '"SAIBA 45", "Vga", Menlo, Monaco, Consolas, "Courier New", monospace' },
  { label: 'Nasalization', value: '"Nasalization", "Vga", Menlo, Monaco, Consolas, "Courier New", monospace' }
];

const parseHexColor = (input: string) => {
  if (!input) {
    return { r: 255, g: 255, b: 255 };
  }
  const normalized = input.replace(/[^0-9a-f]/gi, '').toLowerCase();
  if (!normalized) {
    return { r: 255, g: 255, b: 255 };
  }
  const hex = normalized.length === 3
    ? normalized.split('').map((char) => char + char).join('')
    : normalized.padEnd(6, '0').slice(0, 6);
  const intValue = parseInt(hex, 16);
  return {
    r: (intValue >> 16) & 255,
    g: (intValue >> 8) & 255,
    b: intValue & 255
  };
};

const parseRgbColor = (input: string) => {
  const matches = input.match(/rgba?\(([^)]+)\)/i);
  if (!matches) {
    return { r: 255, g: 255, b: 255 };
  }
  const [r, g, b] = matches[1].split(',').map((value) => value.trim());
  return {
    r: clamp(Number(r), 0, 255) || 0,
    g: clamp(Number(g), 0, 255) || 0,
    b: clamp(Number(b), 0, 255) || 0
  };
};

const parseColor = (input: string) => {
  if (!input) {
    return { r: 255, g: 255, b: 255 };
  }
  const trimmed = input.trim();
  if (trimmed.startsWith('#')) {
    return parseHexColor(trimmed);
  }
  if (trimmed.startsWith('rgb')) {
    return parseRgbColor(trimmed);
  }
  return parseHexColor('#eef6ff');
};

const rgbToString = (rgb: { r: number; g: number; b: number }) => `${rgb.r}, ${rgb.g}, ${rgb.b}`;

const buildGlow = (color: string, intensity: number) => {
  const rgb = parseColor(color);
  const radius = (4 + clamp(intensity, 0, 1) * 12).toFixed(2);
  const alpha = (0.15 + clamp(intensity, 0, 1) * 0.85).toFixed(2);
  return `0 0 ${radius}px rgba(${rgbToString(rgb)}, ${alpha})`;
};

const withAlpha = (color: string, alpha: number) => {
  const rgb = parseColor(color);
  return `rgba(${rgbToString(rgb)}, ${clamp(alpha, 0, 1).toFixed(2)})`;
};

const buildGradientPreview = (theme: PlayerThemeSettings) => {
  const { gradient } = theme.palette;
  if (!gradient.enabled) {
    return 'none';
  }
  if (gradient.type === 'linear') {
    return `linear-gradient(${gradient.angle}deg, ${withAlpha(gradient.start, gradient.intensity)}, ${withAlpha(gradient.end, gradient.intensity)})`;
  }
  const radius = clamp(gradient.radius, 12, 140);
  return `radial-gradient(circle at 50% 20%, ${withAlpha(gradient.start, gradient.intensity)} 0%, ${withAlpha(gradient.start, gradient.intensity)} ${radius}%, ${withAlpha(gradient.end, Math.min(1, gradient.intensity + 0.15))} 100%)`;
};

const buildMediaFilter = (theme: PlayerThemeSettings) => {
  const { hueShift, saturation, brightness, contrast } = theme.palette.media;
  return [
    'grayscale(100%)',
    'sepia(100%)',
    `hue-rotate(${hueShift}deg)`,
    `saturate(${saturation})`,
    `brightness(${brightness})`,
    `contrast(${contrast})`
  ].join(' ');
};

const buildPreviewStyles = (theme: PlayerThemeSettings): CSSProperties => {
  const foreground = parseColor(theme.palette.foreground);
  const background = parseColor(theme.palette.background);
  const alert = parseColor(theme.palette.alert);
  const foregroundRgb = rgbToString(foreground);
  const backgroundRgb = rgbToString(background);
  const alertRgb = rgbToString(alert);
  const styles: CSSProperties = {
    '--preview-foreground': theme.palette.foreground,
    '--preview-foreground-rgb': foregroundRgb,
    '--preview-background': theme.palette.background,
    '--preview-background-rgb': backgroundRgb,
    '--preview-alert': theme.palette.alert,
    '--preview-alert-rgb': alertRgb,
    '--preview-gradient': buildGradientPreview(theme),
    '--preview-font-family': theme.typography.fontFamily,
    '--preview-image-filter': buildMediaFilter(theme),
    '--preview-foreground-glow': buildGlow(theme.palette.foreground, theme.palette.glow.foreground),
    '--preview-background-glow': buildGlow(theme.palette.background, theme.palette.glow.background),
    '--preview-alert-glow': buildGlow(theme.palette.alert, theme.palette.glow.alert),
    '--player-foreground': theme.palette.foreground,
    '--player-foreground-rgb': foregroundRgb,
    '--player-background': theme.palette.background,
    '--player-background-rgb': backgroundRgb,
    '--player-font-family': theme.typography.fontFamily,
    '--player-type-scale': theme.typography.fontScale.toString(),
    '--player-line-height-scale': theme.typography.lineHeightScale.toString(),
    '--player-letter-spacing-scale': theme.typography.letterSpacingScale.toString(),
    '--player-scanlines-foreground': `rgba(${foregroundRgb}, 0.08)`,
    '--player-scanlines-background': `rgba(${backgroundRgb}, 0.45)`
  } as CSSProperties;

  applyEffectPreviewVariables(styles, theme);
  return styles;
};

const applyEffectPreviewVariables = (styles: CSSProperties, theme: PlayerThemeSettings) => {
  const setVar = (name: string, value: string | number) => {
    (styles as any)[name] = typeof value === 'number' ? value.toString() : value;
  };

  const setColorVar = (name: string, color: string, fallback: string) => {
    const normalized = color || fallback;
    setVar(name, normalized);
    setVar(`${name}-rgb`, rgbToString(parseColor(normalized)));
  };

  const clamp01 = (value: number) => clamp(value, 0, 1);
  const effects = theme.effectSettings;

  const emberDensity = clamp(effects.embers.density, 16, 72);
  setColorVar('--effect-embers-primary', effects.embers.primaryColor, '#ffbd81');
  setColorVar('--effect-embers-secondary', effects.embers.secondaryColor, '#ff8f3e');
  setVar('--effect-embers-density', `${emberDensity}px`);
  setVar('--effect-embers-speed', Math.max(0.25, effects.embers.driftSpeed).toFixed(2));
  setVar('--effect-embers-glow', clamp01(effects.embers.glow).toFixed(2));
  setVar('--effect-embers-sway-range', pxToViewportWidth(clamp(effects.embers.swayAmount, 6, 140)));
  setVar('--effect-embers-sway-speed', `${clamp(effects.embers.swaySpeed, 2, 14)}s`);
  const hoverRange = clamp(10 + emberDensity * 0.25, 12, 42);
  setVar('--effect-embers-hover-range', `${hoverRange}vh`);

  const heartbeatRate = Math.max(1.2, effects.heartbeat.pulseRate);
  const heartbeatIntensity = clamp01(effects.heartbeat.intensity);
  const hbScaleMin = (0.9 + heartbeatIntensity * 0.05).toFixed(3);
  const hbScaleMid = (0.96 + heartbeatIntensity * 0.04).toFixed(3);
  const hbScaleMax = (1.04 + heartbeatIntensity * 0.08).toFixed(3);
  setColorVar('--effect-heartbeat-core', effects.heartbeat.coreColor, theme.palette.foreground);
  setColorVar('--effect-heartbeat-ring', effects.heartbeat.ringColor, theme.palette.alert);
  setVar('--effect-heartbeat-rate', `${heartbeatRate}s`);
  setVar('--effect-heartbeat-intensity', heartbeatIntensity.toFixed(2));
  setVar('--effect-heartbeat-scale-min', hbScaleMin);
  setVar('--effect-heartbeat-scale-mid', hbScaleMid);
  setVar('--effect-heartbeat-scale-max', hbScaleMax);

  setColorVar('--effect-silicon-grid-color', effects.silicon.gridColor, '#78d1ff');
  setColorVar('--effect-silicon-glare-color', effects.silicon.glareColor, '#88ffff');
  const siliconScale = clamp(effects.silicon.gridScale, 12, 120);
  setVar('--effect-silicon-scale', pxToViewportWidth(siliconScale));
  setVar('--effect-silicon-speed', `${Math.max(3, effects.silicon.sweepSpeed)}s`);

};

const PREVIEW_LINES = [
  'BOOT> AUTH SIGMA/07 ACCEPTED',
  'SYS> ORBITAL WATCH SHIFT CHANGE · 18:42',
  'ALRT> REACTOR COOLING LOOP STABILITY 87%',
  'MSG> TWO NEW TRANSMISSIONS WAITING'
];

const cloneTheme = (theme: PlayerThemeSettings): PlayerThemeSettings => JSON.parse(JSON.stringify(theme));

const parseStoredTheme = (raw?: string | null): PlayerThemeSettings => {
  if (!raw) return cloneTheme(DEFAULT_THEME);
  try {
    const parsed = JSON.parse(raw);
    const mergedEffects: PlayerThemeSettings['effects'] & Record<string, boolean> = {
      ...cloneTheme(DEFAULT_THEME).effects,
      ...(parsed.effects || {})
    };

    const legacyGrid = parsed.effects?.grid ?? parsed.effects?.siliconGrid;
    if (typeof mergedEffects.grid !== 'boolean' && typeof legacyGrid === 'boolean') {
      mergedEffects.grid = legacyGrid;
    }

    const legacyGlare = parsed.effects?.glare ?? parsed.effects?.siliconSweep ?? parsed.effects?.siliconGrid;
    if (typeof mergedEffects.glare !== 'boolean' && typeof legacyGlare === 'boolean') {
      mergedEffects.glare = legacyGlare;
    }

    const mergedEffectSettings = createEffectSettings(parsed.effectSettings as Partial<ThemeEffectSettings> | undefined);

    const merged: PlayerThemeSettings = {
      ...cloneTheme(DEFAULT_THEME),
      ...parsed,
      palette: {
        ...cloneTheme(DEFAULT_THEME).palette,
        ...(parsed.palette || {}),
        gradient: {
          ...cloneTheme(DEFAULT_THEME).palette.gradient,
          ...((parsed.palette && parsed.palette.gradient) || {})
        },
        glow: {
          ...cloneTheme(DEFAULT_THEME).palette.glow,
          ...((parsed.palette && parsed.palette.glow) || {})
        },
        media: {
          ...cloneTheme(DEFAULT_THEME).palette.media,
          ...((parsed.palette && parsed.palette.media) || {})
        }
      },
      typography: {
        ...cloneTheme(DEFAULT_THEME).typography,
        ...(parsed.typography || {})
      },
      effects: mergedEffects,
      effectSettings: mergedEffectSettings
    };
    merged.presetId = remapPresetId(merged.presetId);
    return merged;
  } catch (error) {
    console.warn('Failed to parse stored theme, falling back to default.', error);
    return cloneTheme(DEFAULT_THEME);
  }
};

type SettingLabelProps = {
  text: string;
  info?: string;
};

const SettingLabel = ({ text, info }: SettingLabelProps) => (
  <span className="setting-label">
    {text}
    {info && (
      <span className="info-icon" title={info} aria-label={info} role="img">
        <Info size={14} aria-hidden="true" />
      </span>
    )}
  </span>
);

type ColorPickerControlProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

const ColorPickerControl = ({ label, value, onChange, disabled }: ColorPickerControlProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (!containerRef.current) {
        return;
      }
      if (!containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    if (disabled && isOpen) {
      setIsOpen(false);
    }
  }, [disabled, isOpen]);

  const handleChange = (result: ColorResult) => {
    if (disabled) {
      return;
    }
    onChange(result.hex);
  };

  const toggle = () => {
    if (disabled) {
      return;
    }
    setIsOpen((previous) => !previous);
  };

  return (
    <div ref={containerRef} className={`color-control ${disabled ? 'color-control--disabled' : ''}`}>
      <button
        type="button"
        className="color-swatch-button"
        onClick={toggle}
        aria-expanded={isOpen}
        aria-label={`Select ${label} color`}
        disabled={disabled}
      >
        <span className="color-swatch" style={{ '--swatch-color': value } as CSSProperties} />
        <span className="color-control-label">{label}</span>
      </button>

      {isOpen && (
        <div className="color-popover" role="dialog" aria-label={`${label} color picker`}>
          <SketchPicker
            color={value}
            onChange={handleChange}
            onChangeComplete={handleChange}
            presetColors={COLOR_SWATCHES}
            disableAlpha
          />
        </div>
      )}
    </div>
  );
};

type TeletypeCursorState = {
  line: number;
  visible: boolean;
};

const useTeletypeLoop = (lines: string[], speed = 28, loopDelay = 2600) => {
  const [typedLines, setTypedLines] = useState<string[]>(() => lines.map(() => ''));
  const [cursor, setCursor] = useState<TeletypeCursorState>({ line: 0, visible: true });

  useEffect(() => {
    let isCancelled = false;
    let timeoutId: number | undefined;
    let blinkId: number | undefined;
    const typingInterval = Math.max(16, Math.floor(1000 / Math.max(speed, 1)));

    const resetLines = () => lines.map(() => '');

    setTypedLines(resetLines());
    setCursor({ line: 0, visible: true });

    blinkId = window.setInterval(() => {
      setCursor((previous) => ({ ...previous, visible: !previous.visible }));
    }, 480);

    let lineIndex = 0;
    let charIndex = 0;

    const typeNext = () => {
      if (isCancelled) {
        return;
      }

      if (lineIndex >= lines.length) {
        timeoutId = window.setTimeout(() => {
          if (isCancelled) {
            return;
          }
          setTypedLines(resetLines());
          lineIndex = 0;
          charIndex = 0;
          setCursor({ line: 0, visible: true });
          typeNext();
        }, loopDelay);
        return;
      }

      const target = lines[lineIndex] || '';
      if (charIndex < target.length) {
        const nextChar = target[charIndex];
        setTypedLines((previous) => {
          const next = [...previous];
          next[lineIndex] = `${next[lineIndex]}${nextChar}`;
          return next;
        });
        setCursor({ line: lineIndex, visible: true });
        charIndex += 1;
        timeoutId = window.setTimeout(typeNext, typingInterval);
        return;
      }

      lineIndex += 1;
      charIndex = 0;
      timeoutId = window.setTimeout(typeNext, 220);
    };

    timeoutId = window.setTimeout(typeNext, 320);

    return () => {
      isCancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
      if (blinkId) window.clearInterval(blinkId);
    };
  }, [lines, speed, loopDelay]);

  return { typedLines, cursor };
};

const PREVIEW_IMAGE_STEPS = [
  0.01,
  0.02,
  0.03,
  0.05,
  0.08,
  0.13,
  0.21,
  0.34,
  0.55,
  0.89,
  1
];

const PREVIEW_IMAGE_TICK = 150;
const PREVIEW_IMAGE_LOOP_DELAY = 2600;

const ThemePreviewImage = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    let rafId: number | undefined;
    let loopTimeoutId: number | undefined;
    let resizeObserver: ResizeObserver | null = null;
    let resizeTimer: number | undefined;
    let disposed = false;
    let currentCssWidth = 0;
    let currentCssHeight = 0;

    const image = new Image();
    image.src = '/phosphorite-icon.svg';

    const drawAtResolution = (resolution: number, width: number, height: number) => {
      if (!context || disposed) {
        return;
      }
      const safeResolution = Number.isFinite(resolution) ? resolution : 1;
      const sampleWidth = Math.max(1, Math.floor(width * safeResolution));
      const sampleHeight = Math.max(1, Math.floor(height * safeResolution));

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = sampleWidth;
      tempCanvas.height = sampleHeight;
      const tempContext = tempCanvas.getContext('2d');
      if (!tempContext) {
        return;
      }

      tempContext.imageSmoothingEnabled = false;
      context.imageSmoothingEnabled = false;
      tempContext.clearRect(0, 0, sampleWidth, sampleHeight);
      context.clearRect(0, 0, width, height);

      // Draw the SVG into the sample canvas at the desired sample size so the browser
      // can rasterize the vector at the correct resolution (this avoids relying on
      // naturalWidth/naturalHeight which are 0 for SVGs).
      tempContext.drawImage(image, 0, 0, sampleWidth, sampleHeight);
      // Then scale the sampled bitmap into the high-resolution canvas
      context.drawImage(tempCanvas, 0, 0, sampleWidth, sampleHeight, 0, 0, width, height);
    };

    const stopSequence = () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = undefined;
      }
      if (loopTimeoutId) {
        window.clearTimeout(loopTimeoutId);
        loopTimeoutId = undefined;
      }
    };

    const startSequence = () => {
      if (!currentCssWidth || !currentCssHeight) {
        return;
      }

      stopSequence();

      let stepIndex = 0;
      let lastFrameTime = performance.now();

      const tick = (timestamp: number) => {
        if (disposed) {
          return;
        }

        if (timestamp - lastFrameTime >= PREVIEW_IMAGE_TICK) {
          const resolution = PREVIEW_IMAGE_STEPS[stepIndex] ?? PREVIEW_IMAGE_STEPS[PREVIEW_IMAGE_STEPS.length - 1];
          drawAtResolution(resolution, currentCssWidth, currentCssHeight);
          stepIndex += 1;
          lastFrameTime = timestamp;

          if (stepIndex >= PREVIEW_IMAGE_STEPS.length) {
            stepIndex = 0;
            rafId = undefined;
            loopTimeoutId = window.setTimeout(() => {
              loopTimeoutId = undefined;
              lastFrameTime = performance.now();
              rafId = requestAnimationFrame(tick);
            }, PREVIEW_IMAGE_LOOP_DELAY);
            return;
          }
        }

        rafId = requestAnimationFrame(tick);
      };

      rafId = requestAnimationFrame(tick);
    };

    const ensureSequence = () => {
      if (!rafId && !loopTimeoutId) {
        startSequence();
      }
    };

    const initialize = () => {
      if (disposed) {
        return;
      }

      // Compute available width from the container (so the preview never overflows).
      const parent = canvas.parentElement;
      const parentWidth = parent ? Math.max(48, parent.clientWidth) : 180;
      const cssWidth = Math.min(180, parentWidth);
      const cssHeight = cssWidth; // keep square preview

      const dpr = window.devicePixelRatio || 1;
      const internalWidth = Math.round(cssWidth * dpr);
      const internalHeight = Math.round(cssHeight * dpr);

      // If nothing changed, just ensure CSS sizing is set and skip redraw
      if (canvas.width === internalWidth && canvas.height === internalHeight) {
        canvas.style.width = `${cssWidth}px`;
        canvas.style.height = `${cssHeight}px`;
        currentCssWidth = cssWidth;
        currentCssHeight = cssHeight;
        ensureSequence();
        return;
      }

      canvas.width = internalWidth;
      canvas.height = internalHeight;

      // Keep the element at the desired CSS size while the internal buffer is DPR-scaled
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;

      currentCssWidth = cssWidth;
      currentCssHeight = cssHeight;

      // Make drawing commands operate in CSS pixels (so we don't have to scale coordinates)
      context.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Pass CSS dimensions to drawing functions since the context is already scaled by DPR
      drawAtResolution(1, cssWidth, cssHeight);
      startSequence();
    };

    if (image.complete) {
      initialize();
    } else {
      image.onload = initialize;
      image.onerror = initialize; // Initialize even if load fails
    }

    // Keep canvas tuned to layout/DPR changes
    const scheduleInit = () => {
      if (disposed) return;
      if (resizeTimer) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => initialize(), 80);
    };

    if (canvas.parentElement && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(scheduleInit);
      resizeObserver.observe(canvas.parentElement);
    }
    window.addEventListener('resize', scheduleInit);
    window.addEventListener('orientationchange', scheduleInit);

    const handleVisibility = () => {
      if (!document.hidden) {
        ensureSequence();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      disposed = true;
      stopSequence();
      if (resizeTimer) window.clearTimeout(resizeTimer);
      if (resizeObserver) resizeObserver.disconnect();
      window.removeEventListener('resize', scheduleInit);
      window.removeEventListener('orientationchange', scheduleInit);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} className="theme-preview-image-canvas" aria-hidden="true" />;
};

type SettingsFormProps = {
  activeSection?: SettingsSection;
  onSectionChange?: (section: SettingsSection) => void;
};

function SettingsForm({ activeSection: controlledSection, onSectionChange }: SettingsFormProps = {}) {
  const [headerText, setHeaderText] = useState(DEFAULT_HEADER);
  const [loginText, setLoginText] = useState(DEFAULT_LOGIN);
  const [theme, setTheme] = useState<PlayerThemeSettings>(cloneTheme(DEFAULT_THEME));
  const [lookSaveState, setLookSaveState] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [statusError, setStatusError] = useState<string | null>(null);
  const [localSection, setLocalSection] = useState<SettingsSection>('look');
  const isSectionControlled = typeof controlledSection !== 'undefined';
  const activeSection = controlledSection ?? localSection;
  const sectionContentRef = useRef<HTMLDivElement | null>(null);
  const lookSaveResetRef = useRef<number | null>(null);
  const [expandedEffects, setExpandedEffects] = useState<Partial<Record<EffectKey, boolean>>>(() => {
    return {};
  });
  const handleSectionChange = (section: SettingsSection) => {
    if (!isSectionControlled) {
      setLocalSection(section);
    }
    onSectionChange?.(section);
  };
  const activeModule = useMemo(() => SETTINGS_SECTIONS.find((section) => section.id === activeSection), [activeSection]);
  const sectionTitle = activeModule ? `Settings: ${activeModule.title}` : 'Settings';
  const previewStyles = useMemo(() => buildPreviewStyles(theme), [theme]);
  const previewClassName = useMemo(() => {
    const classes = ['theme-preview'];
    if (theme.effects.scanlines) classes.push('theme-preview--scanlines');
    if (theme.effects.staticNoise) classes.push('theme-preview--static');
    if (theme.effects.vignette) classes.push('theme-preview--vignette');
    return classes.join(' ');
  }, [theme.effects]);
  const previewContentClassName = theme.effects.chromaticAberration
    ? 'theme-preview-content chromatic'
    : 'theme-preview-content';
  const emberPreviewParticles = useMemo<PreviewEmberParticle[]>(() => {
    if (!theme.effects.embers) {
      return [];
    }

    const settings = theme.effectSettings.embers;
    const density = clamp(settings.density, 12, 72);
    const driftSpeed = clamp(settings.driftSpeed, 0.25, 4);
    const glow = clamp(settings.glow, 0, 1);
    const swaySpeed = clamp(settings.swaySpeed, 2, 14);
    const swayAmount = clamp(settings.swayAmount, 6, 140);
    const particleCount = Math.min(60, Math.max(16, Math.round(density * 1.2)));

    const makeRand = (seed: number) => (offset: number) => {
      const value = Math.sin(seed * 12.9898 + offset * 78.233) * 43758.5453;
      return value - Math.floor(value);
    };

    return Array.from({ length: particleCount }).map((_, index) => {
      const seed = (index + 1) * 0.91 + density * 0.07;
      const rand = makeRand(seed);
      const duration = (10 + rand(0.5) * 8) / driftSpeed;
      const delay = -rand(0.6) * 8 / driftSpeed;
      const scale = 0.45 + rand(0.3) * 0.9;
      const opacity = 0.25 + glow * (0.35 + rand(0.4) * 0.5);
      const drift = rand(0.2) * 140 - 70;
      const blur = rand(0.9) * 0.5;
      const left = rand(0.1) * 100;
      const swayRange = swayAmount * (0.35 + rand(0.45));
      const swayDuration = Math.max(2.5, swaySpeed * (0.7 + rand(0.5)));
      const swayDelay = -rand(0.8) * swayDuration;
      const hoverLow = -18 - rand(0.8) * 34;
      const hoverHigh = hoverLow - (6 + rand(0.8) * 18);

      const style: PreviewEmberParticle['style'] = {
        left: `${left.toFixed(2)}%`,
        '--ember-scale': scale.toFixed(2),
        '--ember-opacity': opacity.toFixed(2),
        '--ember-drift': pxToViewportWidth(drift),
        '--ember-duration': `${duration.toFixed(2)}s`,
        '--ember-delay': `${delay.toFixed(2)}s`,
        '--ember-blur': blur.toFixed(2),
        '--ember-sway-range': pxToViewportWidth(swayRange),
        '--ember-sway-duration': `${swayDuration.toFixed(2)}s`,
        '--ember-sway-delay': `${swayDelay.toFixed(2)}s`,
        '--ember-hover-low': `${hoverLow.toFixed(2)}vh`,
        '--ember-hover-high': `${hoverHigh.toFixed(2)}vh`
      };

      return { id: `preview-ember-${index}`, style };
    });
  }, [theme.effectSettings.embers, theme.effects.embers]);
  const { typedLines, cursor: teletypeCursor } = useTeletypeLoop(PREVIEW_LINES, 30, 2600);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await fetch('/api/settings');
        if (!response.ok) {
          throw new Error('Failed to load settings');
        }
        const data = await response.json();
        setHeaderText(data.headerText || DEFAULT_HEADER);
        setLoginText(data.loginText || DEFAULT_LOGIN);
        setTheme(parseStoredTheme(data.playerTheme));
      } catch (error) {
        console.error(error);
        setStatusError('Unable to load current settings from the server.');
      }
    };

    loadSettings();
  }, []);

  useEffect(() => {
    const node = sectionContentRef.current;
    if (!node) {
      return;
    }
    node.classList.remove('content-enter');
    void node.offsetWidth;
    node.classList.add('content-enter');
  }, [activeSection]);

  useEffect(() => () => {
    if (lookSaveResetRef.current) {
      window.clearTimeout(lookSaveResetRef.current);
      lookSaveResetRef.current = null;
    }
  }, []);

  const applyPreset = (preset: ThemePreset) => {
    setTheme(cloneTheme({ ...preset.theme, presetId: preset.id }));
  };

  const upsertTheme = (updater: (current: PlayerThemeSettings) => PlayerThemeSettings) => {
    setTheme((current) => {
      const next = updater(cloneTheme(current));
      return {
        ...next,
        presetId: null
      };
    });
  };

  const updateEffectSetting = <K extends keyof ThemeEffectSettings>(
    key: K,
    changes: Partial<ThemeEffectSettings[K]>
  ) => {
    upsertTheme((next) => ({
      ...next,
      effectSettings: {
        ...next.effectSettings,
        [key]: {
          ...next.effectSettings[key],
          ...changes
        }
      }
    }));
  };

  const toggleEffectFlag = (key: EffectKey) => {
    upsertTheme((next) => ({
      ...next,
      effects: {
        ...next.effects,
        [key]: !next.effects[key]
      }
    }));
  };

  const toggleEffectDetails = (key: EffectKey) => {
    setExpandedEffects((current) => ({
      ...current,
      [key]: !current[key]
    }));
  };

  const beginLookSaveCooldown = (nextState: 'success' | 'error') => {
    if (lookSaveResetRef.current) {
      window.clearTimeout(lookSaveResetRef.current);
    }
    setLookSaveState(nextState);
    lookSaveResetRef.current = window.setTimeout(() => {
      setLookSaveState('idle');
      lookSaveResetRef.current = null;
    }, 2400);
  };

  const getEffectColorConfigs = (key: EffectKey): EffectColorConfig[] => {
    switch (key) {
      case 'embers':
        return [
          {
            label: 'Primary ember',
            value: theme.effectSettings.embers.primaryColor,
            onChange: (value) => updateEffectSetting('embers', { primaryColor: value })
          },
          {
            label: 'Secondary ember',
            value: theme.effectSettings.embers.secondaryColor,
            onChange: (value) => updateEffectSetting('embers', { secondaryColor: value })
          }
        ];
      case 'heartbeat':
        return [
          {
            label: 'Core glow',
            value: theme.effectSettings.heartbeat.coreColor,
            onChange: (value) => updateEffectSetting('heartbeat', { coreColor: value })
          },
          {
            label: 'Ring glow',
            value: theme.effectSettings.heartbeat.ringColor,
            onChange: (value) => updateEffectSetting('heartbeat', { ringColor: value })
          }
        ];
      case 'grid':
        return [
          {
            label: 'Grid color',
            value: theme.effectSettings.silicon.gridColor,
            onChange: (value) => updateEffectSetting('silicon', { gridColor: value })
          }
        ];
      case 'glare':
        return [
          {
            label: 'Glare color',
            value: theme.effectSettings.silicon.glareColor,
            onChange: (value) => updateEffectSetting('silicon', { glareColor: value })
          }
        ];
      default:
        return [];
    }
  };

  const renderEffectAdvancedContent = (key: EffectKey) => {
    const { effectSettings } = theme;
    switch (key) {
      case 'embers':
        return (
          <>
            <div className="compact-grid two-col tight">
              <label className="form-group stacked slider">
                <SettingLabel
                  text={`Drift speed (${effectSettings.embers.driftSpeed.toFixed(2)}x)`}
                  info="Faster values push embers up the frame more quickly."
                />
                <input
                  type="range"
                  min={0.25}
                  max={3}
                  step={0.05}
                  value={effectSettings.embers.driftSpeed}
                  onChange={(event) => updateEffectSetting('embers', { driftSpeed: Number(event.target.value) })}
                />
              </label>
              <label className="form-group stacked slider">
                <SettingLabel
                  text={`Particle spacing (${formatViewportHeight(effectSettings.embers.density)})`}
                  info="Controls density of the ember texture relative to the viewport."
                />
                <input
                  type="range"
                  min={16}
                  max={72}
                  step={1}
                  value={effectSettings.embers.density}
                  onChange={(event) => updateEffectSetting('embers', { density: Number(event.target.value) })}
                />
              </label>
              <label className="form-group stacked slider">
                <SettingLabel
                  text={`Glow (${Math.round(effectSettings.embers.glow * 100)}%)`}
                  info="Sets how bright the embers bloom on the bezel."
                />
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={effectSettings.embers.glow}
                  onChange={(event) => updateEffectSetting('embers', { glow: Number(event.target.value) })}
                />
              </label>
              <label className="form-group stacked slider">
                <SettingLabel
                  text={`Sway range (${formatViewportWidth(effectSettings.embers.swayAmount)})`}
                  info="Controls how far left/right embers meander relative to the viewport width."
                />
                <input
                  type="range"
                  min={6}
                  max={120}
                  step={1}
                  value={effectSettings.embers.swayAmount}
                  onChange={(event) => updateEffectSetting('embers', { swayAmount: Number(event.target.value) })}
                />
              </label>
              <label className="form-group stacked slider">
                <SettingLabel
                  text={`Sway speed (${effectSettings.embers.swaySpeed.toFixed(1)}s)`}
                  info="Adjusts how quickly embers oscillate from side to side."
                />
                <input
                  type="range"
                  min={2}
                  max={14}
                  step={0.1}
                  value={effectSettings.embers.swaySpeed}
                  onChange={(event) => updateEffectSetting('embers', { swaySpeed: Number(event.target.value) })}
                />
              </label>
            </div>
          </>
        );
      case 'heartbeat':
        return (
          <>
            <div className="compact-grid two-col tight">
              <label className="form-group stacked slider">
                <SettingLabel
                  text={`Pulse rate (${effectSettings.heartbeat.pulseRate.toFixed(1)}s)`}
                  info="Lower values pulse more frequently."
                />
                <input
                  type="range"
                  min={1.2}
                  max={6}
                  step={0.1}
                  value={effectSettings.heartbeat.pulseRate}
                  onChange={(event) => updateEffectSetting('heartbeat', { pulseRate: Number(event.target.value) })}
                />
              </label>
              <label className="form-group stacked slider">
                <SettingLabel
                  text={`Intensity (${Math.round(effectSettings.heartbeat.intensity * 100)}%)`}
                  info="Boost to make the bloom more aggressive."
                />
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={effectSettings.heartbeat.intensity}
                  onChange={(event) => updateEffectSetting('heartbeat', { intensity: Number(event.target.value) })}
                />
              </label>
            </div>
          </>
        );
      case 'grid':
        return (
          <>
            <label className="form-group stacked slider">
              <SettingLabel
                text={`Grid scale (${formatViewportWidth(effectSettings.silicon.gridScale)})`}
                info="Sets the spacing of the etched lattice relative to viewport width."
              />
              <input
                type="range"
                min={12}
                max={120}
                step={4}
                value={effectSettings.silicon.gridScale}
                onChange={(event) => updateEffectSetting('silicon', { gridScale: Number(event.target.value) })}
              />
            </label>
          </>
        );
      case 'glare':
        return (
          <>
            <label className="form-group stacked slider">
              <SettingLabel
                text={`Sweep duration (${effectSettings.silicon.sweepSpeed.toFixed(1)}s)`}
                info="Controls how fast the glare traverses the screen."
              />
              <input
                type="range"
                min={3}
                max={20}
                step={0.5}
                value={effectSettings.silicon.sweepSpeed}
                onChange={(event) => updateEffectSetting('silicon', { sweepSpeed: Number(event.target.value) })}
              />
            </label>
          </>
        );
      default:
        return null;
    }
  };

  const patchSetting = async (key: string, value: string) => {
    const response = await fetch(`/api/settings/${key}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value })
    });
    if (!response.ok) {
      throw new Error(`Failed to save ${key}`);
    }
  };

  const saveLookAndFeel = async () => {
    if (lookSaveResetRef.current) {
      window.clearTimeout(lookSaveResetRef.current);
      lookSaveResetRef.current = null;
    }
    setLookSaveState('saving');
    setStatusError(null);
    try {
      await Promise.all([
        patchSetting('headerText', headerText),
        patchSetting('loginText', loginText),
        patchSetting('playerTheme', JSON.stringify(theme))
      ]);
      beginLookSaveCooldown('success');
    } catch (error) {
      console.error('Failed to save theme settings', error);
      setStatusError('Unable to persist theme settings. Try again.');
      beginLookSaveCooldown('error');
    }
  };

  const renderEffectCard = (key: EffectKey) => {
    const summary = EFFECT_SUMMARY[key];
    if (!summary) {
      return null;
    }
    const colorConfigs = getEffectColorConfigs(key);
    const advancedContent = renderEffectAdvancedContent(key);
    const isExpanded = Boolean(expandedEffects[key]);
    const isActive = theme.effects[key];
    const detailId = `effect-card-details-${key}`;
    const hasToolbar = Boolean(colorConfigs.length) || Boolean(advancedContent);

    return (
      <article key={key} className={`effect-card ${isActive ? 'active' : ''}`.trim()}>
        <div className="effect-card-header">
          <div className="effect-card-info">
            <p className="eyebrow">{summary.label}</p>
            <p>{summary.hint}</p>
          </div>
          <button
            type="button"
            className={`pill-toggle ${isActive ? 'on' : ''}`.trim()}
            onClick={() => toggleEffectFlag(key)}
            aria-pressed={isActive}
          >
            {isActive ? 'Enabled' : 'Disabled'}
          </button>
        </div>
        {hasToolbar && (
          <div className="effect-card-toolbar">
            {Boolean(colorConfigs.length) && (
              <div className="effect-card-color-grid">
                {colorConfigs.map((config) => (
                  <ColorPickerControl
                    key={`${key}-${config.label}`}
                    label={config.label}
                    value={config.value}
                    onChange={config.onChange}
                  />
                ))}
              </div>
            )}
            {advancedContent && (
              <button
                type="button"
                className={`effect-card-toggle ${isExpanded ? 'open' : ''}`.trim()}
                aria-expanded={isExpanded}
                aria-controls={detailId}
                onClick={() => toggleEffectDetails(key)}
                aria-label={isExpanded ? `Collapse ${summary.label} controls` : `Expand ${summary.label} controls`}
              >
                <span>Advanced</span>
                <ChevronDown size={16} aria-hidden="true" />
              </button>
            )}
          </div>
        )}
        {advancedContent && (
          <div
            className={`effect-card-body ${isExpanded ? 'open' : ''}`.trim()}
            id={detailId}
            aria-hidden={!isExpanded}
          >
            <div className="effect-card-body-content">{advancedContent}</div>
          </div>
        )}
      </article>
    );
  };

  const renderEffectsSection = () => (
    <section className="settings-slab dense">
      <div className="settings-slab-header">
        <p className="eyebrow">Visual Effects</p>
      </div>
      <div className="effect-card-grid">
        {EFFECT_CARD_ORDER.map((key) => renderEffectCard(key))}
      </div>
    </section>
  );


  const renderLookSection = () => {
    const lookSaveButtonClasses = ['primary-btn', 'look-save-btn'];
    if (lookSaveState === 'success') lookSaveButtonClasses.push('success');
    if (lookSaveState === 'error') lookSaveButtonClasses.push('error');
    const isSavingTheme = lookSaveState === 'saving';
    const lookSaveButtonLabel = lookSaveState === 'saving'
      ? 'Saving…'
      : lookSaveState === 'success'
        ? 'Saved'
        : lookSaveState === 'error'
          ? 'Try Again'
          : 'Save Theme Settings';

    return (
      <div className="look-feel-layout">
      <aside className="look-feel-preview">
        <div className="theme-preview-wrapper">
          <div className={previewClassName} style={previewStyles}>
            {theme.effects.scanlines && <span className="theme-preview-overlay scanlines" aria-hidden="true" />}
            {theme.effects.staticNoise && <span className="theme-preview-overlay static" aria-hidden="true" />}
            {theme.effects.embers && (
              <span className="theme-preview-overlay embers" aria-hidden="true">
                {emberPreviewParticles.map((particle) => (
                  <span key={particle.id} className="preview-ember-particle" style={particle.style}>
                    <span className="preview-ember-core" />
                  </span>
                ))}
              </span>
            )}
            {theme.effects.heartbeat && <span className="theme-preview-overlay heartbeat" aria-hidden="true" />}
            {theme.effects.grid && <span className="theme-preview-overlay grid" aria-hidden="true" />}
            {theme.effects.glare && <span className="theme-preview-overlay glare" aria-hidden="true" />}
            {theme.effects.vignette && <span className="theme-preview-overlay vignette" aria-hidden="true" />}
            {theme.effects.chromaticAberration && <span className="theme-preview-overlay chromatic" aria-hidden="true" />}
            <div className={previewContentClassName}>
              <div className="theme-preview-header">
                <span className="eyebrow">{headerText}</span>
                <span className="theme-preview-clock">ERA 07 · DAY 18 · 18:43</span>
              </div>
              <div className="theme-preview-body">
                <div className="theme-preview-column text">
                  <div className="preview-teletype" aria-live="polite">
                    {typedLines.map((line, index) => {
                      const original = PREVIEW_LINES[index] || `line-${index}`;
                      return (
                        <p key={original} className="preview-line">
                          <span>{line || ' '}</span>
                          {teletypeCursor.line === index && teletypeCursor.visible && (
                            <span className="preview-cursor" aria-hidden="true">_</span>
                          )}
                        </p>
                      );
                    })}
                    <p className="theme-preview-login">{loginText}</p>
                  </div>
                </div>
                <span className="theme-preview-divider" aria-hidden="true" />
                <div className="theme-preview-column image">
                  <ThemePreviewImage />
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <div className="look-feel-controls">
        <div className="settings-slab">
          <div className="settings-slab-header">
            <p className="eyebrow">Presets</p>
          </div>
          <div className="preset-row">
            {THEME_PRESETS.map((preset) => {
              const isActive = preset.id === theme.presetId;
              return (
                <button
                  key={preset.id}
                  className={`preset-card ${isActive ? 'active' : ''}`}
                  onClick={() => applyPreset(preset)}
                  type="button"
                >
                  <strong>{preset.name}</strong>
                  <span>{preset.description}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="settings-slab">
          <div className="settings-slab-header">
            <p className="eyebrow">Labels</p>
          </div>
          <div className="compact-grid two-col">
            <label className="form-group stacked">
              <span>Header Text</span>
              <input
                value={headerText}
                maxLength={60}
                onChange={(event) => setHeaderText(event.target.value)}
              />
            </label>
            <label className="form-group stacked">
              <span>Login Screen Message</span>
              <input
                value={loginText}
                maxLength={120}
                onChange={(event) => setLoginText(event.target.value)}
              />
            </label>
          </div>
        </div>

        <div className="settings-row two-up">
          <section className="settings-slab dense">
            <div className="settings-slab-header">
              <p className="eyebrow">Background</p>
            </div>
            <div className="color-picker-grid compact">
              <ColorPickerControl
                label="Background"
                value={theme.palette.background}
                onChange={(value) => upsertTheme((next) => ({
                  ...next,
                  palette: { ...next.palette, background: value }
                }))}
              />
              <ColorPickerControl
                label="Gradient start"
                value={theme.palette.gradient.start}
                disabled={!theme.palette.gradient.enabled}
                onChange={(value) => upsertTheme((next) => ({
                  ...next,
                  palette: { ...next.palette, gradient: { ...next.palette.gradient, start: value } }
                }))}
              />
              <ColorPickerControl
                label="Gradient end"
                value={theme.palette.gradient.end}
                disabled={!theme.palette.gradient.enabled}
                onChange={(value) => upsertTheme((next) => ({
                  ...next,
                  palette: { ...next.palette, gradient: { ...next.palette.gradient, end: value } }
                }))}
              />
            </div>
            <label className="checkbox-row toggle-row compact">
              <input
                type="checkbox"
                checked={theme.palette.gradient.enabled}
                onChange={() => upsertTheme((next) => ({
                  ...next,
                  palette: { ...next.palette, gradient: { ...next.palette.gradient, enabled: !next.palette.gradient.enabled } }
                }))}
              />
              <div>
                <SettingLabel
                  text="Enable background gradient"
                  info="Blends the start and end colors instead of showing a flat background."
                />
              </div>
            </label>
            <div className="compact-grid two-col tight">
              <label className="form-group stacked">
                <SettingLabel
                  text="Gradient style"
                  info="Switch between radial falloff and linear sweeps for the background lighting."
                />
                <select value={theme.palette.gradient.type} onChange={(event) => upsertTheme((next) => ({
                  ...next,
                  palette: { ...next.palette, gradient: { ...next.palette.gradient, type: event.target.value as 'radial' | 'linear' } }
                }))}>
                  <option value="radial">Radial</option>
                  <option value="linear">Linear</option>
                </select>
              </label>
              <label className="form-group stacked">
                <SettingLabel
                  text="Gradient angle"
                  info="Controls linear sweep direction. Ignored for radial maps."
                />
                <input
                  type="number"
                  value={theme.palette.gradient.angle}
                  disabled={theme.palette.gradient.type !== 'linear'}
                  onChange={(event) => upsertTheme((next) => ({
                    ...next,
                    palette: { ...next.palette, gradient: { ...next.palette.gradient, angle: Number(event.target.value) } }
                  }))}
                />
              </label>
            </div>
            <div className="compact-grid two-col tight">
              <label className="form-group stacked slider">
                <SettingLabel
                  text={`Radius (${Math.round(theme.palette.gradient.radius)}%)`}
                  info="Adjust how far the radial glow extends across the viewport."
                />
                <input
                  type="range"
                  min={12}
                  max={140}
                  value={theme.palette.gradient.radius}
                  onChange={(event) => upsertTheme((next) => ({
                    ...next,
                    palette: { ...next.palette, gradient: { ...next.palette.gradient, radius: Number(event.target.value) } }
                  }))}
                />
              </label>
              <label className="form-group stacked slider">
                <SettingLabel
                  text={`Intensity (${Math.round(theme.palette.gradient.intensity * 100)}%)`}
                  info="Raise for brighter gradients; lower for subtle lighting."
                />
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={theme.palette.gradient.intensity}
                  onChange={(event) => upsertTheme((next) => ({
                    ...next,
                    palette: { ...next.palette, gradient: { ...next.palette.gradient, intensity: Number(event.target.value) } }
                  }))}
                />
              </label>
            </div>
            <label className="form-group stacked slider">
              <SettingLabel
                text={`Background glow (${Math.round(theme.palette.glow.background * 100)}%)`}
                info="Sets ambient halo on background panels to avoid harsh edges."
              />
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={theme.palette.glow.background}
                onChange={(event) => upsertTheme((next) => ({
                  ...next,
                  palette: { ...next.palette, glow: { ...next.palette.glow, background: Number(event.target.value) } }
                }))}
              />
            </label>
          </section>

          <section className="settings-slab dense">
            <div className="settings-slab-header">
              <p className="eyebrow">Typography</p>
            </div>
            <div className="color-picker-grid compact">
              <ColorPickerControl
                label="Foreground"
                value={theme.palette.foreground}
                onChange={(value) => upsertTheme((next) => ({
                  ...next,
                  palette: { ...next.palette, foreground: value }
                }))}
              />
              <ColorPickerControl
                label="Alert"
                value={theme.palette.alert}
                onChange={(value) => upsertTheme((next) => ({
                  ...next,
                  palette: { ...next.palette, alert: value }
                }))}
              />
            </div>
            <div className="compact-grid two-col tight">
              <label className="form-group stacked slider">
                <SettingLabel
                  text={`Foreground glow (${Math.round(theme.palette.glow.foreground * 100)}%)`}
                  info="Controls bloom applied to text and UI chrome."
                />
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={theme.palette.glow.foreground}
                  onChange={(event) => upsertTheme((next) => ({
                    ...next,
                    palette: { ...next.palette, glow: { ...next.palette.glow, foreground: Number(event.target.value) } }
                  }))}
                />
              </label>
              <label className="form-group stacked slider">
                <SettingLabel
                  text={`Alert glow (${Math.round(theme.palette.glow.alert * 100)}%)`}
                  info="Dial how intense emergency notifications appear."
                />
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={theme.palette.glow.alert}
                  onChange={(event) => upsertTheme((next) => ({
                    ...next,
                    palette: { ...next.palette, glow: { ...next.palette.glow, alert: Number(event.target.value) } }
                  }))}
                />
              </label>
            </div>
            <label className="form-group stacked">
              <span>Font family</span>
              <select value={theme.typography.fontFamily} onChange={(event) => upsertTheme((next) => ({
                ...next,
                typography: { ...next.typography, fontFamily: event.target.value }
              }))}>
                {FONT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <div className="compact-grid two-col tight">
              <label className="form-group stacked slider">
                <SettingLabel
                  text={`Font size (${Math.round(theme.typography.fontScale * 100)}%)`}
                  info="Scales all player UI typography relative to the base theme."
                />
                <input
                  type="range"
                  min={0.75}
                  max={1.25}
                  step={0.01}
                  value={theme.typography.fontScale}
                  onChange={(event) => upsertTheme((next) => ({
                    ...next,
                    typography: { ...next.typography, fontScale: Number(event.target.value) }
                  }))}
                />
              </label>
              <label className="form-group stacked slider">
                <SettingLabel
                  text={`Line height (${Math.round(theme.typography.lineHeightScale * 100)}%)`}
                  info="Fine-tune spacing for dense readouts or airy story beats."
                />
                <input
                  type="range"
                  min={0.9}
                  max={1.3}
                  step={0.01}
                  value={theme.typography.lineHeightScale}
                  onChange={(event) => upsertTheme((next) => ({
                    ...next,
                    typography: { ...next.typography, lineHeightScale: Number(event.target.value) }
                  }))}
                />
              </label>
              <label className="form-group stacked slider">
                <SettingLabel
                  text={`Letter spacing (${Math.round(theme.typography.letterSpacingScale * 100)}%)`}
                  info="Loosen or tighten character spacing for different tone."
                />
                <input
                  type="range"
                  min={0.9}
                  max={1.5}
                  step={0.01}
                  value={theme.typography.letterSpacingScale}
                  onChange={(event) => upsertTheme((next) => ({
                    ...next,
                    typography: { ...next.typography, letterSpacingScale: Number(event.target.value) }
                  }))}
                />
              </label>
            </div>
          </section>
        </div>

        <section className="settings-slab dense">
          <div className="settings-slab-header">
            <p className="eyebrow">Images</p>
          </div>
          <div className="compact-grid two-col tight">
            <label className="form-group stacked slider">
              <SettingLabel
                text={`Hue shift (${theme.palette.media.hueShift}\u00B0)`}
                info="Rotates all in-app images around the color wheel."
              />
              <input
                type="range"
                min={-180}
                max={180}
                value={theme.palette.media.hueShift}
                onChange={(event) => upsertTheme((next) => ({
                  ...next,
                  palette: { ...next.palette, media: { ...next.palette.media, hueShift: Number(event.target.value) } }
                }))}
              />
            </label>
            <label className="form-group stacked slider">
              <SettingLabel
                text={`Saturation (${theme.palette.media.saturation.toFixed(2)}x)`}
                info="Push to amplify color, pull back for desaturated monitors."
              />
              <input
                type="range"
                min={0.5}
                max={2}
                step={0.05}
                value={theme.palette.media.saturation}
                onChange={(event) => upsertTheme((next) => ({
                  ...next,
                  palette: { ...next.palette, media: { ...next.palette.media, saturation: Number(event.target.value) } }
                }))}
              />
            </label>
            <label className="form-group stacked slider">
              <SettingLabel
                text={`Brightness (${theme.palette.media.brightness.toFixed(2)}x)`}
                info="Balances light levels for images without touching the UI."
              />
              <input
                type="range"
                min={0.5}
                max={1.4}
                step={0.05}
                value={theme.palette.media.brightness}
                onChange={(event) => upsertTheme((next) => ({
                  ...next,
                  palette: { ...next.palette, media: { ...next.palette.media, brightness: Number(event.target.value) } }
                }))}
              />
            </label>
            <label className="form-group stacked slider">
              <SettingLabel
                text={`Contrast (${theme.palette.media.contrast.toFixed(2)}x)`}
                info="Sharpen or soften tonal differences in player media."
              />
              <input
                type="range"
                min={0.8}
                max={1.5}
                step={0.05}
                value={theme.palette.media.contrast}
                onChange={(event) => upsertTheme((next) => ({
                  ...next,
                  palette: { ...next.palette, media: { ...next.palette.media, contrast: Number(event.target.value) } }
                }))}
              />
            </label>
          </div>
        </section>

        {renderEffectsSection()}

        <div className="settings-slab look-feel-actions">
          <button
            className={lookSaveButtonClasses.join(' ')}
            onClick={saveLookAndFeel}
            disabled={isSavingTheme}
          >
            {lookSaveButtonLabel}
          </button>
        </div>
      </div>
    </div>
    );
  };

  const renderStateSection = () => <GamestateView />;

  const renderActiveSection = () => {
    if (activeSection === 'state') return renderStateSection();
    return renderLookSection();
  };

  return (
    <div className="app-interface">
      <div className="panel-header">
        <h2>{sectionTitle}</h2>
      </div>

      <div className="settings-shell">
        {!isSectionControlled && (
          <nav className="settings-tabs" aria-label="Settings categories">
            {SETTINGS_SECTIONS.map((module) => {
              const Icon = module.icon;
              const isActive = module.id === activeSection;
              return (
                <button
                  key={module.id}
                  type="button"
                  className={`settings-tab ${isActive ? 'active' : ''}`}
                  onClick={() => handleSectionChange(module.id)}
                  style={{ '--settings-accent': module.accent } as CSSProperties}
                  aria-pressed={isActive}
                >
                  <Icon size={16} />
                  <span>{module.title}</span>
                </button>
              );
            })}
          </nav>
        )}

        <section className="settings-panel">
          <div ref={sectionContentRef} className="settings-panel-section content-enter">
            {statusError && (
              <div className="error-box">
                <p>{statusError}</p>
              </div>
            )}

            {renderActiveSection()}
          </div>
        </section>
      </div>
    </div>
  );
}

export default SettingsForm;
