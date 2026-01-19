import { v4 as uuidv4 } from 'uuid';
import { MapAppData, MapLayer, MapMarker } from '../types';

const LAYER_NAME_PREFIX = 'Layer';
const DEFAULT_LAYER_NAME = `${LAYER_NAME_PREFIX} 1`;
const DEFAULT_MARKER_LABEL = 'Marker';
const DEFAULT_COLOR = '#78d7ff';

const clamp01 = (value: number): number => {
  if (Number.isNaN(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
};

const sanitizeMarker = (marker?: Partial<MapMarker>, index = 0): MapMarker => ({
  id: marker?.id || uuidv4(),
  label: typeof marker?.label === 'string'
    ? marker.label.slice(0, 48)
    : `${DEFAULT_MARKER_LABEL} ${index + 1}`,
  description: marker?.description || '',
  icon: (marker?.icon as MapMarker['icon']) || 'map-pin',
  color: marker?.color || DEFAULT_COLOR,
  position: {
    x: clamp01(marker?.position?.x ?? 0.5),
    y: clamp01(marker?.position?.y ?? 0.5)
  },
  locked: Boolean(marker?.locked),
  isPlaced: Boolean(marker?.isPlaced),
  placedLayerId: typeof marker?.placedLayerId === 'string' ? marker.placedLayerId : undefined
});

const sanitizeLayer = (layer?: Partial<MapLayer>, fallbackName: string = DEFAULT_LAYER_NAME): MapLayer => {
  const name = layer?.name?.trim() || fallbackName;
  const markerSource = Array.isArray(layer?.markers) ? layer?.markers : [];
  return {
    id: layer?.id || uuidv4(),
    name,
    markers: markerSource.map((marker, markerIndex) => sanitizeMarker(marker, markerIndex)),
    backgroundImageData: typeof layer?.backgroundImageData === 'string' ? layer.backgroundImageData : undefined,
    backgroundImageMimeType: typeof layer?.backgroundImageMimeType === 'string' ? layer.backgroundImageMimeType : undefined,
    backgroundImageFilename: typeof layer?.backgroundImageFilename === 'string' ? layer.backgroundImageFilename : undefined
  };
};

export const normalizeMapAppData = (data?: MapAppData | null): MapAppData | undefined => {
  if (!data) {
    return data ?? undefined;
  }

  const legacyMarkers = Array.isArray(data.markers)
    ? data.markers.map((marker, index) => sanitizeMarker(marker, index))
    : [];

  const rawLayers = Array.isArray(data.layers) && data.layers.length > 0
    ? data.layers
    : [{ id: data.activeLayerId, name: DEFAULT_LAYER_NAME }];

  const layersWithMarkers = rawLayers.map((layer, index) => sanitizeLayer(layer, `${LAYER_NAME_PREFIX} ${index + 1}`));

  const markerMap = new Map<string, MapMarker>();
  legacyMarkers.forEach(marker => {
    markerMap.set(marker.id, marker);
  });

  layersWithMarkers.forEach(layer => {
    if (!Array.isArray(layer.markers)) return;
    layer.markers.forEach(marker => {
      const sanitized = sanitizeMarker(marker);
      const existing = markerMap.get(sanitized.id) || sanitized;
      markerMap.set(sanitized.id, {
        ...existing,
        ...sanitized,
        isPlaced: true,
        placedLayerId: layer.id,
        position: sanitized.position
      });
    });
  });

  const layerIds = new Set(layersWithMarkers.map(layer => layer.id));
  const normalizedMarkers: MapMarker[] = Array.from(markerMap.values()).map(marker => {
    if (marker.isPlaced) {
      if (!marker.placedLayerId || !layerIds.has(marker.placedLayerId)) {
        return { ...marker, isPlaced: false, placedLayerId: undefined };
      }
      return marker;
    }
    return marker.placedLayerId ? { ...marker, placedLayerId: undefined } : marker;
  });

  const layers: MapLayer[] = layersWithMarkers.map(layer => ({
    id: layer.id,
    name: layer.name,
    backgroundImageData: layer.backgroundImageData,
    backgroundImageMimeType: layer.backgroundImageMimeType,
    backgroundImageFilename: layer.backgroundImageFilename
  }));

  const activeLayerId = data.activeLayerId && layerIds.has(data.activeLayerId)
    ? data.activeLayerId
    : layers[0]?.id;

  return {
    mapImageData: data.mapImageData,
    mapImageMimeType: data.mapImageMimeType,
    mapImageFilename: data.mapImageFilename,
    markers: normalizedMarkers,
    masks: Array.isArray(data.masks) ? data.masks : [],
    layers,
    activeLayerId
  };
};
