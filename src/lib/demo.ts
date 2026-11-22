// The demolition and construction plan (owner, 2026-11-21: the new drawings, K&B
// drawing standards Chapter 9). What comes out is ticked in plain words on the
// Room tab; walls and openings are marked existing or new; the blocking for the
// wall cabinets is worked out from the cabinets.

import { roomShape } from "./geometry";
import type { DesignData } from "./types";

export const DEMO_ITEMS = [
  "Existing cabinets and countertops",
  "Existing backsplash",
  "Existing flooring",
  "Existing appliances",
  "Existing soffits",
  "Existing light fixtures",
  "Existing plumbing fixtures",
];

/** Whether the set needs the demolition and construction plan: anything removed, built or newly opened. */
export function needsDemoPlan(d: DesignData): boolean {
  return (d.demo?.remove.length ?? 0) > 0 || !!d.demo?.notes?.trim()
    || d.room.walls.some((w) => w.status === "new" || w.status === "removed")
    || d.openings.some((o) => o.status === "new");
}

/** Blocking for wall-hung cabinets and hoods: the spans along each wall, merged. */
export function blockingSpans(d: DesignData): { wall: string; s0: number; s1: number }[] {
  const out: { wall: string; s0: number; s1: number }[] = [];
  for (const w of roomShape(d.room).walls) {
    if (w.open) continue;
    const s = d.items.filter((i) => i.run === w.id && i.mountHeight > 0).map((i) => [i.offset, i.offset + i.width] as [number, number]).sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];
    for (const x of s) {
      const last = merged[merged.length - 1];
      if (last && x[0] <= last[1] + 0.1) last[1] = Math.max(last[1], x[1]);
      else merged.push([...x]);
    }
    for (const [s0, s1] of merged) out.push({ wall: w.id, s0, s1 });
  }
  return out;
}

/** New doors and windows, numbered clockwise from the top-left corner: D-1, D-2... and W-1, W-2... */
export function newOpeningKeys(d: DesignData): Map<string, string> {
  const walls = roomShape(d.room).walls.map((w) => w.id);
  const sorted = d.openings.filter((o) => o.status === "new").sort((a, b) => walls.indexOf(a.wall) - walls.indexOf(b.wall) || a.offset - b.offset);
  const n = { door: 0, window: 0, opening: 0 };
  const out = new Map<string, string>();
  for (const o of sorted) {
    n[o.type] += 1;
    out.set(o.id, `${o.type === "door" ? "D" : o.type === "window" ? "W" : "O"}-${n[o.type]}`);
  }
  return out;
}
