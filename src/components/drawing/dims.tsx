// Architectural dimension strings for SVG drawings in inch units.

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
