import { useMemo } from 'react';
import './style.scss';

type Region = {
  id: string;
  x: number; // percent
  y: number; // percent
  w: number; // percent
  h: number; // percent
  effect?: 'black' | 'static' | 'scan' | 'ghost';
};

function BrokenScreen() {
  // Precompute random regions for dead areas and flicker zones
  const deadZones = useMemo<Region[]>(() => {
    return new Array(6).fill(0).map((_, i) => ({
      id: `dead-${i}`,
      x: Math.random() * 70 + 5, // keep within viewport
      y: Math.random() * 70 + 5,
      w: Math.random() * 15 + 10,
      h: Math.random() * 15 + 10,
    }));
  }, []);

  const flickerZones = useMemo<Region[]>(() => {
    const effects: Array<Region['effect']> = ['black', 'static', 'scan', 'ghost'];
    return new Array(10).fill(0).map((_, i) => ({
      id: `flicker-${i}`,
      x: Math.random() * 75,
      y: Math.random() * 75,
      w: Math.random() * 18 + 8,
      h: Math.random() * 18 + 8,
      effect: effects[Math.floor(Math.random() * effects.length)]
    }));
  }, []);

  return (
    <div className="visual-effect broken-screen">
      {/* Regions that turn off or flicker */}
      <div className="regions">
        {deadZones.map(r => (
          <div
            key={r.id}
            className="region dead"
            style={{ left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%` }}
          />
        ))}
    {flickerZones.map((r, idx) => (
          <div
            key={r.id}
      className={`region flicker ${r.effect ? `effect-${r.effect}` : ''}`}
            style={{
              left: `${r.x}%`,
              top: `${r.y}%`,
              width: `${r.w}%`,
              height: `${r.h}%`,
              animationDelay: `${(idx % 5) * 0.17}s`,
              animationDuration: `${2 + (idx % 3)}s`,
            }}
          />
        ))}
      </div>

  {/* Subtle glass vignette */}
  <div className="glass-vignette" />

  {/* Shaded halos at impact centers (about ~30px radius visually) */}
  <div className="impact-halo" style={{ left: '32%', top: '28%' }} />
  <div className="impact-halo" style={{ left: '68%', top: '58%' }} />

      {/* Visible cracks using SVG over entire viewport, placed last to sit on top */}
      <svg className="cracks" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <filter id="crackShadow">
            <feDropShadow dx="0" dy="0" stdDeviation="0.5" floodColor="#000" floodOpacity="0.9" />
          </filter>
        </defs>

    {/* Impact point 1 */
    }
        <g className="crack-group" filter="url(#crackShadow)">
          {/* Primary rays to edges (variable thickness) */}
          <path className="crack thick" d="M32,28 L 0,12" />
          <path className="crack mid"   d="M32,28 L 0,42" />
          <path className="crack mid"   d="M32,28 L 8,100" />
          <path className="crack thick" d="M32,28 L 52,0" />
          <path className="crack mid"   d="M32,28 L 74,0" />
          <path className="crack thick" d="M32,28 L 100,18" />
          <path className="crack mid"   d="M32,28 L 100,52" />
          <path className="crack fine"  d="M32,28 L 56,100" />
          <path className="crack fine"  d="M32,28 L 0,86" />
          {/* Slightly jagged branches */}
          <path className="crack hair" d="M32,28 L26,38 L22,48 L18,60" />
          <path className="crack hair" d="M32,28 L38,30 L46,34 L54,40 L62,46" />
          {/* Highlights over primaries */}
          <g className="highlight">
            <path className="crack mid" d="M32,28 L 0,12" />
            <path className="crack fine" d="M32,28 L 52,0" />
            <path className="crack fine" d="M32,28 L 100,18" />
          </g>
          {/* Circumferential crack rings (broken arcs) */}
          <g className="ring">
            {/* outer ring ~5 units radius */}
            <path className="crack fine" d="M27,28 A 5 5 0 0 1 37,28" />
            <path className="crack fine" d="M30.5,23.5 A 5 5 0 0 1 35,24.2" />
            <path className="crack hair" d="M26.7,30 A 5 5 0 0 1 28.5,33" />
            {/* inner ring ~3.5 units radius */}
            <path className="crack hair" d="M28.8,28 A 3.5 3.5 0 0 1 35.2,28" />
            <path className="crack hair" d="M30.2,25.8 A 3.5 3.5 0 0 1 33.8,26.4" />
            <path className="crack hair" d="M29,30.6 A 3.5 3.5 0 0 1 30.8,31.8" />
      {/* extra near-center rings ~2.5 and ~2 units, more segments */}
      <path className="crack hair" d="M29.5,28 A 2.5 2.5 0 0 1 34.5,28" />
      <path className="crack hair" d="M30.8,26.8 A 2.5 2.5 0 0 1 33.2,27.4" />
      <path className="crack hair" d="M29.6,29.2 A 2.5 2.5 0 0 1 31.4,30.3" />
      <path className="crack hair" d="M30.2,28 A 2 2 0 0 1 33.8,28" />
      <path className="crack hair" d="M31,27.2 A 2 2 0 0 1 32.6,27.6" />
      <path className="crack hair" d="M30.6,29 A 2 2 0 0 1 31.8,29.6" />
      {/* a few larger arcs ~7 and ~9 radii */}
      <path className="crack fine" d="M23,28 A 9 9 0 0 1 41,28" />
      <path className="crack fine" d="M26,21 A 7 7 0 0 1 38,22.5" />
          </g>
        </g>

        {/* Impact point 2 */}
        <g className="crack-group" filter="url(#crackShadow)">
          {/* Primary rays to edges */}
          <path className="crack thick" d="M68,58 L 100,6" />
          <path className="crack mid"   d="M68,58 L 100,34" />
          <path className="crack thick" d="M68,58 L 100,96" />
          <path className="crack mid"   d="M68,58 L 74,0" />
          <path className="crack fine"  d="M68,58 L 40,100" />
          <path className="crack mid"   d="M68,58 L 0,60" />
          <path className="crack fine"  d="M68,58 L 0,30" />
          <path className="crack fine"  d="M68,58 L 12,50" />
          {/* Jagged branches */}
          <path className="crack hair" d="M68,58 L62,70 L58,78 L54,86" />
          <path className="crack hair" d="M68,58 L74,48 L80,44 L86,42" />
          <g className="highlight">
            <path className="crack fine" d="M68,58 L 100,6" />
            <path className="crack fine" d="M68,58 L 100,96" />
          </g>
          {/* Circumferential crack rings (broken arcs) */}
          <g className="ring">
            {/* outer ring ~5 units radius */}
            <path className="crack fine" d="M63,58 A 5 5 0 0 1 73,58" />
            <path className="crack fine" d="M66.8,53.2 A 5 5 0 0 1 71.4,54" />
            <path className="crack hair" d="M63.2,60.1 A 5 5 0 0 1 65.5,63.5" />
            {/* inner ring ~3.5 units radius */}
            <path className="crack hair" d="M65,58 A 3.5 3.5 0 0 1 71,58" />
            <path className="crack hair" d="M66.4,56 A 3.5 3.5 0 0 1 69.6,56.6" />
            <path className="crack hair" d="M65.4,60.6 A 3.5 3.5 0 0 1 67.2,61.8" />
            {/* extra near-center rings */}
            <path className="crack hair" d="M66.2,58 A 2.5 2.5 0 0 1 69.8,58" />
            <path className="crack hair" d="M66.9,57.1 A 2.5 2.5 0 0 1 68.9,57.6" />
            <path className="crack hair" d="M66.4,59 A 2.5 2.5 0 0 1 67.8,59.7" />
            <path className="crack hair" d="M66.8,58 A 2 2 0 0 1 69.2,58" />
            <path className="crack hair" d="M67.3,57.4 A 2 2 0 0 1 68.6,57.8" />
            <path className="crack hair" d="M67,59 A 2 2 0 0 1 68,59.6" />
            {/* larger outer arcs */}
            <path className="crack fine" d="M59,58 A 9 9 0 0 1 77,58" />
            <path className="crack fine" d="M62,51.5 A 7 7 0 0 1 74,53" />
          </g>
        </g>

        {/* Webbing across screen to increase shattered feel */}
        <path className="crack hair" d="M0,50 L24,52 L48,56 L72,60 L100,64" />
        <path className="crack hair" d="M10,0 L18,18 L26,26 L34,40 L42,50" />
        <path className="crack hair" d="M58,0 L60,12 L64,22 L68,28 L74,36 L82,44 L100,52" />
        <path className="crack hair jagged" d="M0,76 L20,74 L36,80 L52,86 L70,92 L100,96" />
      </svg>
    </div>
  );
}

export default BrokenScreen;
