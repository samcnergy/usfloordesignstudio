// Soffits (bulkheads) over the wall cabinets (owner, 2026-11-21; K&B drawing
// standards Chapter 13). A soffit runs along a wall from one point to another,
// comes out from the wall by its depth, and drops to its bottom height above
// the finished floor. New soffits start over the wall cabinets on that wall:
// their run, their depth and their tops, so nothing is made up.

import { roomShape, runFrame, runQuad, type Vec } from "./geometry";
import type { DesignData, Soffit } from "./types";

export const soffitsOf = (d: DesignData): Soffit[] => d.soffits ?? [];

export function soffitQuad(d: DesignData, so: Soffit): Vec[] | null {
  const f = runFrame(d, so.wall);
  return f ? runQuad(f, so.s0, so.s1, 0, so.depth) : null;
}

/** A new soffit on a wall: over its wall cabinets (their run, depth and tops) when it has some, otherwise the whole wall, 12" deep, 12" down from the ceiling. */
export function newSoffit(d: DesignData, wall: string, id: string): Soffit {
  const w = roomShape(d.room).walls.find((x) => x.id === wall && !x.open) ?? roomShape(d.room).walls.find((x) => !x.open)!;
  const uppers = d.items.filter((i) => i.run === w.id && i.mountHeight > 0 && i.category === "wall");
  if (uppers.length) {
    const s0 = Math.min(...uppers.map((i) => i.offset));
    const s1 = Math.max(...uppers.map((i) => i.offset + i.width));
    const tops = Math.max(...uppers.map((i) => i.mountHeight + i.height));
    // cabinets that already run to the ceiling leave no room: start 12" down, and the problem list says what to lower
    const bottom = tops < d.room.ceiling - 1 ? tops : d.room.ceiling - 12;
    return { id, wall: w.id, s0, s1, depth: Math.max(...uppers.map((i) => i.depth)), bottom };
  }
  return { id, wall: w.id, s0: 0, s1: w.length, depth: 12, bottom: d.room.ceiling - 12 };
}
