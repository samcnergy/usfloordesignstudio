// The printed floor plan, drawn to the K&B drawing standards (owner, 2026-11-21,
// "plan correctness"). The plan is cut at the ceiling, so:
//
// - base and vanity cabinets, and anything else under the counter, are hidden
//   lines showing the outer edge of the cases;
// - the countertop is an object line over them;
// - wall and tall cabinets are object lines, at the same weight;
// - an appliance with nothing above it is an object line; one under a counter,
//   a hood or a cabinet is a hidden line;
// - every appliance door is drawn as a hidden line, fully open;
// - sinks, cooking, ventilation and refrigeration are located by centerlines;
// - each wall gets up to three dimension strings: openings (inner),
//   centerlines (center) and the overall length (outer).
//
// Everything here is plain geometry, so it can be tested without drawing.

import type { DesignData, Opening, PlacedItem } from "./types";
import { liveOpenings } from "./types";
import { pointOn, roomShape, type RunFrame, type Vec } from "./geometry";

/** Top of a standard base cabinet, without the countertop. */
export const BASE_TOP = 34.5;

/** Styles that get a countertop (kept in step with the front views). */
export const COUNTER_STYLES = new Set(["base", "drawer_base", "sink_base", "blind_corner_base", "lazy_susan", "open_shelf", "vanity_combo", "dishwasher"]);

/** Fixtures and equipment located by a centerline (sinks, cooking, ventilation, refrigeration). */
export const CENTERLINE_STYLES = new Set(["sink_base", "vanity_combo", "range", "hood", "refrigerator", "dishwasher", "wall_microwave", "tall_oven"]);

/** Door and window casing on each side of an opening; openings are dimensioned to the outside of the casing. */
export const CASING = 2.5;

/** Countertop overhang past the cabinet fronts, and around an island. */
export const OVERHANG = 1;

/**
 * Open-door sizes used when the manufacturer's figure is not in the catalog. These are the usual
 * sizes for a standard dishwasher and range; the plan notes say to check the manufacturer's guide.
 */
export const DROP_DOOR = { dishwasher: 27, range: 20 } as const;

const overlap = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 - 0.01 && b0 < a1 - 0.01;

/** Something hanging over this piece on the same wall or island: a hood, a microwave, a wall cabinet. */
function overhead(design: DesignData, it: PlacedItem): boolean {
  return design.items.some((o) => o.id !== it.id && o.run === it.run && o.mountHeight >= it.mountHeight + it.height - 0.01 && overlap(o.offset, o.offset + o.width, it.offset, it.offset + it.width));
}

/** Hidden (dashed) or object (solid) line for a piece on the plan. */
export function planLine(design: DesignData, it: PlacedItem): "hidden" | "object" {
  if (it.mountHeight > 0 || it.category === "wall" || it.category === "tall") return "object";
  // under the counter: base and vanity cases, base fillers and panels, a dishwasher
  if (it.height <= BASE_TOP + 0.01 || it.style === "dishwasher") return "hidden";
  return overhead(design, it) ? "hidden" : "object";
}

/** A countertop outline: the area it covers on a wall or island, as plan points. */
export function counterOutlines(design: DesignData, frames: Map<string, RunFrame>): Vec[][] {
  const out: Vec[][] = [];
  for (const frame of frames.values()) {
    const on = design.items.filter((i) => i.run === frame.id && i.mountHeight === 0 && COUNTER_STYLES.has(i.style) && Math.abs(i.height - BASE_TOP) < 0.01);
    if (!on.length) continue;
    const sorted = [...on].sort((a, b) => a.offset - b.offset);
    const spans: { s0: number; s1: number; depth: number }[] = [];
    for (const it of sorted) {
      const last = spans[spans.length - 1];
      if (last && it.offset <= last.s1 + 0.1) {
        last.s1 = Math.max(last.s1, it.offset + it.width);
        last.depth = Math.max(last.depth, it.depth);
      } else spans.push({ s0: it.offset, s1: it.offset + it.width, depth: it.depth });
    }
    const island = frame.kind === "island";
    for (const sp of spans) {
      const s0 = island ? sp.s0 - OVERHANG : sp.s0;
      const s1 = island ? sp.s1 + OVERHANG : sp.s1;
      const t0 = island ? -OVERHANG : 0;
      const t1 = sp.depth + OVERHANG;
      out.push([pointOn(frame, s0, t0), pointOn(frame, s1, t0), pointOn(frame, s1, t1), pointOn(frame, s0, t1)]);
    }
  }
  return out;
}

export type SwingShape =
  | { kind: "line"; a: Vec; b: Vec }
  | { kind: "arc"; from: Vec; to: Vec; r: number; sweep: 0 | 1 }
  | { kind: "box"; pts: Vec[] };

/** An appliance's doors drawn fully open, as hidden lines. Nothing for anything that is not an appliance with a door. */
export function applianceDoors(it: PlacedItem, frame: RunFrame): SwingShape[] {
  const f = (s: number, t: number) => pointOn(frame, s, t);
  const front = it.depth;
  const s0 = it.offset;
  const s1 = it.offset + it.width;
  if (it.style === "dishwasher" || it.style === "range") {
    // a drop-down door, lying flat in front of the appliance
    const reach = DROP_DOOR[it.style];
    return [{ kind: "box", pts: [f(s0, front), f(s1, front), f(s1, front + reach), f(s0, front + reach)] }];
  }
  if (it.style === "refrigerator") {
    // side-hinged doors swung 90 degrees: one door, or two French doors on refrigerators 33" and wider
    const leaf = (hingeS: number, otherS: number): SwingShape[] => {
      const w = Math.abs(otherS - hingeS);
      const hinge = f(hingeS, front);
      const tip = f(hingeS, front + w);
      const jamb = f(otherS, front);
      const ax = tip.x - hinge.x, ay = tip.y - hinge.y, bx = jamb.x - hinge.x, by = jamb.y - hinge.y;
      return [
        { kind: "line", a: hinge, b: tip },
        { kind: "arc", from: tip, to: jamb, r: w, sweep: ax * by - ay * bx > 0 ? 1 : 0 },
      ];
    };
    if (it.width >= 33) {
      const mid = (s0 + s1) / 2;
      return [...leaf(s0, mid), ...leaf(s1, mid)];
    }
    return it.hinge === "left" ? leaf(s0, s1) : leaf(s1, s0);
  }
  return [];
}

/** Centerlines along a wall or island: the distance from its left end to each fixture's center. A shared centerline is listed once. */
export function centerlines(design: DesignData, run: string): number[] {
  const out: number[] = [];
  const pieces = design.items.filter((i) => i.run === run && CENTERLINE_STYLES.has(i.style)).sort((a, b) => a.offset - b.offset);
  for (const it of pieces) {
    const c = it.offset + it.width / 2;
    if (!out.some((x) => Math.abs(x - c) < 0.25)) out.push(c);
  }
  return out.sort((a, b) => a - b);
}

/** The inner string's stops on a wall: the outside of the casing of every door and window, between the corners. */
export function openingStops(openings: Opening[], wall: string, length: number): number[] {
  const stops = new Set<number>([0, length]);
  for (const op of openings.filter((o) => o.wall === wall)) {
    stops.add(Math.max(0, op.offset - CASING));
    stops.add(Math.min(length, op.offset + op.width + CASING));
  }
  return [...stops].sort((a, b) => a - b);
}

/** Order on the plan: clockwise from the top-left corner (the walls in order, each from its left end), then the islands. */
export function planOrder(design: DesignData): (it: { run: string; offset: number }) => number {
  const walls = roomShape(design.room).walls.map((w) => w.id);
  const runs = [...walls, ...design.islands.map((i) => i.id)];
  return (it) => {
    const r = runs.indexOf(it.run);
    return (r < 0 ? runs.length : r) * 100000 + it.offset;
  };
}

/** The most dimension strings any wall needs (overall, plus openings and centerlines where there are some). */
export function planTiers(design: DesignData): number {
  let most = 1;
  for (const w of roomShape(design.room).walls) {
    if (w.open) continue;
    const n = 1 + (openingStops(liveOpenings(design), w.id, w.length).length > 2 ? 1 : 0) + (centerlines(design, w.id).length ? 1 : 0);
    most = Math.max(most, n);
  }
  return most;
}
