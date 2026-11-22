"use client";

// Finish plan graphics (K&B drawing standards, Chapter 10): the finish symbol, a
// Greek cross of wall boxes around a screened circle for the floor, with the
// ceiling above and the base below; tags with a leader ending in a dot for the
// backsplash; and the floor pattern in a light line.

import { backsplashAreas, type FinishData, type FinishUse } from "@/lib/finishes";
import { pointOn, roomShape, type Vec } from "@/lib/geometry";
import type { DesignData } from "@/lib/types";

const INK = "#000000";

function Box({ at, b, text }: { at: Vec; b: number; text: string }) {
  return (
    <g>
      <rect x={at.x - b / 2} y={at.y - b / 2} width={b} height={b} fill="#FFFFFF" stroke={INK} strokeWidth={b * 0.05} />
      <text x={at.x} y={at.y + b * 0.13} fontSize={b * 0.34} textAnchor="middle" fill={INK} fontWeight={600}>{text}</text>
    </g>
  );
}

/** The finish symbol for one room. Wall boxes sit on the side of the wall they describe. */
export function FinishCross({ design, at, b, keys, uses }: { design: DesignData; at: Vec; b: number; keys: Partial<Record<FinishUse, string>>; uses: FinishData["uses"] }) {
  const walls = roomShape(design.room).walls;
  // which side of the plan has a wall: up, right, down, left
  const dirs: [Vec, Vec][] = [[{ x: 0, y: -1 }, { x: 0, y: -b }], [{ x: 1, y: 0 }, { x: b, y: 0 }], [{ x: 0, y: 1 }, { x: 0, y: b }], [{ x: -1, y: 0 }, { x: -b, y: 0 }]];
  const wallKey = keys.walls ?? "";
  return (
    <g>
      {dirs.map(([d, off], i) => {
        const has = walls.some((w) => !w.open && -w.n.x * d.x + -w.n.y * d.y > 0.7);
        return <Box key={i} at={{ x: at.x + off.x, y: at.y + off.y }} b={b} text={has ? wallKey : ""} />;
      })}
      {uses.ceiling && (
        <>
          <Box at={{ x: at.x, y: at.y - 2 * b }} b={b} text={keys.ceiling ?? ""} />
          <text x={at.x} y={at.y - 2.65 * b} fontSize={b * 0.28} textAnchor="middle" fill={INK}>CEILING</text>
        </>
      )}
      {uses.base && (
        <>
          <Box at={{ x: at.x, y: at.y + 2 * b }} b={b} text={keys.base ?? ""} />
          <text x={at.x} y={at.y + 2.85 * b} fontSize={b * 0.28} textAnchor="middle" fill={INK}>BASE</text>
        </>
      )}
      {/* the floor: a circle with a screened fill */}
      <circle cx={at.x} cy={at.y} r={b * 0.5} fill="#E6E6E6" stroke={INK} strokeWidth={b * 0.05} />
      <text x={at.x} y={at.y + b * 0.13} fontSize={b * 0.34} textAnchor="middle" fill={INK} fontWeight={700}>{keys.floor ?? ""}</text>
    </g>
  );
}

/** Backsplash tags: a box in front of each counter, with a leader ending in a dot at the wall. */
export function BacksplashTags({ design, b, keyText, counterThick }: { design: DesignData; b: number; keyText: string; counterThick: number }) {
  const walls = roomShape(design.room).walls;
  return (
    <g>
      {backsplashAreas(design, counterThick).filter((a) => a.s1 - a.s0 >= b * 2).map((a, i) => {
        const w = walls.find((x) => x.id === a.wall);
        if (!w) return null;
        const s = (a.s0 + a.s1) / 2;
        const depth = Math.max(24, ...design.items.filter((it) => it.run === w.id && it.mountHeight === 0 && it.offset < a.s1 && a.s0 < it.offset + it.width).map((it) => it.depth));
        const box = pointOn(w, s + b * 1.2, depth + b * 1.4);
        const dot = pointOn(w, s, 0.6);
        const edge = pointOn(w, s + b * 1.2, depth + b * 0.9);
        return (
          <g key={i}>
            <line x1={edge.x} y1={edge.y} x2={dot.x} y2={dot.y} stroke={INK} strokeWidth={b * 0.04} />
            <circle cx={dot.x} cy={dot.y} r={b * 0.12} fill={INK} />
            <Box at={box} b={b} text={keyText} />
          </g>
        );
      })}
    </g>
  );
}

/** The floor pattern, light: a tile grid, or plank joints with staggered ends. */
export function FloorPattern({ design, size, kind, clipId }: { design: DesignData; size: { w: number; l: number }; kind: "grid" | "plank"; clipId: string }) {
  const B = roomShape(design.room).bounds;
  const lines: React.ReactNode[] = [];
  const w = Math.max(2, size.w);
  const l = Math.max(2, size.l);
  if (kind === "grid") {
    for (let x = B.x0; x <= B.x1; x += w) lines.push(<line key={`x${x}`} x1={x} y1={B.y0} x2={x} y2={B.y1} />);
    for (let y = B.y0; y <= B.y1; y += l) lines.push(<line key={`y${y}`} x1={B.x0} y1={y} x2={B.x1} y2={y} />);
  } else {
    // planks run left to right; end joints stagger by a third of a plank
    let row = 0;
    for (let y = B.y0; y <= B.y1; y += w, row++) {
      lines.push(<line key={`r${y}`} x1={B.x0} y1={y} x2={B.x1} y2={y} />);
      for (let x = B.x0 + ((row % 3) * l) / 3; x <= B.x1; x += l) lines.push(<line key={`j${y}-${x}`} x1={x} y1={y} x2={x} y2={y + w} />);
    }
  }
  return <g clipPath={`url(#${clipId})`} stroke="#B4B6B8" strokeWidth={0.18}>{lines}</g>;
}
