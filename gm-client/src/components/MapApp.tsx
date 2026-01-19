import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ChangeEvent as ReactChangeEvent,
  FormEvent as ReactFormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent
} from 'react';
import { createPortal } from 'react-dom';
import type { LucideIcon } from 'lucide-react';
import {
  ArchiveRestore,
  ArrowLeft,
  Bot,
  Box,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleUser,
  Cross,
  Diamond,
  Drone,
  FlagTriangleRight,
  Image as ImageIcon,
  Layers,
  MapPin,
  PenSquare,
  Plus,
  RefreshCw,
  Rocket,
  Skull,
  Star,
  Trash2,
  Triangle,
  X
} from 'lucide-react';
import { GameApp, Character, MapAppData, MapLayer, MapMarker, MapMarkerIcon } from '../types';
import { appsApi } from '../services/api';
import AccessControlPanel from './AccessControlPanel';

interface MapAppProps {
  app: GameApp;
  characters: Character[];
  onBack?: () => void;
  onDelete?: (id: string) => void;
}

const MARKER_ICON_DEFS: { label: string; value: MapMarkerIcon; Glyph: LucideIcon }[] = [
  { label: 'Circle User', value: 'circle-user', Glyph: CircleUser },
  { label: 'Bot', value: 'bot', Glyph: Bot },
  { label: 'Drone', value: 'drone', Glyph: Drone },
  { label: 'Flag', value: 'flag-triangle-right', Glyph: FlagTriangleRight },
  { label: 'Skull', value: 'skull', Glyph: Skull },
  { label: 'Rocket', value: 'rocket', Glyph: Rocket },
  { label: 'Star', value: 'star', Glyph: Star },
  { label: 'Triangle', value: 'triangle', Glyph: Triangle },
  { label: 'Circle', value: 'circle', Glyph: Circle },
  { label: 'Diamond', value: 'diamond', Glyph: Diamond },
  { label: 'Cross', value: 'cross', Glyph: Cross },
  { label: 'Box', value: 'box', Glyph: Box },
  { label: 'Map Pin', value: 'map-pin', Glyph: MapPin }
];

const MARKER_GLYPHS: Record<MapMarkerIcon, LucideIcon> = MARKER_ICON_DEFS.reduce((acc, def) => {
  acc[def.value] = def.Glyph;
  return acc;
}, {} as Record<MapMarkerIcon, LucideIcon>);
const MARKER_ICON_VALUES: MapMarkerIcon[] = MARKER_ICON_DEFS.map(def => def.value);
const LEGACY_ICON_MAP: Record<string, MapMarkerIcon> = {
  pin: 'map-pin',
  square: 'box'
};

const MARKER_DRAG_TYPE = 'application/x-map-marker';
const MARKER_DRAG_ORIGIN = 'application/x-map-origin';
type DragOrigin = 'storage' | 'map';

const MIN_SPINNER_DURATION_MS = 450;
const getTimestamp = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const toId = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 10));
const COLOR_RING_SATURATION = 70;
const COLOR_RING_LIGHTNESS = 55;
const COLOR_RING_INDICATOR_OFFSET = 116;
const ICON_RING_DISTANCE = 88;
const LAYER_NAME_PREFIX = 'Layer';
const DEFAULT_LAYER_NAME = `${LAYER_NAME_PREFIX} 1`;
const INITIAL_LAYER_ID = 'layer-initial';

const DEFAULT_MAP_DATA: MapAppData = {
  markers: [],
  masks: [],
  layers: [
    {
      id: INITIAL_LAYER_ID,
      name: DEFAULT_LAYER_NAME,
      backgroundImageData: undefined,
      backgroundImageMimeType: undefined,
      backgroundImageFilename: undefined
    }
  ],
  activeLayerId: INITIAL_LAYER_ID
};

const normalizeHue = (value: number) => ((value % 360) + 360) % 360;

const hexToHsl = (hex: string) => {
  let sanitized = hex?.replace('#', '') ?? '';
  if (sanitized.length === 3) {
    sanitized = sanitized.split('').map(char => char + char).join('');
  }
  if (sanitized.length !== 6) {
    return { h: 0, s: 100, l: 50 };
  }
  const r = parseInt(sanitized.slice(0, 2), 16) / 255;
  const g = parseInt(sanitized.slice(2, 4), 16) / 255;
  const b = parseInt(sanitized.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return {
    h: normalizeHue(h * 360),
    s: s * 100,
    l: l * 100
  };
};

const hslToHex = (h: number, s: number, l: number) => {
  const hue = normalizeHue(h) / 360;
  const saturation = Math.max(0, Math.min(100, s)) / 100;
  const lightness = Math.max(0, Math.min(100, l)) / 100;
  const hueToRgb = (n: number) => {
    const k = (n + hue * 12) % 12;
    const a = saturation * Math.min(lightness, 1 - lightness);
    const channel = lightness - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(channel * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${hueToRgb(0)}${hueToRgb(8)}${hueToRgb(4)}`;
};

const getHueFromColor = (color: string) => hexToHsl(color).h;
const colorFromHue = (hue: number) => hslToHex(hue, COLOR_RING_SATURATION, COLOR_RING_LIGHTNESS);

const isMarkerIcon = (value: unknown): value is MapMarkerIcon =>
  typeof value === 'string' && MARKER_ICON_VALUES.includes(value as MapMarkerIcon);

const sanitizeMarker = (marker: Partial<MapMarker>): MapMarker => ({
  id: marker.id || toId(),
  label: typeof marker.label === 'string' ? marker.label.slice(0, 48) : 'Marker',
  description: marker.description || '',
  icon: isMarkerIcon(marker.icon) ? marker.icon : LEGACY_ICON_MAP[String(marker.icon)] ?? 'map-pin',
  color: marker.color || 'var(--color-accent-cyan)',
  position: {
    x: clamp01(marker.position?.x ?? 0.5),
    y: clamp01(marker.position?.y ?? 0.5)
  },
  locked: Boolean(marker.locked),
  isPlaced: Boolean(marker.isPlaced),
  placedLayerId: typeof marker.placedLayerId === 'string' ? marker.placedLayerId : undefined
});

const sanitizeLayer = (layer?: Partial<MapLayer>, fallbackName = DEFAULT_LAYER_NAME): MapLayer => ({
  id: layer?.id || toId(),
  name: layer?.name?.trim() || fallbackName,
  backgroundImageData: typeof layer?.backgroundImageData === 'string' ? layer.backgroundImageData : undefined,
  backgroundImageMimeType: typeof layer?.backgroundImageMimeType === 'string' ? layer.backgroundImageMimeType : undefined,
  backgroundImageFilename: typeof layer?.backgroundImageFilename === 'string' ? layer.backgroundImageFilename : undefined
});

const getNextLayerName = (layers: MapLayer[]): string => {
  const taken = new Set(layers.map(layer => layer.name));
  let suffix = layers.length + 1;
  let candidate = `${LAYER_NAME_PREFIX} ${suffix}`;
  while (taken.has(candidate)) {
    suffix += 1;
    candidate = `${LAYER_NAME_PREFIX} ${suffix}`;
  }
  return candidate;
};

const sanitizeMapData = (data?: MapAppData): MapAppData => {
  if (!data) return DEFAULT_MAP_DATA;

  const legacyMarkers = Array.isArray(data.markers) ? data.markers.map(sanitizeMarker) : [];
  const markerMap = new Map<string, MapMarker>(legacyMarkers.map(marker => [marker.id, marker]));

  const rawLayers = Array.isArray(data.layers) && data.layers.length > 0 ? data.layers : null;
  const layers: MapLayer[] = rawLayers
    ? rawLayers.map((layer, index) => sanitizeLayer(layer, `${LAYER_NAME_PREFIX} ${index + 1}`))
    : [sanitizeLayer({ id: INITIAL_LAYER_ID, name: DEFAULT_LAYER_NAME }, DEFAULT_LAYER_NAME)];

  if (rawLayers) {
    rawLayers.forEach((layer, index) => {
      if (!Array.isArray(layer?.markers) || layer.markers.length === 0) return;
      const layerId = layers[index]?.id ?? toId();
      layer.markers.forEach(marker => {
        const sanitized = sanitizeMarker(marker);
        const merged = markerMap.get(sanitized.id)
          ? { ...markerMap.get(sanitized.id)!, ...sanitized }
          : sanitized;
        markerMap.set(sanitized.id, {
          ...merged,
          isPlaced: true,
          placedLayerId: layerId,
          position: sanitized.position
        });
      });
    });
  }

  const layerIds = new Set(layers.map(layer => layer.id));
  const markers = Array.from(markerMap.values()).map(marker => {
    if (marker.isPlaced) {
      if (!marker.placedLayerId || !layerIds.has(marker.placedLayerId)) {
        return { ...marker, isPlaced: false, placedLayerId: undefined };
      }
      return marker;
    }
    return marker.placedLayerId ? { ...marker, placedLayerId: undefined } : marker;
  });

  const activeLayerId = data.activeLayerId && layerIds.has(data.activeLayerId) ? data.activeLayerId : layers[0]?.id;

  return {
    mapImageData: data.mapImageData,
    mapImageMimeType: data.mapImageMimeType,
    mapImageFilename: data.mapImageFilename,
    markers,
    masks: Array.isArray(data.masks) ? data.masks : [],
    layers,
    activeLayerId
  };
};

function MapApp({ app, characters, onBack, onDelete }: MapAppProps) {
  const [mapData, setMapData] = useState<MapAppData>(DEFAULT_MAP_DATA);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [draggingMarkerId, setDraggingMarkerId] = useState<string | null>(null);
  const [isStorageDragTarget, setIsStorageDragTarget] = useState(false);
  const [iconPickerMarkerId, setIconPickerMarkerId] = useState<string | null>(null);
  const [pickerVisibleMarkerId, setPickerVisibleMarkerId] = useState<string | null>(null);
  const [isSpinnerActive, setIsSpinnerActive] = useState(false);
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [layerNameDraft, setLayerNameDraft] = useState('');
  const commitMapData = useCallback((updater: (prev: MapAppData) => MapAppData) => {
    setMapData(prev => {
      const next = sanitizeMapData(updater(prev));
      latestDataRef.current = next;
      return next;
    });
  }, []);
  const mapStageRef = useRef<HTMLDivElement>(null);
  const layerNameInputRef = useRef<HTMLInputElement>(null);
  const layerImageInputRef = useRef<HTMLInputElement>(null);
  const markerPickerAnchorRef = useRef(new Map<string, HTMLElement>());
  const pickerPortalRef = useRef<HTMLDivElement>(null);
  const [pickerPosition, setPickerPosition] = useState<{ left: number; top: number } | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const successTimerRef = useRef<number | null>(null);
  const spinnerStartRef = useRef<number | null>(null);
  const spinnerTimeoutRef = useRef<number | null>(null);
  const skipPersistRef = useRef(false);
  const hasBootstrappedRef = useRef(false);
  const latestDataRef = useRef<MapAppData>(DEFAULT_MAP_DATA);
  const isIconPickerActiveRef = useRef(false);
  const previousPickerStateRef = useRef(false);
  const pendingPickerSaveRef = useRef(false);
  const isStorageDragRef = useRef(false);
  const cancelLayerRenameRef = useRef(false);
  const saveRetryAttemptRef = useRef(0);

  useEffect(() => {
    const sanitized = sanitizeMapData(app.data);
    skipPersistRef.current = true;
    hasBootstrappedRef.current = false;
    latestDataRef.current = sanitized;
    setMapData(sanitized);
    setSelectedUsers(new Set(app.allowed_users));
    setError(null);
    setSuccess(null);
    setIconPickerMarkerId(null);
    setIsSpinnerActive(false);
    spinnerStartRef.current = null;
    if (spinnerTimeoutRef.current) {
      window.clearTimeout(spinnerTimeoutRef.current);
      spinnerTimeoutRef.current = null;
    }
  }, [app]);

  useEffect(() => {
    if (editingLayerId && layerNameInputRef.current) {
      layerNameInputRef.current.focus();
      layerNameInputRef.current.select();
    }
  }, [editingLayerId]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (successTimerRef.current) {
        window.clearTimeout(successTimerRef.current);
        successTimerRef.current = null;
      }
      if (spinnerTimeoutRef.current) {
        window.clearTimeout(spinnerTimeoutRef.current);
        spinnerTimeoutRef.current = null;
      }
    };
  }, []);

  const layers = mapData.layers ?? [];
  const hasValidActiveLayer = layers.some(layer => layer.id === mapData.activeLayerId);
  const activeLayer = hasValidActiveLayer
    ? layers.find(layer => layer.id === mapData.activeLayerId) ?? null
    : layers[0] ?? null;
  const activeLayerId = activeLayer?.id ?? null;
  const markers = mapData.markers ?? [];
  const deployedMarkers = useMemo(
    () => markers.filter(marker => marker.isPlaced && marker.placedLayerId === activeLayerId),
    [markers, activeLayerId]
  );
  const isEditingActiveLayerName = editingLayerId === activeLayerId;
  const layerNameInputId = activeLayerId ? `layer-name-input-${activeLayerId}` : 'layer-name-input';
  const activeLayerBackgroundSrc = activeLayer?.backgroundImageData
    ? `data:${activeLayer.backgroundImageMimeType || 'image/png'};base64,${activeLayer.backgroundImageData}`
    : null;
  const iconPickerOptions = useMemo(
    () => MARKER_ICON_DEFS.map((definition, index) => ({
      ...definition,
      angle: (360 / MARKER_ICON_DEFS.length) * index
    })),
    []
  );

  const activePickerMarker = useMemo(
    () => (iconPickerMarkerId ? markers.find(marker => marker.id === iconPickerMarkerId) ?? null : null),
    [iconPickerMarkerId, markers]
  );

  const updatePickerPosition = useCallback(() => {
    if (!iconPickerMarkerId) {
      setPickerPosition(null);
      return;
    }
    const anchor = markerPickerAnchorRef.current.get(iconPickerMarkerId);
    if (!anchor) {
      setPickerPosition(null);
      return;
    }

    const rect = anchor.getBoundingClientRect();
    const desiredLeft = rect.left + rect.width / 2;
    const desiredTop = rect.top + rect.height / 2;

    const pickerSize = 280;
    const margin = 12;
    const half = pickerSize / 2;

    const clampedLeft = Math.min(
      Math.max(desiredLeft, margin + half),
      Math.max(margin + half, window.innerWidth - margin - half)
    );
    const clampedTop = Math.min(
      Math.max(desiredTop, margin + half),
      Math.max(margin + half, window.innerHeight - margin - half)
    );

    setPickerPosition({ left: clampedLeft, top: clampedTop });
  }, [iconPickerMarkerId]);

  const updateMarker = (id: string, updater: (marker: MapMarker) => MapMarker) => {
    commitMapData(prev => ({
      ...prev,
      markers: (prev.markers ?? []).map(marker => (marker.id === id ? updater(marker) : marker))
    }));
  };

  const updateLayer = (id: string, updater: (layer: MapLayer) => MapLayer) => {
    commitMapData(prev => ({
      ...prev,
      layers: (prev.layers ?? []).map(layer => (layer.id === id ? updater(layer) : layer))
    }));
  };

  const toggleUser = async (username: string) => {
    const updated = new Set(selectedUsers);
    if (updated.has(username)) {
      updated.delete(username);
    } else {
      updated.add(username);
    }
    setSelectedUsers(updated);
    setError(null);

    try {
      await appsApi.update(app.id, { allowed_users: Array.from(updated) });
    } catch (err: any) {
      console.error('Failed to update allowed users:', err);
      setError(err.response?.data?.error || 'Failed to update allowed users');
      setSelectedUsers(new Set(app.allowed_users));
    }
  };

  const handleAddMarker = () => {
    if (!layers.length) return;
    const next: MapMarker = {
      id: toId(),
      label: `Marker ${markers.length + 1}`,
      description: '',
      icon: 'map-pin',
      color: 'var(--color-accent-cyan)',
      position: { x: 0.5, y: 0.5 },
      locked: false,
      isPlaced: false,
      placedLayerId: undefined
    };
    commitMapData(prev => ({
      ...prev,
      markers: [...(prev.markers ?? []), next]
    }));
  };

  const handleRemoveMarker = (id: string) => {
    commitMapData(prev => ({
      ...prev,
      markers: (prev.markers ?? []).filter(marker => marker.id !== id)
    }));
    setIconPickerMarkerId(prev => (prev === id ? null : prev));
  };

  const handleMarkerFieldChange = (id: string, field: keyof MapMarker, value: any) => {
    updateMarker(id, marker => ({ ...marker, [field]: value }));
  };

  const handleMarkerIconSelect = (id: string, icon: MapMarkerIcon) => {
    handleMarkerFieldChange(id, 'icon', icon);
  };

  const handleIconKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>, markerId: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setIconPickerMarkerId(markerId);
    }
  };

  const handleRecallMarker = (id: string) => {
    updateMarker(id, marker => ({ ...marker, isPlaced: false, placedLayerId: undefined }));
  };

  const handleSelectLayer = (layerId: string) => {
    if (!layerId || layerId === activeLayerId) return;
    commitMapData(prev => {
      const availableLayers = prev.layers ?? [];
      if (!availableLayers.some(layer => layer.id === layerId)) {
        return prev;
      }
      return {
        ...prev,
        activeLayerId: layerId
      };
    });
    setIconPickerMarkerId(null);
  };

  const handleCycleLayer = (direction: 'prev' | 'next') => {
    if (layers.length <= 1 || !activeLayerId) return;
    const currentIndex = layers.findIndex(layer => layer.id === activeLayerId);
    if (currentIndex === -1) return;
    const offset = direction === 'next' ? 1 : -1;
    const nextIndex = (currentIndex + offset + layers.length) % layers.length;
    handleSelectLayer(layers[nextIndex].id);
  };

  const handleAddLayer = () => {
    commitMapData(prev => {
      const prevLayers = prev.layers ?? [];
      const nextName = getNextLayerName(prevLayers);
      const newLayer: MapLayer = {
        id: toId(),
        name: nextName,
        backgroundImageData: undefined,
        backgroundImageMimeType: undefined,
        backgroundImageFilename: undefined
      };
      return {
        ...prev,
        layers: [...prevLayers, newLayer],
        activeLayerId: newLayer.id
      };
    });
    setIconPickerMarkerId(null);
  };

  const handleRemoveLayer = () => {
    if (!activeLayerId || layers.length <= 1) return;
    const targetLayer = layers.find(layer => layer.id === activeLayerId);
    const layerLabel = targetLayer?.name ?? 'this layer';
    if (!confirm(`Delete ${layerLabel}? All markers on it will be removed.`)) {
      return;
    }
    commitMapData(prev => {
      const nextLayers = (prev.layers ?? []).filter(layer => layer.id !== activeLayerId);
      const nextActive = nextLayers[0]?.id;
      return {
        ...prev,
        layers: nextLayers,
        activeLayerId: nextActive
      };
    });
    setIconPickerMarkerId(null);
  };

  const exitLayerRenameMode = () => {
    setEditingLayerId(null);
    setLayerNameDraft('');
  };

  const handleBeginLayerRename = () => {
    if (!activeLayer) return;
    cancelLayerRenameRef.current = false;
    setEditingLayerId(activeLayer.id);
    setLayerNameDraft(activeLayer.name);
  };

  const handleLayerNameChange = (event: ReactChangeEvent<HTMLInputElement>) => {
    setLayerNameDraft(event.target.value);
  };

  const commitLayerRename = () => {
    if (!editingLayerId) return;
    const trimmed = layerNameDraft.trim();
    cancelLayerRenameRef.current = false;
    updateLayer(editingLayerId, layer => ({
      ...layer,
      name: trimmed.length > 0 ? trimmed : layer.name
    }));
    exitLayerRenameMode();
  };

  const handleLayerNameSubmit = (event: ReactFormEvent<HTMLFormElement>) => {
    event.preventDefault();
    commitLayerRename();
  };

  const handleLayerNameCancel = () => {
    cancelLayerRenameRef.current = true;
    exitLayerRenameMode();
  };

  const handleLayerNameBlur = () => {
    if (cancelLayerRenameRef.current) {
      cancelLayerRenameRef.current = false;
      return;
    }
    commitLayerRename();
  };

  const handleLayerNameKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitLayerRename();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelLayerRenameRef.current = true;
      exitLayerRenameMode();
    }
  };

  const handleRequestLayerImage = () => {
    if (!activeLayerId) return;
    layerImageInputRef.current?.click();
  };

  const handleLayerImageChange = (event: ReactChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !activeLayerId) return;
    const targetLayerId = activeLayerId;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        console.error('Unsupported layer image payload');
        return;
      }
      const base64 = result.includes(',') ? result.split(',')[1] ?? '' : result;
      updateLayer(targetLayerId, layer => ({
        ...layer,
        backgroundImageData: base64,
        backgroundImageMimeType: file.type || layer.backgroundImageMimeType || 'image/png',
        backgroundImageFilename: file.name
      }));
    };
    reader.onerror = () => {
      console.error('Failed to read layer image file', reader.error);
    };
    reader.readAsDataURL(file);
  };

  const handleDelete = () => {
    onDelete?.(app.id);
  };

  const showTransientSuccess = useCallback((message: string) => {
    if (successTimerRef.current) {
      window.clearTimeout(successTimerRef.current);
    }
    setSuccess(message);
    successTimerRef.current = window.setTimeout(() => {
      setSuccess(null);
      successTimerRef.current = null;
    }, 2400);
  }, []);

  const flushPendingSave = useCallback(async (options?: { silent?: boolean }) => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    setIsSaving(true);
    setError(null);
    try {
      await appsApi.update(app.id, { data: latestDataRef.current });
      saveRetryAttemptRef.current = 0;
      if (!options?.silent) {
        showTransientSuccess('Map synced');
      }
    } catch (err: any) {
      console.error('Failed to save map app:', err);
      setError(err.response?.data?.error || 'Failed to save map data');
      const attempt = saveRetryAttemptRef.current;
      const delay = Math.min(5000, 1000 * Math.pow(2, attempt));
      saveRetryAttemptRef.current = attempt + 1;
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = window.setTimeout(() => {
        flushPendingSave({ silent: true });
        saveTimerRef.current = null;
      }, delay);
    } finally {
      setIsSaving(false);
    }
  }, [app.id, showTransientSuccess]);

  useEffect(() => {
    if (isSaving) {
      if (spinnerTimeoutRef.current) {
        window.clearTimeout(spinnerTimeoutRef.current);
        spinnerTimeoutRef.current = null;
      }
      spinnerStartRef.current = getTimestamp();
      setIsSpinnerActive(true);
      return;
    }

    if (!isSpinnerActive || !spinnerStartRef.current) {
      return;
    }

    const elapsed = getTimestamp() - spinnerStartRef.current;
    const remaining = Math.max(MIN_SPINNER_DURATION_MS - elapsed, 0);
    if (remaining === 0) {
      setIsSpinnerActive(false);
      spinnerStartRef.current = null;
      return;
    }

    spinnerTimeoutRef.current = window.setTimeout(() => {
      setIsSpinnerActive(false);
      spinnerTimeoutRef.current = null;
      spinnerStartRef.current = null;
    }, remaining);

    return () => {
      if (spinnerTimeoutRef.current) {
        window.clearTimeout(spinnerTimeoutRef.current);
        spinnerTimeoutRef.current = null;
      }
    };
  }, [isSaving, isSpinnerActive]);

  useEffect(() => {
    if (iconPickerMarkerId) {
      // Delay adding visibility class to allow CSS transition
      const timer = window.setTimeout(() => {
        setPickerVisibleMarkerId(iconPickerMarkerId);
      }, 10);
      return () => window.clearTimeout(timer);
    } else {
      setPickerVisibleMarkerId(null);
    }
  }, [iconPickerMarkerId]);

  useEffect(() => {
    if (!iconPickerMarkerId) return;
    updatePickerPosition();
    const handle = () => updatePickerPosition();
    window.addEventListener('resize', handle);
    // Capture scroll events from any scrollable ancestor.
    window.addEventListener('scroll', handle, true);
    return () => {
      window.removeEventListener('resize', handle);
      window.removeEventListener('scroll', handle, true);
    };
  }, [iconPickerMarkerId, updatePickerPosition]);

  useEffect(() => {
    if (!iconPickerMarkerId) return;
    const handleClickAway = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest('[data-icon-picker-root="true"]')) {
        setIconPickerMarkerId(null);
      }
    };
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIconPickerMarkerId(null);
      }
    };
    document.addEventListener('mousedown', handleClickAway);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickAway);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [iconPickerMarkerId]);

  useEffect(() => {
    if (skipPersistRef.current) {
      skipPersistRef.current = false;
      hasBootstrappedRef.current = true;
      return;
    }
    if (!hasBootstrappedRef.current) {
      hasBootstrappedRef.current = true;
      return;
    }
    if (isIconPickerActiveRef.current) {
      pendingPickerSaveRef.current = true;
      return;
    }
    saveRetryAttemptRef.current = 0;
    saveTimerRef.current = window.setTimeout(() => {
      flushPendingSave({ silent: true });
      saveTimerRef.current = null;
    }, 700);
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [mapData, flushPendingSave]);

  useEffect(() => {
    const isOpen = Boolean(iconPickerMarkerId);
    isIconPickerActiveRef.current = isOpen;
    const wasOpen = previousPickerStateRef.current;

    if (!isOpen && wasOpen && pendingPickerSaveRef.current) {
      pendingPickerSaveRef.current = false;
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      saveRetryAttemptRef.current = 0;
      saveTimerRef.current = window.setTimeout(() => {
        flushPendingSave({ silent: true });
        saveTimerRef.current = null;
      }, 350);
    }

    previousPickerStateRef.current = isOpen;
  }, [iconPickerMarkerId, flushPendingSave]);

  const isMarkerDragEvent = (event: React.DragEvent) => {
    const types = Array.from(event.dataTransfer.types || []);
    return types.includes(MARKER_DRAG_TYPE) || types.includes('text/plain');
  };

  const getDraggedMarkerId = (event: React.DragEvent) => {
    return event.dataTransfer.getData(MARKER_DRAG_TYPE) || event.dataTransfer.getData('text/plain');
  };

  const handleMarkerDragStart = (event: React.DragEvent, markerId: string, origin: DragOrigin) => {
    const marker = markers.find(m => m.id === markerId);
    if (!marker || (origin === 'storage' && marker.isPlaced)) {
      event.preventDefault();
      return;
    }
    if (origin === 'storage') {
      isStorageDragRef.current = true;
      setIconPickerMarkerId(prev => (prev === markerId ? null : prev));
    }
    
    // Create a custom drag image centered on the cursor
    const dragImage = event.currentTarget.cloneNode(true) as HTMLElement;
    dragImage.style.position = 'fixed';
    dragImage.style.margin = '0';
    dragImage.style.top = '-9999px';
    dragImage.style.left = '-9999px';
    dragImage.style.opacity = '0.9';
    dragImage.style.pointerEvents = 'none';
    dragImage.style.transform = 'none';
    document.body.appendChild(dragImage);

    const imageRect = dragImage.getBoundingClientRect();
    const offsetX = imageRect.width / 2;
    const offsetY = imageRect.height / 2;

    event.dataTransfer.setDragImage(dragImage, offsetX, offsetY);
    
    // Clean up the temporary drag image after a short delay
    window.setTimeout(() => {
      if (dragImage.parentNode) {
        dragImage.parentNode.removeChild(dragImage);
      }
    }, 0);
    
    event.dataTransfer.setData(MARKER_DRAG_TYPE, markerId);
    event.dataTransfer.setData('text/plain', markerId);
    event.dataTransfer.setData(MARKER_DRAG_ORIGIN, origin);
    event.dataTransfer.effectAllowed = 'move';
    setDraggingMarkerId(markerId);
  };

  const handleMarkerDragEnd = () => {
    window.setTimeout(() => {
      isStorageDragRef.current = false;
    }, 0);
    setDraggingMarkerId(null);
  };

  const handleMapDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!isMarkerDragEvent(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const handleMapDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (!isMarkerDragEvent(event)) return;
    event.preventDefault();
    const markerId = getDraggedMarkerId(event);
    if (!markerId || !mapStageRef.current || !activeLayerId) return;
    const rect = mapStageRef.current.getBoundingClientRect();
    const x = clamp01((event.clientX - rect.left) / rect.width);
    const y = clamp01((event.clientY - rect.top) / rect.height);
    updateMarker(markerId, marker => ({
      ...marker,
      isPlaced: true,
      placedLayerId: activeLayerId,
      position: { x, y }
    }));
    setDraggingMarkerId(null);
  };

  const handleStorageDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!isMarkerDragEvent(event)) return;
    event.preventDefault();
    setIsStorageDragTarget(true);
  };

  const handleStorageDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget as Node | null;
    if (!nextTarget || !event.currentTarget.contains(nextTarget)) {
      setIsStorageDragTarget(false);
    }
  };

  const handleStorageDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (!isMarkerDragEvent(event)) return;
    event.preventDefault();
    setIsStorageDragTarget(false);
    const markerId = getDraggedMarkerId(event);
    if (!markerId) return;
    handleRecallMarker(markerId);
    setDraggingMarkerId(null);
  };

  const updateMarkerHue = (markerId: string, hue: number) => {
    const normalizedHue = normalizeHue(hue);
    const nextColor = colorFromHue(normalizedHue);
    handleMarkerFieldChange(markerId, 'color', nextColor);
  };

  const getHueFromPointerEvent = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    const rect = target.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = event.clientX - cx;
    const dy = event.clientY - cy;
    const radians = Math.atan2(dy, dx);
    return normalizeHue((radians * 180) / Math.PI + 450);
  };

  const handleHuePointerDown = (event: ReactPointerEvent<HTMLDivElement>, markerId: string) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    updateMarkerHue(markerId, getHueFromPointerEvent(event));
  };

  const handleHuePointerMove = (event: ReactPointerEvent<HTMLDivElement>, markerId: string) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.preventDefault();
    updateMarkerHue(markerId, getHueFromPointerEvent(event));
  };

  const handleHuePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div className="app-interface map-app-interface">
      <div className="app-interface-header">
        <div className="app-interface-title-row">
          <div className="app-title-cluster">
            <button
              type="button"
              className="back-btn"
              onClick={() => onBack?.()}
              title="Back to apps list"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              <span className="sr-only">Back to apps list</span>
            </button>
            <h2>{app.name}</h2>
            <span className="category-badge">{app.category}</span>
          </div>
          <button onClick={handleDelete} className="delete-btn" title="Delete this app" type="button">
            <Trash2 size={16} aria-hidden="true" />
            <span>Delete App</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="app-alert error" role="alert">
          {error}
        </div>
      )}

      {success && (
        <div className="app-alert success" role="status">
          {success}
        </div>
      )}

      <div className="map-access-panel">
        <AccessControlPanel
          characters={characters}
          selectedUsernames={selectedUsers}
          onToggleUser={toggleUser}
          title="Access Control"
        />
      </div>

      <div className="map-main-shell">
        <section className="app-surface map-panel marker-panel">
          <div className="panel-header compact">
            <div>
              <p className="eyebrow">Marker Storage</p>
              <p className="panel-helper">Drag a stored marker into the square grid.</p>
            </div>
          </div>

          <div
            className={`marker-storage-shell${isStorageDragTarget ? ' drag-over' : ''}`}
            onDragOver={handleStorageDragOver}
            onDragLeave={handleStorageDragLeave}
            onDrop={handleStorageDrop}
          >
            <div className="marker-storage-grid" role="list">
              {markers.map(marker => {
                const Glyph = MARKER_GLYPHS[marker.icon];
                const isDeployed = marker.isPlaced;
                return (
                  <div
                    key={marker.id}
                    role="listitem"
                    className={`marker-token${isDeployed ? ' is-deployed' : ''}`}
                  >
                    <button
                      type="button"
                      className="marker-action-btn marker-token-delete danger"
                      onClick={() => handleRemoveMarker(marker.id)}
                      title="Delete marker"
                    >
                      <Trash2 size={14} />
                    </button>
                    {isDeployed && (
                      <button
                        type="button"
                        className="marker-action-btn marker-token-recall"
                        onClick={() => handleRecallMarker(marker.id)}
                        title="Recall marker"
                      >
                        <ArchiveRestore size={14} />
                      </button>
                    )}
                    <input
                      type="text"
                      className="marker-token-label"
                      value={marker.label}
                      onChange={(event) => handleMarkerFieldChange(marker.id, 'label', event.target.value)}
                      placeholder="Marker label"
                    />
                    <div className="marker-token-figure">
                      <div
                        className="marker-token-icon-wrapper"
                        data-icon-picker-root="true"
                        ref={(node) => {
                          if (node) {
                            markerPickerAnchorRef.current.set(marker.id, node);
                          } else {
                            markerPickerAnchorRef.current.delete(marker.id);
                          }
                        }}
                        draggable={!isDeployed}
                        onDragStart={(event) => {
                          if (isDeployed) return;
                          handleMarkerDragStart(event, marker.id, 'storage');
                        }}
                        onDragEnd={handleMarkerDragEnd}
                      >
                        <div
                          role="button"
                          tabIndex={0}
                          className="marker-token-icon"
                          style={{ color: marker.color }}
                          draggable={!isDeployed}
                          onDragStart={(event) => {
                            if (isDeployed) return;
                            handleMarkerDragStart(event, marker.id, 'storage');
                          }}
                          onDragEnd={handleMarkerDragEnd}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (isStorageDragRef.current) {
                              return;
                            }
                            setIconPickerMarkerId(marker.id);
                          }}
                          onKeyDown={(event) => handleIconKeyDown(event, marker.id)}
                          aria-label={`Change icon for ${marker.label}`}
                        >
                          <Glyph size={48} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div
                role="listitem"
                className="marker-token marker-token-ghost"
                onClick={handleAddMarker}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleAddMarker();
                  }
                }}
                tabIndex={0}
                aria-label="Add new marker"
              >
                <div className="marker-token-ghost-content">
                  <Plus size={32} />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="app-surface map-panel map-view-panel">
          <div className="panel-header compact">
            <div>
              <p className="eyebrow">Map View</p>
              <p className="panel-helper">Drop markers anywhere inside the square.</p>
            </div>
            <div className="map-panel-actions">
              <span
                className={`map-refresh-indicator${isSpinnerActive ? ' is-spinning' : ''}`}
                role="status"
                aria-live="polite"
              >
                <RefreshCw size={18} />
                <span className="sr-only">{isSpinnerActive ? 'Syncing map data' : 'Map idle'}</span>
              </span>
            </div>
          </div>

          <div className="map-canvas-shell">
            <div
              ref={mapStageRef}
              className="map-stage-square"
              onDragOverCapture={handleMapDragOver}
              onDropCapture={handleMapDrop}
            >
              <div className="map-layer-controls" role="group" aria-label="Layer controls">
                <button
                  type="button"
                  className="map-layer-btn"
                  onClick={() => handleCycleLayer('prev')}
                  disabled={layers.length <= 1}
                  title="Previous layer"
                >
                  <ChevronLeft size={14} />
                </button>
                <div
                  className="map-layer-chip"
                  title={activeLayer?.name ?? 'No layer'}
                >
                  <div className="map-layer-chip-content">
                    <Layers size={14} aria-hidden="true" />
                    {isEditingActiveLayerName ? (
                      <form className="map-layer-edit-form" onSubmit={handleLayerNameSubmit}>
                        <label htmlFor={layerNameInputId} className="sr-only">
                          Layer name
                        </label>
                        <input
                          id={layerNameInputId}
                          ref={layerNameInputRef}
                          className="map-layer-name-input"
                          value={layerNameDraft}
                          onChange={handleLayerNameChange}
                          onKeyDown={handleLayerNameKeyDown}
                          onBlur={handleLayerNameBlur}
                          maxLength={48}
                          aria-label="Layer name"
                        />
                        <div className="map-layer-edit-actions">
                          <button type="submit" className="map-layer-edit-action" aria-label="Save layer name">
                            <Check size={12} />
                          </button>
                          <button
                            type="button"
                            className="map-layer-edit-action"
                            onClick={handleLayerNameCancel}
                            aria-label="Cancel rename"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <span>{activeLayer?.name ?? 'No Layer'}</span>
                        <button
                          type="button"
                          className="map-layer-rename-btn"
                          onClick={handleBeginLayerRename}
                          disabled={!activeLayer}
                          aria-label="Rename layer"
                          title="Rename layer"
                        >
                          <PenSquare size={12} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  className="map-layer-btn"
                  onClick={() => handleCycleLayer('next')}
                  disabled={layers.length <= 1}
                  title="Next layer"
                >
                  <ChevronRight size={14} />
                </button>
                <button
                  type="button"
                  className="map-layer-btn"
                  onClick={handleRequestLayerImage}
                  disabled={!activeLayerId}
                  title="Upload background image"
                  aria-label="Upload background image"
                >
                  <ImageIcon size={14} />
                </button>
                <button
                  type="button"
                  className="map-layer-btn"
                  onClick={handleAddLayer}
                  title="Add layer"
                >
                  <Plus size={14} />
                </button>
                <button
                  type="button"
                  className="map-layer-btn danger"
                  onClick={handleRemoveLayer}
                  disabled={layers.length <= 1}
                  title="Remove current layer"
                >
                  <Trash2 size={14} />
                </button>
                <input
                  ref={layerImageInputRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  style={{ display: 'none' }}
                  onChange={handleLayerImageChange}
                  tabIndex={-1}
                />
              </div>
              {activeLayerBackgroundSrc && (
                <div className="map-layer-image" aria-hidden="true">
                  <img src={activeLayerBackgroundSrc} alt="" />
                </div>
              )}
              <div className="map-stage-grid" />
              <div className="map-marker-layer" aria-live="polite">
                {deployedMarkers.length === 0 && (
                  <div className="map-stage-empty">
                    <Layers size={20} />
                    <p>Drop a marker to begin.</p>
                  </div>
                )}
                {deployedMarkers.map(marker => {
                  const Glyph = MARKER_GLYPHS[marker.icon];
                  return (
                    <div
                      key={marker.id}
                      role="button"
                      tabIndex={0}
                      className={`map-marker-pin${draggingMarkerId === marker.id ? ' dragging' : ''}`}
                      style={{ left: `${marker.position.x * 100}%`, top: `${marker.position.y * 100}%`, color: marker.color }}
                      draggable
                      onDragStart={(event) => handleMarkerDragStart(event, marker.id, 'map')}
                      onDragEnd={handleMarkerDragEnd}
                      onDoubleClick={() => handleRecallMarker(marker.id)}
                      title="Double-click to recall"
                    >
                      <span className="map-marker-icon" aria-hidden="true">
                        <Glyph size={24} />
                      </span>
                      <span className="map-marker-label" style={{ '--marker-color': marker.color } as React.CSSProperties}>{marker.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      </div>

      {iconPickerMarkerId && activePickerMarker && pickerPosition &&
        createPortal(
          <div
            ref={pickerPortalRef}
            data-icon-picker-root="true"
            className={`marker-icon-picker is-portal${pickerVisibleMarkerId === iconPickerMarkerId ? ' is-visible' : ''}`}
            style={{ left: `${pickerPosition.left}px`, top: `${pickerPosition.top}px` }}
            role="dialog"
            aria-label={`Adjust ${activePickerMarker.label}`}
          >
            <div
              className="marker-color-ring"
              role="slider"
              aria-label="Marker hue"
              aria-valuemin={0}
              aria-valuemax={360}
              aria-valuenow={Math.round(getHueFromColor(activePickerMarker.color))}
              tabIndex={0}
              onPointerDown={(event) => {
                handleHuePointerDown(event, activePickerMarker.id);
              }}
              onPointerMove={(event) => {
                handleHuePointerMove(event, activePickerMarker.id);
              }}
              onPointerUp={(event) => {
                handleHuePointerUp(event);
              }}
              onPointerLeave={(event) => {
                handleHuePointerUp(event);
              }}
            >
              <span
                className="marker-color-indicator"
                style={{
                  backgroundColor: activePickerMarker.color,
                  transform: `translate(-50%, -50%) rotate(${getHueFromColor(activePickerMarker.color)}deg) translate(0, -${COLOR_RING_INDICATOR_OFFSET}px)`
                }}
              />
            </div>
            <div className="marker-icon-ring">
              {iconPickerOptions.map(option => {
                const OptionGlyph = option.Glyph;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`marker-icon-option${activePickerMarker.icon === option.value ? ' is-active' : ''}`}
                    style={{
                      transform: `translate(-50%, -50%) rotate(${option.angle}deg) translate(0, -${ICON_RING_DISTANCE}px) rotate(-${option.angle}deg)`
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleMarkerIconSelect(activePickerMarker.id, option.value);
                    }}
                    aria-label={`Set icon to ${option.label}`}
                  >
                    <OptionGlyph size={36} />
                  </button>
                );
              })}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

export default MapApp;
