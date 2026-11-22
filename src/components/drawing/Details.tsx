"use client";

// Details (K&B drawing standards, Chapter 13), drawn from the design's own
// sizes: a typical cabinet cross section through a wall with base and wall
// cabinets (floor, wall and ceiling lines, the countertop, backsplash, crown,
// and the blocking in the wall), and the countertop edge profile at a larger
// scale. Notes go on the left on leaders, dimensions on the right.

import type { ReactNode } from "react";
import { BASE_TOP } from "@/lib/plan";
import { cabinetTop } from "@/lib/place";
import type { DesignData, PlacedItem } from "@/lib/types";
import { fmtIn } from "@/lib/units";
import { DimV, DimH } from "./dims";

const INK = "#000000";

/** The wall with the most base and wall cabinets one above the other: where the typical section is cut. */
export function sectionRun(design: DesignData): { run: string; base: PlacedItem; upper: PlacedItem | null } | null {
  let best: { run: string; base: PlacedItem; upper: PlacedItem | null; score: number } | null = null;
  for (const base of design.items.filter((i) => i.mountHeight === 0 && i.category === "base" && Math.abs(i.height - BASE_TOP) < 0.01)) {
    const upper = design.items.find((u) => u.run === base.run && u.category === "wall" && u.mountHeight > 0 && u.offset < base.offset + base.width && base.offset < u.offset + u.width) ?? null;
    const score = (upper ? 10 : 0) + (base.style === "base" ? 1 : 0);
    if (!best || score > best.score) best = { run: base.run, base, upper, score };
  }
  return best ? { run: best.run, base: best.base, upper: best.upper } : null;
}

function Leader({ from, to, text, fs }: { from: { x: number; y: number }; to: { x: number; y: number }; text: string; fs: number }) {
  return (
    <g>
      <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={INK} strokeWidth={fs * 0.06} />
      <circle cx={to.x} cy={to.y} r={fs * 0.18} fill={INK} />
      <text x={from.x - fs * 0.3} y={from.y + fs * 0.32} fontSize={fs * 0.85} textAnchor="end" fill={INK}>{text}</text>
    </g>
  );
}

export function CabinetSection({ design, scale, counter, splash, floorKey }: {
  design: DesignData; scale: number;
  counter: { name: string; thickness: number } | null;
  splash: string | null; floorKey: string | null;
}) {
  const cut = sectionRun(design);
  if (!cut) return null;
  const { base, upper } = cut;
  const fs = scale * 0.11;
  const H = design.room.ceiling;
  const t = design.room.wallThickness ?? 4.5;
  const thick = counter?.thickness ?? 1.5;
  const D = base.depth;
  const top = BASE_TOP + thick;
  const Y = (z: number) => H - z;
  const kickH = 4; // drawn only; its size is the cabinet maker's (noted, not dimensioned)
  const kickD = 3;
  const left = -t - fs * 16;
  const right = D + 1 + fs * 9;
  const crown = Math.max(0, design.crown ?? 0);
  const ctop = cabinetTop(design);
  const parts: ReactNode[] = [];
  // the wall, the floor and the ceiling
  parts.push(<rect key="wall" x={-t} y={Y(H)} width={t} height={H} fill="#FFFFFF" stroke={INK} strokeWidth={0.4} />);
  parts.push(<line key="floor" x1={-t - 4} x2={D + 12} y1={Y(0)} y2={Y(0)} stroke={INK} strokeWidth={0.6} />);
  parts.push(<line key="clg" x1={-t - 4} x2={D + 12} y1={Y(H)} y2={Y(H)} stroke={INK} strokeWidth={0.6} />);
  // the base cabinet in section: the case, the toe kick, the door
  parts.push(<polygon key="base" points={`0,${Y(kickH)} ${D - kickD},${Y(kickH)} ${D - kickD},${Y(0)} 0,${Y(0)} 0,${Y(BASE_TOP)} ${D - 0.75},${Y(BASE_TOP)} ${D - 0.75},${Y(kickH)}`} fill="#FFFFFF" stroke={INK} strokeWidth={0.35} />);
  parts.push(<rect key="door" x={D - 0.75} y={Y(BASE_TOP)} width={0.75} height={BASE_TOP - kickH} fill="#FFFFFF" stroke={INK} strokeWidth={0.35} />);
  parts.push(<line key="shelf" x1={0.75} x2={D - 1.5} y1={Y(BASE_TOP / 2 + kickH / 2)} y2={Y(BASE_TOP / 2 + kickH / 2)} stroke={INK} strokeWidth={0.25} strokeDasharray="1.2 0.8" />);
  // the countertop, with its overhang
  parts.push(<rect key="ctr" x={0} y={Y(top)} width={D + 1} height={thick} fill="#E6E6E6" stroke={INK} strokeWidth={0.45} />);
  const wallBottom = upper ? upper.mountHeight : top + 18;
  // backsplash on the wall, between the counter and the wall cabinet
  if (splash) parts.push(<rect key="splash" x={0} y={Y(wallBottom)} width={0.5} height={wallBottom - top} fill="#CFCFCF" stroke={INK} strokeWidth={0.25} />);
  if (upper) {
    parts.push(<rect key="upper" x={0} y={Y(upper.mountHeight + upper.height)} width={upper.depth} height={upper.height} fill="#FFFFFF" stroke={INK} strokeWidth={0.35} />);
    parts.push(<rect key="udoor" x={upper.depth - 0.75} y={Y(upper.mountHeight + upper.height)} width={0.75} height={upper.height} fill="#FFFFFF" stroke={INK} strokeWidth={0.35} />);
    parts.push(<line key="ushelf" x1={0.75} x2={upper.depth - 1.5} y1={Y(upper.mountHeight + upper.height / 2)} y2={Y(upper.mountHeight + upper.height / 2)} stroke={INK} strokeWidth={0.25} strokeDasharray="1.2 0.8" />);
    // blocking in the wall behind the wall cabinet
    parts.push(<rect key="blk" x={-1.5} y={Y(upper.mountHeight + upper.height)} width={1.5} height={upper.height} fill="url(#sec-blk)" stroke={INK} strokeWidth={0.2} />);
    if (crown > 0) parts.push(<polygon key="crown" points={`${upper.depth},${Y(ctop - crown)} ${upper.depth + crown * 0.7},${Y(ctop)} ${0},${Y(ctop)} ${0},${Y(ctop - crown)}`} fill="#FFFFFF" stroke={INK} strokeWidth={0.35} />);
  }
  // notes on the left
  const lx = -t - fs * 1.5;
  const notes: [number, string, { x: number; y: number }][] = [
    [H - 3, "CEILING", { x: -t / 2, y: Y(H) }],
    ...(upper ? [
      [upper.mountHeight + upper.height * 0.75, `WALL CABINET ${upper.code}`, { x: upper.depth / 2, y: Y(upper.mountHeight + upper.height * 0.75) }] as [number, string, { x: number; y: number }],
      [upper.mountHeight + upper.height * 0.35, "BLOCKING IN WALL, FULL RUN", { x: -0.75, y: Y(upper.mountHeight + upper.height * 0.35) }] as [number, string, { x: number; y: number }],
      ...(crown > 0 ? [[ctop - crown / 2 + 6, "CABINET CROWN MOLDING", { x: upper.depth / 2, y: Y(ctop - crown / 2) }] as [number, string, { x: number; y: number }]] : []),
    ] : []),
    ...(splash ? [[(top + wallBottom) / 2, `BACKSPLASH ${splash}`, { x: 0.25, y: Y((top + wallBottom) / 2) }] as [number, string, { x: number; y: number }]] : []),
    [top - thick / 2 + 3, `COUNTERTOP${counter ? `, ${counter.name.toUpperCase()}` : ""}, ${fmtIn(thick)}`, { x: D / 2, y: Y(top - thick / 2) }],
    [BASE_TOP * 0.6, `BASE CABINET ${base.code}`, { x: D / 2, y: Y(BASE_TOP * 0.6) }],
    [kickH + 3, "TOE KICK PER CABINET MAKER", { x: D - kickD - 0.5, y: Y(kickH / 2) }],
    [-2, `FINISHED FLOOR${floorKey ? ` ${floorKey}` : ""}`, { x: D / 3, y: Y(0) }],
  ];
  // dimensions on the right: heights, and the depths at the bottom
  const marks = [0, BASE_TOP, top, ...(upper ? [upper.mountHeight, upper.mountHeight + upper.height] : []), ...(crown > 0 && upper ? [ctop] : []), H].sort((a, b) => a - b);
  const width = right - left;
  return (
    <svg viewBox={`${left} ${-fs * 2} ${width} ${H + fs * 7}`} style={{ width: `${width / scale}in`, height: `${(H + fs * 7) / scale}in`, display: "block" }}
      fontFamily="'Source Sans 3', Helvetica, Arial, sans-serif">
      <defs>
        <pattern id="sec-blk" patternUnits="userSpaceOnUse" width={1.5} height={1.5}><path d="M 0 0 L 1.5 1.5 M 1.5 0 L 0 1.5" stroke={INK} strokeWidth={0.12} /></pattern>
      </defs>
      {parts}
      {notes.map(([z, text, to], i) => <Leader key={i} from={{ x: lx, y: Y(z) }} to={to} text={text} fs={fs} />)}
      {marks.slice(1).map((m, i) => <DimV key={i} y0={Y(marks[i])} y1={Y(m)} x={D + 1 + fs * 3} fs={fs * 0.8} />)}
      <DimV y0={Y(0)} y1={Y(H)} x={D + 1 + fs * 6.5} fs={fs * 0.8} />
      <DimH x0={0} x1={D} y={Y(0) + fs * 2} fs={fs * 0.8} />
      <DimH x0={0} x1={D + 1} y={Y(0) + fs * 4.2} fs={fs * 0.8} />
      {upper && <DimH x0={0} x1={upper.depth} y={Y(upper.mountHeight + upper.height) - fs * 0.9} fs={fs * 0.8} />}
    </svg>
  );
}

/** The countertop edge in section, larger: the profile, the overhang past the door face, the thickness. */
export function EdgeDetail({ scale, thickness, edge }: { scale: number; thickness: number; edge: string | null }) {
  const fs = scale * 0.11;
  const t = thickness;
  const r = Math.min(t / 2, 0.75);
  // the edge outline, from the top back to the bottom back, around the front
  const front = 1 + 0.75 + 1; // the case face, the 3/4" door, then the 1" overhang
  const shape = (() => {
    switch (edge) {
      case "full bullnose": return `M 0 0 L ${front - t / 2} 0 A ${t / 2} ${t / 2} 0 0 1 ${front - t / 2} ${t} L 0 ${t} Z`;
      case "half bullnose": return `M 0 0 L ${front - t / 2} 0 A ${t / 2} ${t / 2} 0 0 1 ${front} ${t / 2} L ${front} ${t} L 0 ${t} Z`;
      case "1/4\" bevel": return `M 0 0 L ${front - 0.25} 0 L ${front} 0.25 L ${front} ${t} L 0 ${t} Z`;
      case "ogee": return `M 0 0 L ${front - 0.5} 0 Q ${front} 0 ${front - 0.15} ${t * 0.45} Q ${front - 0.3} ${t * 0.75} ${front} ${t} L 0 ${t} Z`;
      default: return `M 0 0 L ${front - r * 0.3} 0 Q ${front} 0 ${front} ${r * 0.3} L ${front} ${t} L 0 ${t} Z`; // eased
    }
  })();
  const W = 6;
  const Hh = t + 5;
  return (
    <svg viewBox={`${-3} ${-fs * 2.5} ${W + fs * 8} ${Hh + fs * 4}`} style={{ width: `${(W + fs * 8) / scale}in`, height: `${(Hh + fs * 4) / scale}in`, display: "block" }}
      fontFamily="'Source Sans 3', Helvetica, Arial, sans-serif">
      {/* the slab */}
      <path d={shape} fill="#E6E6E6" stroke={INK} strokeWidth={0.06} />
      {/* the case side and the door below it */}
      <rect x={-3} y={t} width={3 + 1 - 0.0} height={5} fill="none" stroke={INK} strokeWidth={0.05} />
      <rect x={1} y={t + 0.1} width={0.75} height={4.9} fill="#FFFFFF" stroke={INK} strokeWidth={0.05} />
      <DimH x0={1.75} x1={front} y={-fs * 1.1} fs={fs * 0.8} w={0.2} />
      <DimV y0={0} y1={t} x={front + fs * 2.2} fs={fs * 0.8} w={0.2} />
      <text x={-2.8} y={-fs * 1.6} fontSize={fs * 0.8} fill={INK}>{(edge ?? "eased").toUpperCase()} EDGE</text>
      <text x={1.4} y={t + 4.6} fontSize={fs * 0.7} fill={INK} transform={`rotate(-90 1.4 ${t + 4.6})`}>DOOR</text>
    </svg>
  );
}
