"use client";

// Front view of one wall or island: cabinets, appliances, countertop, doors
// and windows, with width and height dimension strings.

import { BASE_TOP, COUNTER_STYLES } from "@/lib/plan";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { Catalog, DesignData, Opening, PlacedItem } from "@/lib/types";
import { liveOpenings } from "@/lib/types";
import { isWall, itemLabel, runFrame } from "@/lib/geometry";
import { atTop, cabinetTop } from "@/lib/place";
import { fmtIn } from "@/lib/units";
import { CabinetFront } from "./CabinetFront";
import { DimH, DimV } from "./dims";
import { PaintDefs, PROBLEM, SELECT, counterPaint, finishPaint, monoPaint } from "./paint";

// "turn" is the grip behind a free standing run in the top view; its id is the run's.
export type DrawTarget = { kind: "item" | "opening" | "island" | "wall" | "turn"; id: string };

export interface ViewProps {
  design: DesignData;
  catalog: Catalog;
  selectedId?: string | null;
  /** Everything selected, when several pieces are; otherwise just selectedId. */
  selectedIds?: Set<string>;
  problemIds?: Set<string>;
  onTargetDown?: (e: ReactPointerEvent<SVGElement>, target: DrawTarget) => void;
  onBackgroundDown?: (e: ReactPointerEvent<SVGSVGElement>) => void;
  className?: string;
  /**
   * The printed drawing set: drawn to scale (real inches per paper inch), black
   * and white, with plotted lettering about 1/8" high (K&B drawing standards).
   */
  print?: { scale: number };
}

export { BASE_TOP, COUNTER_STYLES };

/** Pieces side by side become one span, so a countertop or a crown runs across them all. */
export function mergeSpans(items: PlacedItem[]): [number, number][] {
  const spans = items.map((i) => [i.offset, i.offset + i.width] as [number, number]).sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (last && s[0] <= last[1] + 0.1) last[1] = Math.max(last[1], s[1]);
    else merged.push([...s]);
  }
  return merged;
}

export function counterRuns(items: PlacedItem[]): [number, number][] {
  return mergeSpans(items.filter((i) => COUNTER_STYLES.has(i.style) && i.mountHeight === 0 && Math.abs(i.height - BASE_TOP) < 0.01));
}

export function OpeningFront({ op, Y, mono = false }: { op: Opening; Y: (z: number) => number; mono?: boolean }) {
  const x = op.offset;
  const w = op.width;
  const casing = 2.5;
  if (op.type === "window") {
    const z0 = op.sill;
    const z1 = op.sill + op.height;
    return (
      <g>
        <rect x={x - casing} y={Y(z1 + casing)} width={w + casing * 2} height={op.height + casing * 2} fill="#FFFFFF" stroke="#8A8D90" strokeWidth={0.3} />
        <rect x={x} y={Y(z1)} width={w} height={op.height} fill={mono ? "#FFFFFF" : "#DCE7EC"} stroke="#5E6266" strokeWidth={0.35} />
        {w > 30 && <line x1={x + w / 2} x2={x + w / 2} y1={Y(z1)} y2={Y(z0)} stroke="#5E6266" strokeWidth={0.6} />}
        <line x1={x} x2={x + w} y1={Y(z0 + op.height / 2)} y2={Y(z0 + op.height / 2)} stroke="#5E6266" strokeWidth={0.4} />
      </g>
    );
  }
  if (op.type === "door") {
    const knobX = op.hinge === "left" ? x + w - 3 : x + 3;
    return (
      <g>
        <path
          d={`M ${x - casing} ${Y(0)} L ${x - casing} ${Y(op.height + casing)} L ${x + w + casing} ${Y(op.height + casing)} L ${x + w + casing} ${Y(0)}`}
          fill="#FFFFFF"
          stroke="#8A8D90"
          strokeWidth={0.3}
        />
        <rect x={x} y={Y(op.height)} width={w} height={op.height} fill={mono ? "#FFFFFF" : "#F4F2EC"} stroke="#5E6266" strokeWidth={0.35} />
        <rect x={x + 4} y={Y(op.height - 4)} width={w - 8} height={op.height * 0.42} fill="none" stroke="#9A9DA0" strokeWidth={0.25} />
        <rect x={x + 4} y={Y(op.height * 0.48)} width={w - 8} height={op.height * 0.48 - 4} fill="none" stroke="#9A9DA0" strokeWidth={0.25} />
        <circle cx={knobX} cy={Y(36)} r={1.1} fill="#6A6E72" />
      </g>
    );
  }
  return (
    <g>
      <rect x={x} y={Y(op.height)} width={w} height={op.height} fill="#FFFFFF" stroke="#5E6266" strokeWidth={0.35} strokeDasharray="2 1.2" />
    </g>
  );
}

/**
 * Lays the piece labels out in rows so they never sit on top of each other.
 * A label that would run into the one before it drops to the next row, with a
 * leader line back to its piece.
 */
function labelRows(items: PlacedItem[], size: number): { item: PlacedItem; row: number; x: number }[] {
  const ends: number[] = [];
  return [...items]
    .map((it) => ({ item: it, x: it.offset + it.width / 2 }))
    .sort((a, b) => a.x - b.x)
    .map(({ item, x }) => {
      const half = (itemLabel(item).length * size * 0.56) / 2;
      let row = 0;
      while (ends[row] !== undefined && x - half < ends[row] + size * 0.5) row++;
      ends[row] = x + half;
      return { item, row, x };
    });
}

function Faucet({ cx, Y }: { cx: number; Y: (z: number) => number }) {
  return (
    <path
      d={`M ${cx} ${Y(36)} L ${cx} ${Y(48)} Q ${cx} ${Y(52)} ${cx + 4} ${Y(52)} Q ${cx + 7} ${Y(52)} ${cx + 7} ${Y(48)} L ${cx + 7} ${Y(46.5)}`}
      fill="none"
      stroke="#6A6E72"
      strokeWidth={0.9}
      strokeLinecap="round"
    />
  );
}

/**
 * The front view's frame: its length and height, the lettering size, the label
 * rows and the margins they need. The view draws from it, and the drawing set
 * uses it to know a front view's printed size before laying out a sheet.
 */
export function elevationLayout(design: DesignData, run: string, fsOverride?: number) {
  const frame = runFrame(design, run);
  if (!frame) return null;
  const L = frame.length;
  const island = frame.kind === "island";
  const islandTop = design.items.filter((i) => i.run === run).reduce((m, i) => Math.max(m, i.mountHeight + i.height), 0);
  // islands are drawn without a wall behind them, so the view only needs to clear the tallest piece
  const H = island ? Math.max(48, Math.ceil(islandTop + 8)) : design.room.ceiling;
  const fs = fsOverride ?? Math.max(2.4, Math.min(4.2, Math.max(L, H) / 52));
  const items = design.items.filter((i) => i.run === run);
  const lower = items.filter((i) => i.mountHeight === 0).sort((a, b) => a.offset - b.offset);
  const upper = items.filter((i) => i.mountHeight > 0).sort((a, b) => a.offset - b.offset);
  // labels first: the rows they need decide how much room the margins have to leave
  const labelSize = fs * 0.8;
  const lowerLabels = labelRows(lower, labelSize);
  const upperLabels = labelRows(upper, labelSize);
  const labelStep = labelSize * 1.35;
  const lowerExtra = Math.max(0, ...lowerLabels.map((l) => l.row)) * labelStep;
  const upperExtra = Math.max(0, ...upperLabels.map((l) => l.row)) * labelStep;
  const ML = fs * 6.5;
  const MR = fs * 2;
  const MT = fs * 5 + upperExtra;
  // the printed set puts the title under the drawing, outside it, so no room is kept for one
  const MB = fs * (fsOverride ? 8 : 9) + lowerExtra;
  return { frame, L, island, H, fs, items, lower, upper, labelSize, lowerLabels, upperLabels, labelStep, lowerExtra, upperExtra, ML, MR, MT, MB };
}

/** A front view's printed size, in paper inches, at this scale. */
export function elevationPaperSize(design: DesignData, run: string, scale: number, fs: number, withRefs = false): { width: number; height: number } | null {
  const g = elevationLayout(design, run, fs);
  if (!g) return null;
  return { width: (g.L + g.ML + g.MR) / scale, height: (g.H + g.MT + g.MB + (withRefs ? refRow(scale) : 0)) / scale };
}

/** Room under a printed front view for its section and detail markers: a 5/8" bubble and a little air. */
const refRow = (scale: number) => scale * 0.3125 * 3;

/** A section cut or detail marker on a front view (K&B drawing standards, Chapter 4): drawing number over the sheet it is on. */
export type ElevationRefs = {
  /** The section cut: where along the run, its number and sheet; the arrow points the way the section looks (to the right). */
  section?: { s: number; n: number; sheet: string };
  /** A detail: the area it enlarges, its number and sheet. */
  detail?: { x0: number; x1: number; z0: number; z1: number; n: number; sheet: string };
};

function RefBubble({ c, r, n, sheet }: { c: { x: number; y: number }; r: number; n: number; sheet: string }) {
  return (
    <g>
      <circle cx={c.x} cy={c.y} r={r} fill="#FFFFFF" stroke="#000000" strokeWidth={r * 0.06} />
      <line x1={c.x - r} x2={c.x + r} y1={c.y} y2={c.y} stroke="#000000" strokeWidth={r * 0.05} />
      <text x={c.x} y={c.y - r * 0.22} fontSize={r * 0.85} textAnchor="middle" fontWeight={700}>{n}</text>
      <text x={c.x} y={c.y + r * 0.62} fontSize={r * 0.42} textAnchor="middle">{sheet}</text>
    </g>
  );
}

export function ElevationView({ design, catalog, run, selectedId, selectedIds, problemIds, onTargetDown, onBackgroundDown, className, print, refs }: ViewProps & { run: string; refs?: ElevationRefs }) {
  const g = elevationLayout(design, run, print ? print.scale * 0.13 : undefined);
  if (!g) return null;
  const { frame, L, island, H, fs, items, lower, upper, labelSize, lowerLabels, upperLabels, labelStep, lowerExtra, upperExtra, ML, MR, MT } = g;
  const withRefs = !!print && !!(refs?.section || refs?.detail);
  const MB = g.MB + (withRefs ? refRow(print!.scale) : 0);
  // the marker row sits under the dimensions; bubbles are 5/8" across on paper
  const rr = print ? print.scale * 0.3125 : 0;
  const rowY = g.H + g.MB + rr * 1.3;
  const open = !!frame.open;
  const mono = !!print;
  const Y = (z: number) => H - z;

  const openings = isWall(design.room, run) ? liveOpenings(design).filter((o) => o.wall === run) : [];
  const counter = mono ? monoPaint(counterPaint(catalog, design)) : counterPaint(catalog, design);
  const counterThick = catalog.countertops.find((c) => c.id === design.countertopId)?.thickness ?? 1.5;
  const runs = counterRuns(items);
  // crown molding, drawn as a band on top of the wall cabinets that run to the top
  const crown = Math.max(0, design.crown ?? 0);
  const crownTop = cabinetTop(design);
  const crowned = items.filter((i) => atTop(design, i, crownTop));
  const crownRuns = crown > 0 ? mergeSpans(crowned) : [];
  const crownPaint = crowned.length ? (mono ? monoPaint(finishPaint(catalog, design, crowned[0])) : finishPaint(catalog, design, crowned[0])) : null;

  // height marks for the left dimension string
  const marks = new Set<number>(island ? [0] : [0, H]);
  if (runs.length) marks.add(BASE_TOP + counterThick);
  if (crownRuns.length) marks.add(crownTop);
  for (const it of items) {
    if (it.mountHeight > 0) {
      marks.add(it.mountHeight);
      marks.add(it.mountHeight + it.height);
    } else if (it.category === "tall" || it.style === "refrigerator") marks.add(it.height);
  }
  for (const so of design.soffits ?? []) if (so.wall === run) marks.add(so.bottom);
  for (const op of openings) {
    if (op.type === "window") {
      marks.add(op.sill);
      marks.add(op.sill + op.height);
    }
  }
  const sortedMarks = [...marks].filter((m) => m >= 0 && m <= H).sort((a, b) => a - b);

  const down = (target: DrawTarget) => (e: ReactPointerEvent<SVGElement>) => {
    if (!onTargetDown) return;
    e.stopPropagation();
    onTargetDown(e, target);
  };

  const drawItem = (it: PlacedItem) => {
    const paint = mono ? monoPaint(finishPaint(catalog, design, it)) : finishPaint(catalog, design, it);
    const selected = selectedIds ? selectedIds.has(it.id) : selectedId === it.id;
    const problem = problemIds?.has(it.id);
    return (
      <g key={it.id} onPointerDown={down({ kind: "item", id: it.id })} style={{ cursor: onTargetDown ? "grab" : undefined }}>
        <CabinetFront item={it} paint={paint} Y={Y} />
        {(selected || problem) && (
          <rect
            x={it.offset - 0.4}
            y={Y(it.mountHeight + it.height) - 0.4}
            width={it.width + 0.8}
            height={it.height + 0.8}
            fill="none"
            stroke={problem ? PROBLEM : SELECT}
            strokeWidth={selected ? 0.9 : 0.6}
            strokeDasharray={problem && !selected ? "1.5 1" : undefined}
          />
        )}
      </g>
    );
  };

  return (
    <svg
      className={className}
      viewBox={`${-ML} ${-MT} ${L + ML + MR} ${H + MT + MB}`}
      xmlns="http://www.w3.org/2000/svg"
      fontFamily="'Source Sans 3', Helvetica, Arial, sans-serif"
      onPointerDown={(e) => onBackgroundDown?.(e)}
      style={print
        ? { width: `${(L + ML + MR) / print.scale}in`, height: `${(H + MT + MB) / print.scale}in`, display: "block" }
        : { touchAction: "none", userSelect: "none" }}
    >
      <PaintDefs catalog={catalog} />
      {!island && <rect x={0} y={0} width={L} height={H} fill={open ? "none" : mono ? "#FFFFFF" : "#FBFAF7"} stroke="#B9BBBD" strokeWidth={0.3} strokeDasharray={open ? "2 1.5" : undefined} />}

      {openings.map((op) => (
        <g key={op.id} onPointerDown={down({ kind: "opening", id: op.id })} style={{ cursor: onTargetDown ? "grab" : undefined }}>
          <OpeningFront op={op} Y={Y} mono={mono} />
          {((selectedIds ? selectedIds.has(op.id) : selectedId === op.id) || problemIds?.has(op.id)) && (
            <rect
              x={op.offset - 0.5}
              y={Y(op.type === "window" ? op.sill + op.height : op.height) - 0.5}
              width={op.width + 1}
              height={op.height + 1}
              fill="none"
              stroke={(selectedIds ? selectedIds.has(op.id) : selectedId === op.id) ? SELECT : PROBLEM}
              strokeWidth={0.9}
            />
          )}
        </g>
      ))}

      {lower.map(drawItem)}

      {runs.map(([s0, s1], i) => (
        <rect key={i} x={s0} y={Y(BASE_TOP + counterThick)} width={s1 - s0} height={counterThick} fill={counter.fill} stroke="#3C3F42" strokeWidth={0.3} />
      ))}
      {lower
        .filter((i) => i.style === "sink_base")
        .map((i) => (
          <Faucet key={`f-${i.id}`} cx={i.offset + i.width / 2 - 3.5} Y={Y} />
        ))}

      {upper.map(drawItem)}

      {crownPaint &&
        crownRuns.map(([s0, s1], i) => (
          <g key={`crown-${i}`}>
            <rect x={s0} y={Y(crownTop + crown)} width={s1 - s0} height={crown} fill={crownPaint.fill} stroke="#3C3F42" strokeWidth={0.3} />
            <line x1={s0} x2={s1} y1={Y(crownTop + crown * 0.55)} y2={Y(crownTop + crown * 0.55)} stroke={crownPaint.ink} strokeOpacity={0.5} strokeWidth={0.25} />
          </g>
        ))}

      {/* soffits on this wall: from the ceiling down to their bottom, across their run */}
      {(design.soffits ?? []).filter((so) => so.wall === run).map((so) => (
        <g key={`so-${so.id}`}>
          <defs>
            <pattern id={`so-${so.id}-h`} patternUnits="userSpaceOnUse" width={3} height={3} patternTransform="rotate(45)">
              <line x1={0} y1={0} x2={0} y2={3} stroke="#9A9DA0" strokeWidth={0.25} />
            </pattern>
          </defs>
          <rect x={so.s0} y={Y(H)} width={so.s1 - so.s0} height={Math.max(0, H - so.bottom)} fill={`url(#so-${so.id}-h)`} stroke="#1A1D1F" strokeWidth={0.4} />
          <text x={(so.s0 + so.s1) / 2} y={Y((H + so.bottom) / 2) + fs * 0.3} fontSize={fs * 0.75} textAnchor="middle" fill="#1A1D1F" stroke="#FFFFFF" strokeWidth={fs * 0.2} paintOrder="stroke">SOFFIT</text>
        </g>
      ))}

      {/* floor and ceiling lines */}
      <line x1={-2} x2={L + 2} y1={Y(0)} y2={Y(0)} stroke="#1A1D1F" strokeWidth={0.9} />

      {/* labels: floor pieces under the floor line, wall-hung pieces above the wall */}
      {lowerLabels.map(({ item, row, x }) => (
        <g key={`l-${item.id}`}>
          {row > 0 && <line x1={x} y1={H + fs * 0.6} x2={x} y2={H + fs * 1.2 + row * labelStep} stroke="#9A9DA0" strokeWidth={0.2} />}
          <text x={x} y={H + fs * 1.5 + row * labelStep} fontSize={labelSize} textAnchor="middle" fill="#1A1D1F" fontWeight={600}>
            {itemLabel(item)}
          </text>
        </g>
      ))}
      {upperLabels.map(({ item, row, x }) => (
        <g key={`lu-${item.id}`}>
          {row > 0 && <line x1={x} y1={-fs * 0.3} x2={x} y2={-fs * 0.9 - row * labelStep} stroke="#9A9DA0" strokeWidth={0.2} />}
          <text x={x} y={-fs * 0.6 - row * labelStep} fontSize={labelSize} textAnchor="middle" fill="#1A1D1F" fontWeight={600}>
            {itemLabel(item)}
          </text>
        </g>
      ))}

      {/* chain dimensions: floor pieces below, wall-hung pieces above */}
      {lower.map((it) => (
        <DimH key={`d-${it.id}`} x0={it.offset} x1={it.offset + it.width} y={H + fs * 3.6 + lowerExtra} fs={fs * 0.8} />
      ))}
      {upper.map((it) => (
        <DimH key={`du-${it.id}`} x0={it.offset} x1={it.offset + it.width} y={-fs * 2.6 - upperExtra} fs={fs * 0.8} />
      ))}
      <DimH x0={0} x1={L} y={H + fs * 6.8 + lowerExtra} fs={fs} label={`${fmtIn(L)}`} />

      {sortedMarks.slice(0, -1).map((m, i) => (
        <DimV key={`h-${m}`} y0={Y(m)} y1={Y(sortedMarks[i + 1])} x={-fs * 1.6} fs={fs * 0.75} />
      ))}
      {!island && <DimV y0={Y(0)} y1={Y(H)} x={-fs * 4.6} fs={fs * 0.85} />}

      {withRefs && refs?.section && (() => {
        // section cut marker: the cut line down through the cabinets, the tail at the top, the bubble below with its arrow
        const x = refs.section.s;
        const c = { x, y: rowY };
        return (
          <g>
            <line x1={x} x2={x} y1={0} y2={c.y - rr} stroke="#000000" strokeWidth={rr * 0.07} strokeDasharray={`${rr * 0.9} ${rr * 0.25}`} />
            <line x1={x} x2={x + rr * 0.8} y1={0} y2={0} stroke="#000000" strokeWidth={rr * 0.16} />
            <polygon points={`${x + rr * 1.75},${c.y} ${x + rr * 0.4},${c.y - rr * 0.95} ${x + rr * 0.4},${c.y + rr * 0.95}`} fill="#000000" />
            <RefBubble c={c} r={rr} n={refs.section.n} sheet={refs.section.sheet} />
          </g>
        );
      })()}
      {withRefs && refs?.detail && (() => {
        // detail marker: the area drawn larger, dashed, with a leader to its bubble
        const d = refs.detail;
        const pad = rr * 0.25;
        const x0 = d.x0 - pad, x1 = d.x1 + pad, y0 = Y(d.z1) - pad, y1 = Y(d.z0) + pad;
        let cx = (x0 + x1) / 2;
        if (refs.section && Math.abs(cx - refs.section.s) < rr * 4.2) cx = refs.section.s + (cx < refs.section.s ? -1 : 1) * rr * 4.2;
        cx = Math.max(-ML + rr * 1.2, Math.min(L + MR - rr * 1.2, cx));
        const c = { x: cx, y: rowY };
        return (
          <g>
            <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} rx={pad} fill="none" stroke="#000000" strokeWidth={rr * 0.05} strokeDasharray={`${rr * 0.35} ${rr * 0.2}`} />
            <polyline points={`${(x0 + x1) / 2},${y1} ${(x0 + x1) / 2},${c.y - rr * 1.6} ${c.x},${c.y - rr}`} fill="none" stroke="#000000" strokeWidth={rr * 0.05} />
            <RefBubble c={c} r={rr} n={d.n} sheet={d.sheet} />
          </g>
        );
      })()}

      {print ? null : (
        <text x={0} y={H + MB - fs * 0.3} fontSize={fs} textAnchor="start" fill="#1A1D1F" fontWeight={700} letterSpacing={fs * 0.08}>
          {open ? `${frame.label.toUpperCase()} (OPEN)` : frame.label.toUpperCase()}
        </text>
      )}
    </svg>
  );
}
