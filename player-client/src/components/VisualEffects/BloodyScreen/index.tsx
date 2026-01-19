import { useEffect, useState } from 'react';
import './style.scss';

interface BloodDrop {
  id: string;
  x: number;
  y: number;
  sizeIdx: number; // 1..6 stable per drop
  rotDeg: number; // slight rotation for irregularity
  skewDeg: number; // slight skew for irregularity
}

function BloodyScreen() {
  const [bloodDrops, setBloodDrops] = useState<BloodDrop[]>([]);

  useEffect(() => {
    // Spawn random blood drops at random intervals
    const spawnDrop = () => {
      // Cap total drops to avoid overload
      setBloodDrops(prev => {
        if (prev.length > 40) return prev;

        const id = Math.random().toString(36).substr(2, 9);
        const x = Math.random() * 100;
        const y = Math.random() * 100;
  const sizeIdx = Math.floor(Math.random() * 6) + 1; // 1..6
        const rotDeg = (Math.random() * 40) - 20; // -20 .. 20 deg
        const skewDeg = (Math.random() * 10) - 5; // -5 .. 5 deg

  // Remove this drop after animation completes (~80 seconds)
        setTimeout(() => {
          setBloodDrops(curr => curr.filter(drop => drop.id !== id));
  }, 80000);

        return [...prev, { id, x, y, sizeIdx, rotDeg, skewDeg }];
      });

      // Slow, constant drip: every 5-15 seconds
      const nextSpawn = Math.random() * 10000 + 5000;
      setTimeout(spawnDrop, nextSpawn);
    };

    spawnDrop();

    return () => {
      // Cleanup
    };
  }, []);

  return (
    <div className="visual-effect bloody-screen">
      {/* Large irregular blood blobs with full opacity coverage */}
      <div className="blood-blob blob-1" />
      <div className="blood-blob blob-2" />
      <div className="blood-blob blob-3" />
      <div className="blood-blob blob-4" />
      <div className="blood-blob blob-5" />

      {/* Small blood dots of varying sizes */}
      <div className="blood-dots">
        <div className="dot dot-1" />
        <div className="dot dot-2" />
        <div className="dot dot-3" />
        <div className="dot dot-4" />
        <div className="dot dot-5" />
        <div className="dot dot-6" />
        <div className="dot dot-7" />
        <div className="dot dot-8" />
        <div className="dot dot-9" />
        <div className="dot dot-10" />
        <div className="dot dot-11" />
        <div className="dot dot-12" />
        <div className="dot dot-13" />
        <div className="dot dot-14" />
        <div className="dot dot-15" />
        <div className="dot dot-16" />
        <div className="dot dot-17" />
        <div className="dot dot-18" />
        <div className="dot dot-19" />
        <div className="dot dot-20" />
      </div>

      {/* Random blood drops that fade in and out */}
      <div className="blood-drops-container">
  {bloodDrops.map((drop) => (
          <div
            key={drop.id}
            className={`random-blood-drop drop-size-${drop.sizeIdx}`}
            style={{
              left: `${drop.x}%`,
              top: `${drop.y}%`,
              // per-drop irregular transform parameters
              // used inside keyframes to keep orientation consistent
              ['--rot' as any]: `${drop.rotDeg}deg`,
              ['--skew' as any]: `${drop.skewDeg}deg`,
            }}
          />
        ))}
      </div>

      {/* Overall blood vignette and tint */}
      <div className="blood-vignette" />
      <div className="blood-tint" />
    </div>
  );
}

export default BloodyScreen;
