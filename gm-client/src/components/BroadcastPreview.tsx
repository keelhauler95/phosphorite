import { useCallback, useEffect, useRef, useState } from 'react';
import { BroadcastType } from '../types';
import TeletypePreview from './TeletypePreview';

interface BroadcastPreviewProps {
  type: BroadcastType;
  text: string;
  imageSrc: string;
  duration: number;
}

const EXIT_ANIMATION_MS = 500;
const EXTRA_DELAY_MS = 1000;

const clampDuration = (value: number) => Math.max(0.5, value);

interface StageProps extends BroadcastPreviewProps {
  onCycleComplete: () => void;
}

const BroadcastPreviewStage = ({ type, text, imageSrc, duration, onCycleComplete }: StageProps) => {
  const timerRef = useRef<number | null>(null);
  const extraDelayRef = useRef<number | null>(null);
  const exitTimeoutRef = useRef<number | null>(null);
  const hasText = text.trim().length > 0;
  const hasImage = Boolean(imageSrc);
  const canAnimate = type === BroadcastType.TEXT ? hasText : hasImage;
  const [durationExpired, setDurationExpired] = useState(false);
  const [teletypeComplete, setTeletypeComplete] = useState(type !== BroadcastType.TEXT || !hasText);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (extraDelayRef.current) {
        clearTimeout(extraDelayRef.current);
        extraDelayRef.current = null;
      }
      if (exitTimeoutRef.current) {
        clearTimeout(exitTimeoutRef.current);
        exitTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (extraDelayRef.current) {
      clearTimeout(extraDelayRef.current);
      extraDelayRef.current = null;
    }

    if (exitTimeoutRef.current) {
      clearTimeout(exitTimeoutRef.current);
      exitTimeoutRef.current = null;
    }

    if (!canAnimate) {
      setDurationExpired(false);
      setIsExiting(false);
      setTeletypeComplete(type !== BroadcastType.TEXT || !hasText);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    setDurationExpired(false);
    setIsExiting(false);
    setTeletypeComplete(type !== BroadcastType.TEXT);

    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    timerRef.current = window.setTimeout(() => {
      setDurationExpired(true);
    }, clampDuration(duration) * 1000);
  }, [type, duration, canAnimate, hasText]);

  useEffect(() => {
    if (!canAnimate) return;

    if (type === BroadcastType.IMAGE && durationExpired) {
      setIsExiting(true);
      exitTimeoutRef.current = window.setTimeout(() => {
        onCycleComplete();
      }, EXIT_ANIMATION_MS);
    } else if (type === BroadcastType.TEXT && durationExpired && teletypeComplete) {
      extraDelayRef.current = window.setTimeout(() => {
        setIsExiting(true);
        exitTimeoutRef.current = window.setTimeout(() => {
          onCycleComplete();
        }, EXIT_ANIMATION_MS);
      }, EXTRA_DELAY_MS);
    }
  }, [type, durationExpired, teletypeComplete, canAnimate, onCycleComplete]);

  if (type === BroadcastType.TEXT && !hasText) {
    return <div className="preview-stage text-broadcast blank" />;
  }

  if (type === BroadcastType.IMAGE && !hasImage) {
    return <div className="preview-stage image-broadcast blank" />;
  }

  const stageClass = `preview-stage ${type === BroadcastType.TEXT ? 'text-broadcast' : 'image-broadcast'} ${isExiting ? 'exiting' : ''}`;

  return (
    <div className={stageClass}>
      {type === BroadcastType.TEXT ? (
        <div className="preview-text-frame">
          <TeletypePreview
            text={text}
            onComplete={() => setTeletypeComplete(true)}
          />
        </div>
      ) : (
        <div className="preview-image-frame">
          <img src={imageSrc} alt="Broadcast preview" />
        </div>
      )}
      {canAnimate && (
        <span className="preview-duration-pill">{clampDuration(duration).toFixed(1)}s</span>
      )}
    </div>
  );
};

function BroadcastPreview({ type, text, imageSrc, duration }: BroadcastPreviewProps) {
  const [stageKey, setStageKey] = useState(0);
  const isInitialMount = useRef(true);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    setStageKey((prev) => prev + 1);
  }, [type, imageSrc, duration, text]);

  const handleCycleComplete = useCallback(() => {
    setStageKey((prev) => prev + 1);
  }, []);

  const wrapperClasses = ['broadcast-preview-screen'];
  if ((type === BroadcastType.TEXT && !text.trim().length) || (type === BroadcastType.IMAGE && !imageSrc)) {
    wrapperClasses.push('is-empty');
  }

  return (
    <div className={wrapperClasses.join(' ')}>
      <BroadcastPreviewStage
        key={stageKey}
        type={type}
        text={text}
        imageSrc={imageSrc}
        duration={duration}
        onCycleComplete={handleCycleComplete}
      />
    </div>
  );
}

export default BroadcastPreview;
