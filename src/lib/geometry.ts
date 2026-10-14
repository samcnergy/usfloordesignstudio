// Room geometry. Top view coordinates: x to the right, y down, origin at the
// inside corner where wall A meets wall D. Walls are labeled clockwise:
// A = top, B = right, C = bottom, D = left.
//
// Every wall and island is a "run". A run has an origin (its left end as seen
// by someone standing in the room facing it), a unit vector u pointing to the
// right along the run, and a unit vector n pointing from the wall into the
// room (the direction the cabinet fronts face). Cabinets on a run are placed
// by offset along u, so walls and islands share one placement model.

import type { DesignData, Island, Opening, PlacedItem, Room, WallId } from "./types";
import { WALLS } from "./types";

export interface Vec {
  x: number;
  y: number;
}

export interface RunFrame {
  id: string;
  kind: "wall" | "island";
  label: string;
  origin: Vec;
  u: Vec;
  n: Vec;
  length: number;
}

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const ISLAND_MIN_LENGTH = 24;

export function isWall(run: string): run is WallId {
  return (WALLS as string[]).includes(run);
}

export function wallLength(room: Room, wall: WallId): number {
  return wall === "A" || wall === "C" ? room.width : room.depth;
}

export function wallFrame(room: Room, wall: WallId): RunFrame {
  const { width: W, depth: D } = room;
  const base = { id: wall, kind: "wall" as const, label: `Wall ${wall}`, length: wallLength(room, wall) };
  switch (wall) {
    case "A":
      return { ...base, origin: { x: 0, y: 0 }, u: { x: 1, y: 0 }, n: { x: 0, y: 1 } };
    case "B":
      return { ...base, origin: { x: W, y: 0 }, u: { x: 0, y: 1 }, n: { x: -1, y: 0 } };
    case "C":
      return { ...base, origin: { x: W, y: D }, u: { x: -1, y: 0 }, n: { x: 0, y: -1 } };
    case "D":
      return { ...base, origin: { x: 0, y: D }, u: { x: 0, y: -1 }, n: { x: 1, y: 0 } };
  }
}

export function islandUnit(rotation: Island["rotation"]): Vec {
  switch (rotation) {
    case 0:
      return { x: 1, y: 0 };
    case 90:
      return { x: 0, y: 1 };
    case 180:
      return { x: -1, y: 0 };
    case 270:
      return { x: 0, y: -1 };
  }
}

export function islandLength(design: DesignData, islandId: string): number {
  let len = 0;
  for (const it of design.items) if (it.run === islandId) len = Math.max(len, it.offset + it.width);
  return Math.max(len, ISLAND_MIN_LENGTH);
}

export function islandFrame(design: DesignData, island: Island): RunFrame {
  const u = islandUnit(island.rotation);
  return {
    id: island.id,
    kind: "island",
    label: island.name,
    origin: { x: island.x, y: island.y },
    u,
    n: { x: -u.y, y: u.x },
    length: islandLength(design, island.id),
  };
}

export function runFrame(design: DesignData, run: string): RunFrame | null {
  if (isWall(run)) return wallFrame(design.room, run);
  const island = design.islands.find((i) => i.id === run);
  return island ? islandFrame(design, island) : null;
}

export function allFrames(design: DesignData): RunFrame[] {
  return [...WALLS.map((w) => wallFrame(design.room, w)), ...design.islands.map((i) => islandFrame(design, i))];
}

export function pointOn(frame: RunFrame, s: number, t: number): Vec {
  return {
    x: frame.origin.x + frame.u.x * s + frame.n.x * t,
    y: frame.origin.y + frame.u.y * s + frame.n.y * t,
  };
}

/** Axis-aligned rectangle covering s in [s0, s1] along the run and t in [t0, t1] into the room. */
export function runRect(frame: RunFrame, s0: number, s1: number, t0: number, t1: number): Rect {
  const a = pointOn(frame, s0, t0);
  const b = pointOn(frame, s1, t1);
  return { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) };
}

export function itemRect(item: PlacedItem, frame: RunFrame): Rect {
  return runRect(frame, item.offset, item.offset + item.width, 0, item.depth);
}

/** Rectangle of the whole island including any pieces, for drawing its outline. */
export function islandRect(design: DesignData, island: Island): Rect {
  const frame = islandFrame(design, island);
  let depth = 24;
  for (const it of design.items) if (it.run === island.id) depth = Math.max(depth, it.depth);
  return runRect(frame, 0, frame.length, 0, depth);
}

const EPS = 0.01;

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x0 < b.x1 - EPS && b.x0 < a.x1 - EPS && a.y0 < b.y1 - EPS && b.y0 < a.y1 - EPS;
}

function spansOverlap(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 < b1 - EPS && b0 < a1 - EPS;
}

export function verticalSpan(item: PlacedItem): [number, number] {
  return [item.mountHeight, item.mountHeight + item.height];
}

export function openingSpan(op: Opening): [number, number] {
  return op.type === "window" ? [op.sill, op.sill + op.height] : [0, op.height];
}

export interface Problem {
  ids: string[];
  message: string;
}

export function runLabel(design: DesignData, run: string): string {
  if (isWall(run)) return `Wall ${run}`;
  return design.islands.find((i) => i.id === run)?.name ?? "Island";
}

/** Everything that would not build as drawn: overlaps, pieces past a wall end, pieces blocking a door or window. */
export function findProblems(design: DesignData): Problem[] {
  const problems: Problem[] = [];
  const frames = new Map(allFrames(design).map((f) => [f.id, f]));
  const rects = new Map<string, Rect>();
  for (const it of design.items) {
    const f = frames.get(it.run);
    if (f) rects.set(it.id, itemRect(it, f));
  }

  for (const it of design.items) {
    if (isWall(it.run)) {
      const len = wallLength(design.room, it.run);
      if (it.offset < -EPS || it.offset + it.width > len + EPS) {
        problems.push({ ids: [it.id], message: `${itemLabel(it)} runs past the end of Wall ${it.run}` });
      }
    }
    const [, v1] = verticalSpan(it);
    if (v1 > design.room.ceiling + EPS) {
      problems.push({ ids: [it.id], message: `${itemLabel(it)} is taller than the ceiling` });
    }
  }

  const items = design.items;
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      const ra = rects.get(a.id);
      const rb = rects.get(b.id);
      if (!ra || !rb) continue;
      const [a0, a1] = verticalSpan(a);
      const [b0, b1] = verticalSpan(b);
      if (rectsOverlap(ra, rb) && spansOverlap(a0, a1, b0, b1)) {
        problems.push({ ids: [a.id, b.id], message: `${itemLabel(a)} overlaps ${itemLabel(b)}` });
      }
    }
  }

  for (const op of design.openings) {
    const [o0, o1] = openingSpan(op);
    for (const it of items) {
      if (it.run !== op.wall) continue;
      const [v0, v1] = verticalSpan(it);
      if (spansOverlap(it.offset, it.offset + it.width, op.offset, op.offset + op.width) && spansOverlap(v0, v1, o0, o1)) {
        const what = op.type === "window" ? "window" : op.type === "door" ? "door" : "opening";
        problems.push({ ids: [it.id, op.id], message: `${itemLabel(it)} blocks the ${what} on Wall ${op.wall}` });
      }
    }
    if (op.offset < -EPS || op.offset + op.width > wallLength(design.room, op.wall) + EPS) {
      problems.push({ ids: [op.id], message: `A ${op.type} runs past the end of Wall ${op.wall}` });
    }
  }
  return problems;
}

function num(v: number): string {
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100).replace(/^0\./, ".");
}

/** Shop label: the SKU for catalog products (B12, W3036, UT188424); built from the size for older designs. */
export function itemLabel(item: Pick<PlacedItem, "code" | "style" | "category" | "width" | "height"> & { productId?: string }): string {
  if (item.productId) return item.code;
  if (item.style === "panel") return `${item.code}${num(item.height)}`;
  const showHeight = item.category === "wall" || item.category === "tall" || (item.category === "filler" && item.height !== 34.5);
  return `${item.code}${num(item.width)}${showHeight ? num(item.height) : ""}`;
}

/** First offset on the run where a piece of this width fits without hitting anything at the same height. */
export function firstFreeOffset(design: DesignData, run: string, width: number, span: [number, number], ignoreId?: string): number {
  const frame = runFrame(design, run);
  if (!frame) return 0;
  const taken: [number, number][] = [];
  for (const it of design.items) {
    if (it.run !== run || it.id === ignoreId) continue;
    const [v0, v1] = verticalSpan(it);
    if (spansOverlap(v0, v1, span[0], span[1])) taken.push([it.offset, it.offset + it.width]);
  }
  if (isWall(run)) {
    for (const op of design.openings) {
      if (op.wall !== run) continue;
      const [o0, o1] = openingSpan(op);
      if (spansOverlap(o0, o1, span[0], span[1])) taken.push([op.offset, op.offset + op.width]);
    }
  }
  taken.sort((a, b) => a[0] - b[0]);
  let cursor = 0;
  for (const [s0, s1] of taken) {
    if (s0 - cursor >= width - EPS) return cursor;
    cursor = Math.max(cursor, s1);
  }
  return cursor;
}
