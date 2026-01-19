import { PlayerThemeSettings, ThemeEffectSettings } from '../types';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const BASE_VIEWPORT_WIDTH = 1920;
const pxToViewportWidth = (value: number) => `${((value / BASE_VIEWPORT_WIDTH) * 100).toFixed(4)}vw`;

interface RGB {
  r: number;
  g: number;
  b: number;
}

const componentToHex = (value: number) => value.toString(16).padStart(2, '0');

const rgbToHex = (rgb: RGB) => `#${componentToHex(rgb.r)}${componentToHex(rgb.g)}${componentToHex(rgb.b)}`;

const parseHexColor = (input: string): RGB => {
  const hex = input.replace('#', '');
  const normalized = hex.length === 3 ? hex.split('').map((char) => char + char).join('') : hex;
  const intValue = parseInt(normalized, 16);
  return {
    r: (intValue >> 16) & 255,
    g: (intValue >> 8) & 255,
    b: intValue & 255
  };
};

const parseRgbColor = (input: string): RGB => {
  const matches = input.match(/rgba?\(([^)]+)\)/i);
  if (!matches) {
    return { r: 255, g: 255, b: 255 };
  }
  const [r = '255', g = '255', b = '255'] = matches[1].split(',').map((segment) => segment.trim());
  return {
    r: clamp(Number(r), 0, 255) || 0,
    g: clamp(Number(g), 0, 255) || 0,
    b: clamp(Number(b), 0, 255) || 0
  };
};

const parseColor = (input: string): RGB => {
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
  return parseHexColor('#ffffff');
};

const rgbToString = (rgb: RGB) => `${rgb.r}, ${rgb.g}, ${rgb.b}`;

const withAlpha = (color: string, alpha: number) => {
  const parsed = parseColor(color);
  return `rgba(${rgbToString(parsed)}, ${clamp(alpha, 0, 1).toFixed(2)})`;
};

const lightenColor = (rgb: RGB, amount = 0.1): RGB => ({
  r: clamp(Math.round(rgb.r + (255 - rgb.r) * amount), 0, 255),
  g: clamp(Math.round(rgb.g + (255 - rgb.g) * amount), 0, 255),
  b: clamp(Math.round(rgb.b + (255 - rgb.b) * amount), 0, 255)
});

const darkenColor = (rgb: RGB, amount = 0.1): RGB => ({
  r: clamp(Math.round(rgb.r * (1 - amount)), 0, 255),
  g: clamp(Math.round(rgb.g * (1 - amount)), 0, 255),
  b: clamp(Math.round(rgb.b * (1 - amount)), 0, 255)
});

const buildGlow = (rgb: RGB, intensity: number) => {
  const radius = (4 + clamp(intensity, 0, 1) * 12).toFixed(2);
  const alpha = (0.15 + clamp(intensity, 0, 1) * 0.85).toFixed(2);
  return `0 0 ${radius}px rgba(${rgbToString(rgb)}, ${alpha})`;
};

const buildGradient = (theme: PlayerThemeSettings) => {
  const { gradient } = theme.palette;
  if (!gradient.enabled) {
    return 'none';
  }
  if (gradient.type === 'linear') {
    return `linear-gradient(${gradient.angle}deg, ${withAlpha(gradient.start, gradient.intensity)}, ${withAlpha(gradient.end, gradient.intensity)})`;
  }
  const radius = clamp(gradient.radius ?? 68, 12, 140);
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

export const DEFAULT_PLAYER_THEME: PlayerThemeSettings = {
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
  effectSettings: JSON.parse(JSON.stringify(DEFAULT_EFFECT_SETTINGS))
};

export type ThemeInput = string | PlayerThemeSettings | null | undefined;

export const parsePlayerTheme = (input?: ThemeInput): PlayerThemeSettings => {
  const fallback = clone(DEFAULT_PLAYER_THEME);
  if (!input) {
    return fallback;
  }

  try {
    const parsed: Partial<PlayerThemeSettings> & { effects?: any } =
      typeof input === 'string' ? JSON.parse(input) : (input || {});

    const mergedEffects: PlayerThemeSettings['effects'] & Record<string, boolean> = {
      ...fallback.effects,
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

    const mergedEffectSettings: ThemeEffectSettings = {
      embers: {
        ...DEFAULT_EFFECT_SETTINGS.embers,
        ...((parsed.effectSettings && parsed.effectSettings.embers) || {})
      },
      heartbeat: {
        ...DEFAULT_EFFECT_SETTINGS.heartbeat,
        ...((parsed.effectSettings && parsed.effectSettings.heartbeat) || {})
      },
      silicon: {
        ...DEFAULT_EFFECT_SETTINGS.silicon,
        ...((parsed.effectSettings && parsed.effectSettings.silicon) || {})
      }
    };

    return {
      ...fallback,
      ...parsed,
      palette: {
        ...fallback.palette,
        ...(parsed.palette || {}),
        gradient: {
          ...fallback.palette.gradient,
          ...((parsed.palette && parsed.palette.gradient) || {})
        },
        glow: {
          ...fallback.palette.glow,
          ...((parsed.palette && parsed.palette.glow) || {})
        },
        media: {
          ...fallback.palette.media,
          ...((parsed.palette && parsed.palette.media) || {})
        }
      },
      typography: {
        ...fallback.typography,
        ...(parsed.typography || {})
      },
      effects: mergedEffects,
      effectSettings: mergedEffectSettings
    };
  } catch (error) {
    console.warn('Failed to parse player theme, falling back to default.', error);
    return fallback;
  }
};

export const applyPlayerTheme = (theme: PlayerThemeSettings) => {
  if (typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;
  const setColorVar = (name: string, value: string, fallback: string) => {
    const normalized = value || fallback;
    root.style.setProperty(name, normalized);
    const rgb = rgbToString(parseColor(normalized));
    root.style.setProperty(`${name}-rgb`, rgb);
  };
  const foreground = parseColor(theme.palette.foreground);
  const background = parseColor(theme.palette.background);
  const alert = parseColor(theme.palette.alert);

  const foregroundLight = rgbToHex(lightenColor(foreground, 0.12));
  const foregroundDark = rgbToHex(darkenColor(foreground, 0.12));

  root.style.setProperty('--player-foreground', theme.palette.foreground);
  root.style.setProperty('--player-foreground-rgb', rgbToString(foreground));
  root.style.setProperty('--player-foreground-light', foregroundLight);
  root.style.setProperty('--player-foreground-dark', foregroundDark);

  root.style.setProperty('--player-background', theme.palette.background);
  root.style.setProperty('--player-background-rgb', rgbToString(background));

  root.style.setProperty('--player-alert', theme.palette.alert);
  root.style.setProperty('--player-alert-rgb', rgbToString(alert));

  root.style.setProperty('--player-foreground-glow', buildGlow(foreground, theme.palette.glow.foreground));
  root.style.setProperty('--player-background-glow', buildGlow(background, theme.palette.glow.background));
  root.style.setProperty('--player-alert-glow', buildGlow(alert, theme.palette.glow.alert));

  root.style.setProperty('--player-background-gradient', buildGradient(theme));
  root.style.setProperty('--player-scanlines-foreground', `rgba(${rgbToString(foreground)}, 0.08)`);
  root.style.setProperty('--player-scanlines-background', `rgba(${rgbToString(background)}, 0.45)`);
  root.style.setProperty('--player-font-family', theme.typography.fontFamily);
  root.style.setProperty('--player-type-scale', theme.typography.fontScale.toString());
  root.style.setProperty('--player-line-height-scale', theme.typography.lineHeightScale.toString());
  root.style.setProperty('--player-letter-spacing-scale', theme.typography.letterSpacingScale.toString());
  root.style.setProperty('--player-image-filter', buildMediaFilter(theme));

  const markerBg = rgbToHex(lightenColor(background, 0.75));
  const markerBorder = rgbToHex(lightenColor(background, 0.55));
  root.style.setProperty('--player-map-label-bg', markerBg);
  root.style.setProperty('--player-map-label-border', markerBorder);
  root.style.setProperty('--player-map-label-text', theme.palette.background);

  const clamp01 = (value: number) => clamp(value, 0, 1);
  const effectSettings = theme.effectSettings;

  const emberDensity = clamp(effectSettings.embers.density, 16, 72);
  setColorVar('--effect-embers-primary', effectSettings.embers.primaryColor || '', '#ffbd81');
  setColorVar('--effect-embers-secondary', effectSettings.embers.secondaryColor || '', '#ff8f3e');
  root.style.setProperty('--effect-embers-density', `${emberDensity}px`);
  root.style.setProperty('--effect-embers-speed', Math.max(0.25, effectSettings.embers.driftSpeed).toFixed(2));
  root.style.setProperty('--effect-embers-glow', clamp01(effectSettings.embers.glow).toFixed(2));
  root.style.setProperty('--effect-embers-sway-range', pxToViewportWidth(clamp(effectSettings.embers.swayAmount, 6, 140)));
  root.style.setProperty('--effect-embers-sway-speed', `${clamp(effectSettings.embers.swaySpeed, 2, 14)}s`);
  const hoverRange = clamp(10 + emberDensity * 0.25, 12, 42);
  root.style.setProperty('--effect-embers-hover-range', `${hoverRange}vh`);

  const heartbeatRate = Math.max(1.2, effectSettings.heartbeat.pulseRate);
  const heartbeatIntensity = clamp01(effectSettings.heartbeat.intensity);
  const hbScaleMin = (0.9 + heartbeatIntensity * 0.05).toFixed(3);
  const hbScaleMid = (0.96 + heartbeatIntensity * 0.04).toFixed(3);
  const hbScaleMax = (1.04 + heartbeatIntensity * 0.08).toFixed(3);
  setColorVar('--effect-heartbeat-core', effectSettings.heartbeat.coreColor || '', theme.palette.foreground);
  setColorVar('--effect-heartbeat-ring', effectSettings.heartbeat.ringColor || '', theme.palette.alert);
  root.style.setProperty('--effect-heartbeat-rate', `${heartbeatRate}s`);
  root.style.setProperty('--effect-heartbeat-intensity', heartbeatIntensity.toFixed(2));
  root.style.setProperty('--effect-heartbeat-scale-min', hbScaleMin);
  root.style.setProperty('--effect-heartbeat-scale-mid', hbScaleMid);
  root.style.setProperty('--effect-heartbeat-scale-max', hbScaleMax);

  setColorVar('--effect-silicon-grid-color', effectSettings.silicon.gridColor || '', '#78d1ff');
  setColorVar('--effect-silicon-glare-color', effectSettings.silicon.glareColor || '', '#88ffff');
  const siliconScale = clamp(effectSettings.silicon.gridScale, 12, 120);
  root.style.setProperty('--effect-silicon-scale', pxToViewportWidth(siliconScale));
  root.style.setProperty('--effect-silicon-speed', `${Math.max(3, effectSettings.silicon.sweepSpeed)}s`);

};
