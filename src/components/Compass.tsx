import { compassPt } from '../core/geo';
import type { Spot } from '../core/types';
import { series } from '../lib/colors';

/** Compass rose: exposure window (shaded), beach facing, swell and wind arrows (all "from" directions). */
export function Compass({ spot, swellDir, windDir, size = 220 }: { spot: Spot; swellDir?: number; windDir?: number; size?: number }) {
  const c = size / 2, r = c - 22;
  const pt = (deg: number, rad: number) => [c + rad * Math.sin((deg * Math.PI) / 180), c - rad * Math.cos((deg * Math.PI) / 180)];
  const wedge = (b: number, e: number) => {
    const [x1, y1] = pt(b * 10 - 5, r), [x2, y2] = pt(b * 10 + 5, r);
    return `M${c},${c} L${x1},${y1} A${r},${r} 0 0 1 ${x2},${y2} Z`;
  };
  /** Arrow from the rim toward the centre (where it comes from → where it goes). */
  const arrow = (deg: number, color: string, label: string, inner: number) => {
    const [x1, y1] = pt(deg, r + 4), [x2, y2] = pt(deg, inner);
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const h = 9;
    const head = `${x2},${y2} ${x2 - h * Math.cos(ang - 0.45)},${y2 - h * Math.sin(ang - 0.45)} ${x2 - h * Math.cos(ang + 0.45)},${y2 - h * Math.sin(ang + 0.45)}`;
    return (
      <g>
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={3} strokeLinecap="round" />
        <polygon points={head} fill={color} />
        <title>{label}</title>
      </g>
    );
  };
  const [fx, fy] = pt(spot.facing, r * 0.55);
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ maxWidth: size }} role="img" aria-label={`Praia voltada para ${compassPt(spot.facing)}`}>
      <circle cx={c} cy={c} r={r} fill="none" stroke="var(--hair)" />
      {spot.exposure.map((e, b) => (e > 0.05 ? <path key={b} d={wedge(b, b)} fill={series(2)} opacity={0.12 + 0.45 * e} /> : null))}
      {['N', 'L', 'S', 'O'].map((l, i) => {
        const [x, y] = pt(i * 90, r + 13);
        return (
          <text key={l} x={x} y={y + 4} textAnchor="middle" fontSize={12} fill="var(--text-muted)">
            {l}
          </text>
        );
      })}
      <line x1={c} y1={c} x2={fx} y2={fy} stroke="var(--text-secondary)" strokeWidth={2} strokeDasharray="4 3" />
      <circle cx={c} cy={c} r={4} fill="var(--text-secondary)" />
      {swellDir != null && arrow(swellDir, series(0), `Swell de ${compassPt(swellDir)}`, r * 0.25)}
      {windDir != null && arrow(windDir, series(1), `Vento de ${compassPt(windDir)}`, r * 0.45)}
    </svg>
  );
}
