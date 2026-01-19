import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MapAppData,
  MapLayer,
  MapMarker,
  MapMarkerIcon
} from '../../types';
import ImageApp from '../ImageApp';
import Teletype from '../Teletype';
import {
  CircleUser,
  Bot,
  Drone,
  FlagTriangleRight,
  Skull,
  Rocket,
  Star,
  Triangle,
  Circle,
  Diamond,
  Cross,
  Box,
  MapPin
} from 'lucide-react';
import './style.scss';

const ICON_COMPONENTS: Record<MapMarkerIcon, React.ElementType> = {
  'circle-user': CircleUser,
  bot: Bot,
  drone: Drone,
  'flag-triangle-right': FlagTriangleRight,
  skull: Skull,
  rocket: Rocket,
  star: Star,
  triangle: Triangle,
  circle: Circle,
  diamond: Diamond,
  cross: Cross,
  box: Box,
  'map-pin': MapPin
};

interface PlayerMapAppProps {
  data: MapAppData;
}

const buildFallbackLayer = (data: MapAppData): MapLayer | null => {
  if (!data?.mapImageData) {
    return null;
  }

  return {
    id: 'base-map-layer',
    name: data.mapImageFilename || 'Primary Layer',
    backgroundImageData: data.mapImageData,
    backgroundImageMimeType: data.mapImageMimeType || 'image/png'
  };
};

const PlayerMapApp: React.FC<PlayerMapAppProps> = ({ data }) => {
  const normalizedLayers = useMemo<MapLayer[]>(() => {
    if (Array.isArray(data?.layers) && data.layers.length > 0) {
      return data.layers.filter(layer => Boolean(layer?.id));
    }
    const fallback = buildFallbackLayer(data);
    return fallback ? [fallback] : [];
  }, [data]);

  const preferredLayerId = useMemo(() => {
    if (!normalizedLayers.length) {
      return null;
    }
    // Player client maintains independent layer selection - ignore GM's activeLayerId
    return normalizedLayers[0].id;
  }, [normalizedLayers]);

  const [activeLayerId, setActiveLayerId] = useState<string | null>(preferredLayerId);
  const [hasManualLayerSelection, setHasManualLayerSelection] = useState(false);
  const [animationToken, setAnimationToken] = useState(0);
  const [isLayerResolved, setIsLayerResolved] = useState(false);
  const previousLayerRef = useRef<string | null>(null);
  const lastRenderedImagePayloadRef = useRef<string | null>(null);
  const lastRenderedMimeRef = useRef<string | null>(null);

  useEffect(() => {
    if (!hasManualLayerSelection && preferredLayerId !== activeLayerId) {
      setActiveLayerId(preferredLayerId);
    }
  }, [preferredLayerId, hasManualLayerSelection, activeLayerId]);

  useEffect(() => {
    if (!normalizedLayers.length) {
      setHasManualLayerSelection(false);
      if (activeLayerId !== null) {
        setActiveLayerId(null);
      }
      return;
    }

    if (activeLayerId && !normalizedLayers.some(layer => layer.id === activeLayerId)) {
      setHasManualLayerSelection(false);
      setActiveLayerId(preferredLayerId);
    }
  }, [normalizedLayers, activeLayerId, preferredLayerId]);

  const activeLayer = useMemo<MapLayer | null>(() => {
    if (!normalizedLayers.length) {
      return null;
    }
    return normalizedLayers.find(layer => layer.id === activeLayerId) ?? normalizedLayers[0];
  }, [normalizedLayers, activeLayerId]);

  const activeImageData = activeLayer?.backgroundImageData || data?.mapImageData || '';
  const activeMimeType = activeLayer?.backgroundImageMimeType || data?.mapImageMimeType || 'image/png';

  const activeLayerIndex = useMemo(() => {
    if (!activeLayer?.id) {
      return -1;
    }
    return normalizedLayers.findIndex(layer => layer.id === activeLayer.id);
  }, [normalizedLayers, activeLayer]);

  const markers = useMemo(() => {
    const allMarkers: MapMarker[] = data?.markers ?? [];
    if (!activeLayer?.id) {
      return [];
    }
    return allMarkers.filter(marker => marker.isPlaced && marker.placedLayerId === activeLayer.id);
  }, [data?.markers, activeLayer]);

  const handleLayerComplete = useCallback(() => {
    setIsLayerResolved(true);
  }, []);

  useEffect(() => {
    const payloadKey = `${activeLayer?.id || 'base'}:${activeImageData}:${activeMimeType}`;
    const hasChanged =
      previousLayerRef.current !== activeLayerId ||
      lastRenderedImagePayloadRef.current !== payloadKey ||
      lastRenderedMimeRef.current !== activeMimeType;
    if (hasChanged) {
      previousLayerRef.current = activeLayerId;
      setAnimationToken(token => token + 1);
      lastRenderedImagePayloadRef.current = payloadKey;
      lastRenderedMimeRef.current = activeMimeType;
      setIsLayerResolved(false);
    }
  }, [activeLayerId, activeLayer, activeImageData, activeMimeType]);

  const cycleLayer = useCallback((direction: 1 | -1) => {
    if (!normalizedLayers.length) {
      return;
    }
    setHasManualLayerSelection(true);
    setActiveLayerId(current => {
      const currentIndex = current
        ? normalizedLayers.findIndex(layer => layer.id === current)
        : 0;
      const safeIndex = currentIndex >= 0 ? currentIndex : 0;
      const nextIndex = (safeIndex + direction + normalizedLayers.length) % normalizedLayers.length;
      return normalizedLayers[nextIndex].id;
    });
  }, [normalizedLayers]);

  const layerCount = normalizedLayers.length;
  const activeLayerLabel = activeLayer?.name || 'Layer';

  return (
    <div className="player-map-app">
      {layerCount > 0 ? (
        <>
          <div className="map-layer-controls">
            <button
              className="layer-button"
              onClick={() => cycleLayer(-1)}
              disabled={layerCount <= 1}
            >
              <Teletype text="< Prev Layer" speed={45} autoScroll={false} />
            </button>
            <div className="layer-status">
              <Teletype text={activeLayerLabel} speed={45} autoScroll={false} />
              {layerCount > 1 && (
                <span className="layer-index">
                  {activeLayerIndex + 1}/{layerCount}
                </span>
              )}
            </div>
            <button
              className="layer-button"
              onClick={() => cycleLayer(1)}
              disabled={layerCount <= 1}
            >
              <Teletype text="Next Layer >" speed={45} autoScroll={false} />
            </button>
          </div>

          <div className="map-stage">
            {activeImageData ? (
              <div className="map-canvas">
                <ImageApp
                  key={`${activeLayer?.id || 'base'}-${animationToken}`}
                  imageData={activeImageData}
                  mimeType={activeMimeType}
                  onComplete={handleLayerComplete}
                  className="luminosity"
                />
                {isLayerResolved && (
                  <div className="marker-overlay">
                    {markers.map(marker => {
                      const Glyph = ICON_COMPONENTS[marker.icon] || MapPin;
                      const style = {
                        left: `${(marker.position?.x ?? 0) * 100}%`,
                        top: `${(marker.position?.y ?? 0) * 100}%`
                      };
                      return (
                        <div className="map-marker" style={style} key={`${marker.id}-${animationToken}`}>
                          <span
                            className="map-marker__icon"
                            style={{ borderColor: marker.color || '#00ffaa', color: marker.color || '#00ffaa' }}
                          >
                            <Glyph size={28} />
                          </span>
                          <span className="map-marker__label" style={{ backgroundColor: marker.color || '#00ffaa' }}>
                            {marker.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="map-missing">
                No imagery available for this layer.
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="map-missing">
          No map data available.
        </div>
      )}
    </div>
  );
};

export default PlayerMapApp;
