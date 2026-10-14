"use client";

// Front view of one wall or island: cabinets, appliances, countertop, doors
// and windows, with width and height dimension strings.

import type { PointerEvent as ReactPointerEvent } from "react";
import type { Catalog, DesignData, Opening, PlacedItem } from "@/lib/types";
import { isWall, itemLabel, runFrame } from "@/lib/geometry";
import { fmtIn } from "@/lib/units";
import { CabinetFront } from "./CabinetFront";
import { DimH, DimV } from "./dims";
import { PaintDefs, PROBLEM, SELECT, counterPaint, finishPaint } from "./paint";

export type DrawTarget = { kind: "item" | "opening" | "island" | "wall"; id: string };

export interface ViewProps {
  design: DesignData;
  catalog: Catalog;
  selectedId?: string | null;
  problemIds?: Set<string>;
  onTargetDown?: (e: ReactPointerEvent<SVGElement>, target: DrawTarget) => void;
  onBackgroundDown?: () => void;
  className?: string;
}

const COUNTER_STYLES = new Set(["base", "drawer_base", "sink_base", "blind_corner_base", "lazy_susan", "open_shelf", "vanity_combo", "dishwasher"]);
const BASE_TOP = 34.5;

function counterRuns(items: PlacedItem[]): [number, number][] {
  const spans = items
    .filter((i) => COUNTER_STYLES.has(i.style) && i.mountHeight === 0 && Math.abs(i.height - BASE_TOP) < 0.01)
    .map((i) => [i.offset, i.offset + i.width] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (last && s[0] <= last[1] + 0.1) last[1] = Math.max(last[1], s[1]);
    else merged.push([...s]);
  }
  return merged;
}

function OpeningFront({ op, Y }: { op: Opening; Y: (z: number) => number }) {
  const x = op.offset;
  const w = op.width;
  const casing = 2.5;
  if (op.type === "window") {
    const z0 = op.sill;
    const z1 = op.sill + op.height;
    return (
      <g>
        <rect x={x - casing} y={Y(z1 + casing)} width={w + casing * 2} height={op.height + casing * 2} fill="#FFFFFF" stroke="#8A8D90" strokeWidth={0.3} />
        <rect x={x} y={Y(z1)} width={w} height={op.height} fill="#DCE7EC" stroke="#5E6266" strokeWidth={0.35} />
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
        <rect x={x} y={Y(op.height)} width={w} height={op.height} fill="#F4F2EC" stroke="#5E6266" strokeWidth={0.35} />
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

export function ElevationView({ design, catalog, run, selectedId, problemIds, onTargetDown, onBackgroundDown, className }: ViewProps & { run: string }) {
  const frame = runFrame(design, run);
  if (!frame) return null;
  const L = frame.length;
  const island = frame.kind === "island";
  const islandTop = design.items.filter((i) => i.run === run).reduce((m, i) => Math.max(m, i.mountHeight + i.height), 0);
  // islands are drawn without a wall behind them, so the view only needs to clear the tallest piece
  const H = island ? Math.max(48, Math.ceil(islandTop + 8)) : design.room.ceiling;
  const fs = Math.max(2.4, Math.min(4.2, Math.max(L, H) / 52));
  const ML = fs * 6.5;
  const MR = fs * 2;
  const MT = fs * 5;
  const MB = fs * 9;
  const Y = (z: number) => H - z;

  const items = design.items.filter((i) => i.run === run);
  const openings = isWall(run) ? design.openings.filter((o) => o.wall === run) : [];
  const lower = items.filter((i) => i.mountHeight === 0).sort((a, b) => a.offset - b.offset);
  const upper = items.filter((i) => i.mountHeight > 0).sort((a, b) => a.offset - b.offset);
  const counter = counterPaint(catalog, design);
  const counterThick = catalog.countertops.find((c) => c.id === design.countertopId)?.thickness ?? 1.5;
  const runs = counterRuns(items);

  // height marks for the left dimension string
  const marks = new Set<number>(island ? [0] : [0, H]);
  if (runs.length) marks.add(BASE_TOP + counterThick);
  for (const it of items) {
    if (it.mountHeight > 0) {
      marks.add(it.mountHeight);
      marks.add(it.mountHeight + it.height);
    } else if (it.category === "tall" || it.style === "refrigerator") marks.add(it.height);
  }
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
    const paint = finishPaint(catalog, design, it);
    const selected = selectedId === it.id;
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
      onPointerDown={() => onBackgroundDown?.()}
      style={{ touchAction: "none", userSelect: "none" }}
    >
      <PaintDefs catalog={catalog} />
      {!island && <rect x={0} y={0} width={L} height={H} fill="#FBFAF7" stroke="#B9BBBD" strokeWidth={0.3} />}

      {openings.map((op) => (
        <g key={op.id} onPointerDown={down({ kind: "opening", id: op.id })} style={{ cursor: onTargetDown ? "grab" : undefined }}>
          <OpeningFront op={op} Y={Y} />
          {(selectedId === op.id || problemIds?.has(op.id)) && (
            <rect
              x={op.offset - 0.5}
              y={Y(op.type === "window" ? op.sill + op.height : op.height) - 0.5}
              width={op.width + 1}
              height={op.height + 1}
              fill="none"
              stroke={selectedId === op.id ? SELECT : PROBLEM}
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

      {/* floor and ceiling lines */}
      <line x1={-2} x2={L + 2} y1={Y(0)} y2={Y(0)} stroke="#1A1D1F" strokeWidth={0.9} />

      {/* labels under the floor line */}
      {[...lower, ...upper].map((it) => (
        <text
          key={`l-${it.id}`}
          x={it.offset + it.width / 2}
          y={it.mountHeight > 0 ? -fs * 0.6 : H + fs * 1.5}
          fontSize={fs * 0.85}
          textAnchor="middle"
          fill="#1A1D1F"
          fontWeight={600}
        >
          {it.width >= fs * 2.2 ? itemLabel(it) : ""}
        </text>
      ))}

      {/* chain dimensions: floor pieces below, wall-hung pieces above */}
      {lower.map((it) => (
        <DimH key={`d-${it.id}`} x0={it.offset} x1={it.offset + it.width} y={H + fs * 3.6} fs={fs * 0.8} />
      ))}
      {upper.map((it) => (
        <DimH key={`du-${it.id}`} x0={it.offset} x1={it.offset + it.width} y={-fs * 2.6} fs={fs * 0.8} />
      ))}
      <DimH x0={0} x1={L} y={H + fs * 6.8} fs={fs} label={`${fmtIn(L)}`} />

      {sortedMarks.slice(0, -1).map((m, i) => (
        <DimV key={`h-${m}`} y0={Y(m)} y1={Y(sortedMarks[i + 1])} x={-fs * 1.6} fs={fs * 0.75} />
      ))}
      {!island && <DimV y0={Y(0)} y1={Y(H)} x={-fs * 4.6} fs={fs * 0.85} />}

      <text x={0} y={H + MB - fs * 0.3} fontSize={fs} textAnchor="start" fill="#1A1D1F" fontWeight={700} letterSpacing={fs * 0.08}>
        {frame.label.toUpperCase()}
      </text>
    </svg>
  );
}
