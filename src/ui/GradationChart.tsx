import { useEffect, useMemo, useRef, useState } from 'react';
import type { Gradation } from '../model/types';
import { normalizeGradation, percentPassing } from '../engine/gradation';
import { chartSieves, sieveLabel } from '../model/sieves';

export interface Curve {
  /** Stable id (survives label changes) used for toggling & React keys. */
  key: string;
  label: string;
  color: string;
  gradation: Gradation;
  dashed?: boolean;
}

interface Props {
  curves: Curve[];
  /** Optional vertical markers (e.g. deck apertures), inches. */
  markers?: { size: number; label: string }[];
  width?: number;
  height?: number;
}

// Log-scaled x-axis over a fixed sieve range (mm), matching the manufacturer
// "Production curves" square-opening scale.
const X_MIN = 0.05;
const X_MAX = 110; // up to 4" (101.6 mm)
const PAD = { top: 16, right: 16, bottom: 40, left: 44 };

function xScale(size: number, w: number): number {
  const l = Math.log(Math.min(X_MAX, Math.max(X_MIN, size)));
  const t = (l - Math.log(X_MIN)) / (Math.log(X_MAX) - Math.log(X_MIN));
  return PAD.left + t * (w - PAD.left - PAD.right);
}

/** Inverse of xScale: pixel x back to a sieve size (mm). */
function invX(px: number, w: number): number {
  const t = (px - PAD.left) / (w - PAD.left - PAD.right);
  return Math.exp(Math.log(X_MIN) + t * (Math.log(X_MAX) - Math.log(X_MIN)));
}

/** e.g. 9.5 -> "9.5", 0.075 -> "0.075" */
const fmtMm = (mm: number) => (mm < 1 ? mm.toFixed(3) : mm.toFixed(1));

/** Cursor position read against the currently-selected line. */
interface Hover {
  x: number;
  size: number;
  pct: number;
  y: number;
}

function yScale(pct: number, h: number): number {
  const t = pct / 100;
  return PAD.top + (1 - t) * (h - PAD.top - PAD.bottom);
}

interface Pt {
  x: number;
  y: number;
}

const r = (n: number) => Math.round(n * 100) / 100;

/**
 * Smooth SVG path using Fritsch–Carlson monotone cubic interpolation: C1-smooth
 * (no kinks at points) and guaranteed not to overshoot past 0/100% or backtrack
 * — the safe base. Elbows into the 100% plateau are softened upstream by gently
 * smoothing a dense resample of the curve (see `rendered`).
 */
function smoothPath(pts: Pt[]): string {
  const n = pts.length;
  if (n === 0) return '';
  if (n === 1) return `M ${r(pts[0].x)} ${r(pts[0].y)}`;
  if (n === 2) return `M ${r(pts[0].x)} ${r(pts[0].y)} L ${r(pts[1].x)} ${r(pts[1].y)}`;

  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const h = pts[i + 1].x - pts[i].x;
    dx.push(h);
    slope.push(h === 0 ? 0 : (pts[i + 1].y - pts[i].y) / h);
  }

  const m: number[] = new Array(n);
  m[0] = slope[0];
  m[n - 1] = slope[n - 2];
  for (let i = 1; i < n - 1; i++) {
    m[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
    } else {
      const a = m[i] / slope[i];
      const b = m[i + 1] / slope[i];
      const s = a * a + b * b;
      if (s > 9) {
        const t = 3 / Math.sqrt(s);
        m[i] = t * a * slope[i];
        m[i + 1] = t * b * slope[i];
      }
    }
  }

  let d = `M ${r(pts[0].x)} ${r(pts[0].y)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i];
    const c1x = pts[i].x + h / 3;
    const c1y = pts[i].y + (m[i] * h) / 3;
    const c2x = pts[i + 1].x - h / 3;
    const c2y = pts[i + 1].y - (m[i + 1] * h) / 3;
    d += ` C ${r(c1x)} ${r(c1y)} ${r(c2x)} ${r(c2y)} ${r(pts[i + 1].x)} ${r(pts[i + 1].y)}`;
  }
  return d;
}

/** Dense, log-spaced, gently-smoothed screen points for a curve — resampling the
 *  gradation and averaging the %-passing rounds off sharp elbows (e.g. into the
 *  100% plateau) so the drawn line flows, without moving the data dots. */
function drawPoints(g: Gradation, width: number, height: number): Pt[] {
  const smin = g[0].size;
  const smax = g[g.length - 1].size;
  if (!(smax > smin)) return g.map((p) => ({ x: xScale(p.size, width), y: yScale(p.percentPassing, height) }));
  const N = 96;
  const ys: number[] = [];
  for (let i = 0; i <= N; i++) ys.push(percentPassing(g, smin * Math.pow(smax / smin, i / N)));
  const R = 4; // moving-average radius
  const out: Pt[] = [];
  for (let i = 0; i <= N; i++) {
    let sum = 0;
    let cnt = 0;
    for (let k = -R; k <= R; k++) {
      const j = i + k;
      if (j >= 0 && j <= N) {
        sum += ys[j];
        cnt++;
      }
    }
    out.push({ x: xScale(smin * Math.pow(smax / smin, i / N), width), y: yScale(sum / cnt, height) });
  }
  return out;
}

/** y of the drawn (dense) polyline at a given x — so a data dot can sit on the line. */
function interpY(pts: Pt[], x: number): number {
  if (x <= pts[0].x) return pts[0].y;
  const last = pts[pts.length - 1];
  if (x >= last.x) return last.y;
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i].x) {
      const a = pts[i - 1];
      const b = pts[i];
      const t = b.x === a.x ? 0 : (x - a.x) / (b.x - a.x);
      return a.y + t * (b.y - a.y);
    }
  }
  return last.y;
}

// X ticks are standard sieve designations (#200, #4, 3/8", ...) in range.
const X_TICKS = chartSieves(X_MIN, X_MAX);
const Y_TICKS = [0, 20, 40, 60, 80, 100];

export function GradationChart({ curves, markers = [], width = 560, height = 320 }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  // A line is picked by clicking on it; then the cursor scrubs along that line.
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selected;

  // Pre-compute each curve's smooth path + points ONCE (the Fritsch–Carlson
  // interpolation is the expensive part) so hovering never recomputes them.
  const rendered = useMemo(
    () =>
      curves
        .map((c) => {
          const pts = normalizeGradation(c.gradation).slice().sort((a, b) => a.size - b.size);
          if (pts.length < 2) return null;
          const dense = drawPoints(pts, width, height);
          // Snap each data dot onto the drawn line (same size x, line's y).
          const dots = pts.map((p) => { const x = xScale(p.size, width); return { x, y: interpY(dense, x) }; });
          return { curve: c, d: smoothPath(dense), dots };
        })
        .filter((x): x is { curve: Curve; d: string; dots: Pt[] } => x !== null),
    [curves, width, height],
  );

  // Throttle hover to one update per animation frame — pointermove fires far
  // faster than the screen refreshes, so coalescing keeps it smooth.
  const raf = useRef<number | undefined>(undefined);
  const pending = useRef<{ clientX: number; clientY: number } | null>(null);
  useEffect(
    () => () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    },
    [],
  );

  // Convert a pointer event to viewBox coordinates.
  const toLocal = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    return pt.matrixTransform(ctm.inverse());
  };

  // Click picks the line closest to the cursor (anywhere along it); clicking
  // away from every line clears the selection.
  const onPlotDown = (e: React.PointerEvent) => {
    const loc = toLocal(e.clientX, e.clientY);
    if (!loc) return;
    const px = Math.min(width - PAD.right, Math.max(PAD.left, loc.x));
    const size = invX(px, width);
    let best: Curve | null = null;
    let bestDist = Infinity;
    for (const { curve } of rendered) {
      const y = yScale(percentPassing(curve.gradation, size), height);
      const dist = Math.abs(y - loc.y);
      if (dist < bestDist) {
        bestDist = dist;
        best = curve;
      }
    }
    if (best && bestDist <= 16) {
      setSelected(best.key);
      setHover({ x: px, size, pct: percentPassing(best.gradation, size), y: yScale(percentPassing(best.gradation, size), height) });
    } else {
      setSelected(null);
      setHover(null);
    }
  };

  // Moving the cursor scrubs along the SELECTED line only.
  const onPlotMove = (e: React.PointerEvent) => {
    if (!selectedRef.current) return;
    pending.current = { clientX: e.clientX, clientY: e.clientY };
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = undefined;
      const p = pending.current;
      const key = selectedRef.current;
      if (!p || !key) return;
      const loc = toLocal(p.clientX, p.clientY);
      if (!loc) return;
      const c = rendered.find((rr) => rr.curve.key === key)?.curve;
      if (!c) return;
      const px = Math.min(width - PAD.right, Math.max(PAD.left, loc.x));
      const size = invX(px, width);
      const pct = percentPassing(c.gradation, size);
      setHover({ x: px, size, pct, y: yScale(pct, height) });
    });
  };
  const clearHover = () => {
    pending.current = null;
    setHover(null);
  };

  const selectedCurve = rendered.find((rr) => rr.curve.key === selected)?.curve ?? null;
  const hasSelection = selectedCurve !== null;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${height}`}
      className="gradation-chart"
      role="img"
      onPointerLeave={clearHover}
    >
      {/* Y gridlines */}
      {Y_TICKS.map((p) => (
        <g key={`y${p}`}>
          <line
            x1={PAD.left}
            x2={width - PAD.right}
            y1={yScale(p, height)}
            y2={yScale(p, height)}
            className="grid"
          />
          <text x={PAD.left - 8} y={yScale(p, height) + 4} className="axis-label" textAnchor="end">
            {p}
          </text>
        </g>
      ))}
      {/* X ticks (standard sieve designations) */}
      {X_TICKS.map((s) => (
        <g key={`x${s.label}`}>
          <line
            x1={xScale(s.mm, width)}
            x2={xScale(s.mm, width)}
            y1={PAD.top}
            y2={height - PAD.bottom}
            className="grid"
          />
          <text
            x={xScale(s.mm, width)}
            y={height - PAD.bottom + 16}
            className="axis-label"
            textAnchor="middle"
          >
            {s.label}
          </text>
        </g>
      ))}
      {/* Aperture markers */}
      {markers.map((m) => (
        <g key={`m${m.label}`}>
          <line
            x1={xScale(m.size, width)}
            x2={xScale(m.size, width)}
            y1={PAD.top}
            y2={height - PAD.bottom}
            className="marker"
          />
          <text
            x={xScale(m.size, width)}
            y={PAD.top + 10}
            className="marker-label"
            textAnchor="middle"
          >
            {m.label}
          </text>
        </g>
      ))}
      {/* Curves — re-render only on selection change (not on scrub). Non-selected
          lines dim so the picked one stands out. */}
      {rendered.map(({ curve: c, d, dots }) => {
        const dim = hasSelection && selected !== c.key;
        const on = selected === c.key;
        return (
          <g key={c.key} opacity={dim ? 0.18 : 1}>
            <path
              d={d}
              fill="none"
              stroke={c.color}
              strokeWidth={on ? 3.5 : 2.5}
              strokeDasharray={c.dashed ? '7 4' : undefined}
            />
            {dots.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={2.5} fill={c.color} />
            ))}
          </g>
        );
      })}

      {/* Transparent capture area over the plot: click to select a line, then
          move to scrub along it. */}
      <rect
        x={PAD.left}
        y={PAD.top}
        width={width - PAD.left - PAD.right}
        height={height - PAD.top - PAD.bottom}
        fill="transparent"
        style={{ cursor: 'pointer' }}
        onPointerDown={onPlotDown}
        onPointerMove={onPlotMove}
      />

      {/* Hint when nothing is picked yet. */}
      {!hasSelection && (
        <text x={width / 2} y={PAD.top + 14} textAnchor="middle" className="chart-hint">
          Click a line to inspect it
        </text>
      )}

      {/* Readout for the selected line only: crosshair, a dot, and a tooltip
          with its name, the sieve size, and the % passing at the cursor. */}
      {hover &&
        selectedCurve &&
        (() => {
          const desig = sieveLabel(hover.size);
          const sizeLine = desig.endsWith('mm')
            ? `${fmtMm(hover.size)} mm`
            : `${desig} · ${fmtMm(hover.size)} mm`;
          const lines = [selectedCurve.label, sizeLine, `${hover.pct.toFixed(1)}% passing`];
          const tw = Math.max(...lines.map((l) => l.length)) * 5.6 + 20;
          const th = lines.length * 13 + 10;
          let tx = hover.x + 14;
          if (tx + tw > width - 2) tx = hover.x - tw - 14;
          if (tx < 2) tx = 2;
          let ty = hover.y - th - 8;
          if (ty < PAD.top) ty = hover.y + 14;
          return (
            <g pointerEvents="none">
              <line x1={hover.x} x2={hover.x} y1={PAD.top} y2={height - PAD.bottom} className="hover-crosshair" />
              <circle cx={hover.x} cy={hover.y} r={5} fill={selectedCurve.color} stroke="#fff" strokeWidth={1.6} />
              <g transform={`translate(${r(tx)},${r(ty)})`}>
                <rect width={tw} height={th} rx={5} className="chart-tip-bg" />
                <rect width={3} height={th} rx={1.5} fill={selectedCurve.color} />
                {lines.map((l, i) => (
                  <text key={i} x={9} y={15 + i * 13} className={i === 0 ? 'chart-tip-title' : 'chart-tip-text'}>
                    {l}
                  </text>
                ))}
              </g>
            </g>
          );
        })()}
      {/* Axis titles */}
      <text x={width / 2} y={height - 4} className="axis-title" textAnchor="middle">
        Sieve size — log scale
      </text>
      <text
        x={12}
        y={height / 2}
        className="axis-title"
        textAnchor="middle"
        transform={`rotate(-90 12 ${height / 2})`}
      >
        % passing
      </text>
    </svg>
  );
}
