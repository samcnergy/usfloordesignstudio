// Architectural dimension strings for SVG drawings in inch units.

import type { Vec } from "@/lib/geometry";
import { fmtIn } from "@/lib/units";

const DIM = "#4A4D50";

export function DimH({ x0, x1, y, fs, label, ext }: { x0: number; x1: number; y: number; fs: number; label?: string; ext?: number }) {
  if (x1 - x0 < 0.01) return null;
  const t = fs * 0.35;
  const text = label ?? fmtIn(x1 - x0);
  const fits = (x1 - x0) > text.length * fs * 0.55;
  return (
    <g>
      {ext !== undefined && (
        <>
          <line x1={x0} x2={x0} y1={ext} y2={y + t} stroke={DIM} strokeWidth={0.18} strokeOpacity={0.6} />
          <line x1={x1} x2={x1} y1={ext} y2={y + t} stroke={DIM} strokeWidth={0.18} strokeOpacity={0.6} />
        </>
      )}
      <line x1={x0} x2={x1} y1={y} y2={y} stroke={DIM} strokeWidth={0.22} />
      <line x1={x0 - t} x2={x0 + t} y1={y + t} y2={y - t} stroke={DIM} strokeWidth={0.3} />
      <line x1={x1 - t} x2={x1 + t} y1={y + t} y2={y - t} stroke={DIM} strokeWidth={0.3} />
      <text
        x={(x0 + x1) / 2}
        y={fits ? y - fs * 0.35 : y - fs * 0.35}
        fontSize={fits ? fs : fs * 0.8}
        textAnchor="middle"
        fill={DIM}
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {text}
      </text>
    </g>
  );
}

export function DimV({ y0, y1, x, fs, label }: { y0: number; y1: number; x: number; fs: number; label?: string }) {
  if (Math.abs(y1 - y0) < 0.01) return null;
  const t = fs * 0.35;
  const top = Math.min(y0, y1);
  const bottom = Math.max(y0, y1);
  const text = label ?? fmtIn(bottom - top);
  const cy = (top + bottom) / 2;
  const fits = bottom - top > text.length * fs * 0.55;
  return (
    <g>
      <line x1={x} x2={x} y1={top} y2={bottom} stroke={DIM} strokeWidth={0.22} />
      <line x1={x - t} x2={x + t} y1={top + t} y2={top - t} stroke={DIM} strokeWidth={0.3} />
      <line x1={x - t} x2={x + t} y1={bottom + t} y2={bottom - t} stroke={DIM} strokeWidth={0.3} />
      <text
        x={x - fs * 0.35}
        y={cy}
        fontSize={fits ? fs : fs * 0.75}
        textAnchor="middle"
        fill={DIM}
        transform={`rotate(-90 ${x - fs * 0.35} ${cy})`}
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {text}
      </text>
    </g>
  );
}

/** Dimension string parallel to a line from p0 to p1, pushed out along the unit normal o by d. */
export function DimAligned({ p0, p1, o, d, fs, label }: { p0: Vec; p1: Vec; o: Vec; d: number; fs: number; label?: string }) {
  const len = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  if (len < 0.01) return null;
  const ux = (p1.x - p0.x) / len;
  const uy = (p1.y - p0.y) / len;
  const a = { x: p0.x + o.x * d, y: p0.y + o.y * d };
  const b = { x: p1.x + o.x * d, y: p1.y + o.y * d };
  const t = fs * 0.35;
  // ticks are the usual 45 degree slashes, turned with the line
  const tx = (ux + o.x) * t * 0.7071;
  const ty = (uy + o.y) * t * 0.7071;
  const text = label ?? fmtIn(len);
  const fits = len > text.length * fs * 0.55;
  let angle = (Math.atan2(uy, ux) * 180) / Math.PI;
  // keep text readable from the bottom or the right; walls within a hair of vertical all read bottom to top
  if (angle > 89.9) angle -= 180;
  else if (angle < -90.1) angle += 180;
  const c = { x: (a.x + b.x) / 2 + o.x * fs * 0.75, y: (a.y + b.y) / 2 + o.y * fs * 0.75 };
  return (
    <g>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={DIM} strokeWidth={0.22} />
      <line x1={a.x - tx} y1={a.y - ty} x2={a.x + tx} y2={a.y + ty} stroke={DIM} strokeWidth={0.3} />
      <line x1={b.x - tx} y1={b.y - ty} x2={b.x + tx} y2={b.y + ty} stroke={DIM} strokeWidth={0.3} />
      <text
        x={c.x}
        y={c.y}
        fontSize={fits ? fs : fs * 0.8}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={DIM}
        transform={`rotate(${angle} ${c.x} ${c.y})`}
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {text}
      </text>
    </g>
  );
}

/**
 * A dimension string of several stops along a line (K&B drawing standards: one continuous run of
 * dimensions). The stops are distances along `u` from `origin`; the string sits `d` out along `o`.
 * Witness lines run from `from` (how far out they start) to just past the string. With `centers`,
 * the stops that are centerlines get a long-dash short-dash witness line from `centers[i]` and a
 * centerline symbol above it, except at the start and end of the string.
 */
export function DimChain({ origin, u, o, d, stops, fs, from = 0, centers }: {
  origin: Vec; u: Vec; o: Vec; d: number; stops: number[]; fs: number; from?: number;
  centers?: Map<number, Vec>;
}) {
  const at = (s: number, k: number) => ({ x: origin.x + u.x * s + o.x * k, y: origin.y + u.y * s + o.y * k });
  const sorted = [...new Set(stops.map((s) => Math.round(s * 1000) / 1000))].sort((a, b) => a - b);
  if (sorted.length < 2) return null;
  const gap = fs * 0.12; // a small gap between the object and the witness line
  return (
    <g>
      {sorted.map((s, i) => {
        const c = centers?.get(s);
        const end = at(s, d + fs * 0.45);
        if (c) {
          const sym = at(s, d + fs * 1.05);
          const inner = i > 0 && i < sorted.length - 1;
          return (
            <g key={`w${i}`}>
              <line x1={c.x} y1={c.y} x2={end.x} y2={end.y} stroke={DIM} strokeWidth={0.18} strokeDasharray={`${fs * 1.2} ${fs * 0.25} ${fs * 0.25} ${fs * 0.25}`} />
              {inner && (
                <text x={sym.x} y={sym.y} fontSize={fs * 0.95} textAnchor="middle" dominantBaseline="middle" fill={DIM}>{"℄"}</text>
              )}
            </g>
          );
        }
        const start = at(s, from + gap);
        return <line key={`w${i}`} x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke={DIM} strokeWidth={0.18} strokeOpacity={0.7} />;
      })}
      {sorted.slice(1).map((s, i) => (
        <DimAligned key={`d${i}`} p0={at(sorted[i], 0)} p1={at(s, 0)} o={o} d={d} fs={fs} />
      ))}
    </g>
  );
}
