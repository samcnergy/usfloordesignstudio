// Room geometry. Top view coordinates: x to the right, y down. The room is a
// list of walls walked clockwise, starting with Wall A at the origin heading
// right (or turned by room.rotation). Any number of walls and any corner angle;
// the last wall closes the shape.
//
// Every wall and island is a "run". A run has an origin (its left end as seen
// by someone standing in the room facing it), a unit vector u pointing to the
// right along the run, and a unit vector n pointing from the wall into the
// room (the direction the cabinet fronts face). Cabinets on a run are placed
// by offset along u, so walls and islands share one placement model.

import type { DesignData, Island, Opening, PlacedItem, Room, Wall, WallId } from "./types";

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
  open?: boolean;
}

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface WallGeom extends RunFrame {
  index: number;
  letter: string;
  end: Vec;
  /** Corner angle inside the room at the end of this wall, as drawn. */
  corner: number;
  /** Outside face of the wall: start and end, mitred at the corners. */
  outerStart: Vec;
  outerEnd: Vec;
  /** The closing wall and the corners on either side of it are worked out, not typed. */
  computed: { length: boolean; corner: boolean };
}

export interface RoomShape {
  walls: WallGeom[];
  bounds: Rect; // outside faces of the walls
  inner: Vec[];
  issue: string | null;
}

const ISLAND_MIN_LENGTH = 24;
export const MAX_WALLS = 26;
const EPS = 0.01;

export function wallLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

function rad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function turnBetween(a: Vec, b: Vec): number {
  return (Math.atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y) * 180) / Math.PI;
}

function roundAngle(v: number): number {
  return Math.round(v * 100) / 100;
}

function intersect(p1: Vec, u1: Vec, p2: Vec, u2: Vec): Vec | null {
  const den = u1.x * u2.y - u1.y * u2.x;
  if (Math.abs(den) < 1e-9) return null;
  const a = ((p2.x - p1.x) * u2.y - (p2.y - p1.y) * u2.x) / den;
  return { x: p1.x + u1.x * a, y: p1.y + u1.y * a };
}

function segmentsCross(a0: Vec, a1: Vec, b0: Vec, b1: Vec): boolean {
  const d = (p: Vec, q: Vec, r: Vec) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = d(b0, b1, a0);
  const d2 = d(b0, b1, a1);
  const d3 = d(a0, a1, b0);
  const d4 = d(a0, a1, b1);
  return ((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) && ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS));
}

const shapeCache = new WeakMap<Room, RoomShape>();

/** Walks the walls and works out the closing wall, the corners as drawn, and the outside faces. */
export function roomShape(room: Room): RoomShape {
  const cached = shapeCache.get(room);
  if (cached) return cached;
  const src: Wall[] = room.walls;
  const N = src.length;
  const t = room.wallThickness;
  const starts: Vec[] = [];
  const dirs: Vec[] = [];
  const lengths: number[] = [];
  let p: Vec = { x: 0, y: 0 };
  let heading = room.rotation ?? 0;
  for (let i = 0; i < N - 1; i++) {
    const u = { x: Math.cos(rad(heading)), y: Math.sin(rad(heading)) };
    starts.push(p);
    dirs.push(u);
    lengths.push(Math.max(0, src[i].length));
    p = { x: p.x + u.x * lengths[i], y: p.y + u.y * lengths[i] };
    if (i < N - 2) heading += 180 - src[i].corner;
  }
  // the last wall runs from wherever the others end back to the start of Wall A
  const closing = Math.hypot(p.x, p.y);
  starts.push(p);
  dirs.push(closing > EPS ? { x: -p.x / closing, y: -p.y / closing } : { x: 1, y: 0 });
  lengths.push(closing);

  const corners = src.map((w, i) => {
    if (i < N - 2) return w.corner;
    const next = dirs[(i + 1) % N];
    return roundAngle(180 - turnBetween(dirs[i], next));
  });

  // outside face: each wall's inside line pushed out by the wall thickness, mitred where neighbors meet
  const outer: Vec[] = [];
  for (let i = 0; i < N; i++) {
    const prev = (i + N - 1) % N;
    const ni = { x: -dirs[i].y, y: dirs[i].x };
    const np = { x: -dirs[prev].y, y: dirs[prev].x };
    const a = { x: starts[i].x - ni.x * t, y: starts[i].y - ni.y * t };
    const b = { x: starts[i].x - np.x * t, y: starts[i].y - np.y * t };
    const hit = intersect(b, dirs[prev], a, dirs[i]);
    // very sharp corners would push the mitre far out; square them off instead
    outer.push(hit && Math.hypot(hit.x - starts[i].x, hit.y - starts[i].y) < t * 4 ? hit : a);
  }

  const walls: WallGeom[] = src.map((w, i) => {
    const u = dirs[i];
    const end = { x: starts[i].x + u.x * lengths[i], y: starts[i].y + u.y * lengths[i] };
    const n = { x: -u.y, y: u.x };
    const outerEndRaw = outer[(i + 1) % N];
    return {
      id: w.id,
      kind: "wall",
      label: `Wall ${wallLetter(i)}`,
      letter: wallLetter(i),
      index: i,
      origin: starts[i],
      u,
      n,
      length: lengths[i],
      open: !!w.open,
      end,
      corner: corners[i],
      outerStart: outer[i],
      outerEnd: outerEndRaw,
      computed: { length: i === N - 1, corner: i >= N - 2 },
    };
  });

  let area = 0;
  for (let i = 0; i < N; i++) {
    const a = starts[i];
    const b = starts[(i + 1) % N];
    area += a.x * b.y - b.x * a.y;
  }
  let issue: string | null = null;
  if (closing < 1) issue = `Wall ${wallLetter(N - 1)} has no length. The other walls already close the room.`;
  else if (area <= 0) issue = "The walls wind the wrong way. Check the corner angles: a normal corner is 90°, the inside corner of an L is 270°.";
  else {
    outerLoop: for (let i = 0; i < N; i++) {
      for (let j = i + 2; j < N; j++) {
        if (i === 0 && j === N - 1) continue;
        if (segmentsCross(starts[i], walls[i].end, starts[j], walls[j].end)) {
          issue = `Wall ${wallLetter(i)} crosses Wall ${wallLetter(j)}. Check the lengths and corners.`;
          break outerLoop;
        }
      }
    }
  }

  const xs = outer.map((v) => v.x).concat(starts.map((v) => v.x));
  const ys = outer.map((v) => v.y).concat(starts.map((v) => v.y));
  const shape: RoomShape = {
    walls,
    bounds: { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) },
    inner: starts,
    issue,
  };
  shapeCache.set(room, shape);
  return shape;
}

export function wallGeom(room: Room, wall: WallId): WallGeom | null {
  return roomShape(room).walls.find((w) => w.id === wall) ?? null;
}

export function isWall(room: Room, run: string): boolean {
  return room.walls.some((w) => w.id === run);
}

export function wallLength(room: Room, wall: WallId): number {
  return wallGeom(room, wall)?.length ?? 0;
}

export function wallLabel(room: Room, wall: WallId): string {
  return wallGeom(room, wall)?.label ?? "Wall";
}

export function wallFrame(room: Room, wall: WallId): RunFrame | null {
  return wallGeom(room, wall);
}

/** Middle of the floor, for dropping new islands. */
export function roomCenter(room: Room): Vec {
  const pts = roomShape(room).inner;
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    const c = p.x * q.y - q.x * p.y;
    a += c;
    cx += (p.x + q.x) * c;
    cy += (p.y + q.y) * c;
  }
  if (Math.abs(a) < EPS) return { x: 0, y: 0 };
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

/** Direction a run points, from its angle in degrees clockwise from pointing right. */
export function islandUnit(rotation: number): Vec {
  const r = rad(rotation);
  return { x: Math.cos(r), y: Math.sin(r) };
}

/** Degrees clockwise from pointing right, as stored on a run. */
export function angleOf(u: Vec): number {
  return wrapAngle((Math.atan2(u.y, u.x) * 180) / Math.PI);
}

/** The same angle written between 0 and 360. */
export function wrapAngle(deg: number): number {
  return ((roundAngle(deg) % 360) + 360) % 360;
}

/** How far apart two angles are, between -180 and 180. */
export function angleGap(a: number, b: number): number {
  return ((((a - b) % 360) + 540) % 360) - 180;
}

export function islandLength(design: DesignData, islandId: string): number {
  let len = 0;
  for (const it of design.items) if (it.run === islandId) len = Math.max(len, it.offset + it.width);
  return Math.max(len, ISLAND_MIN_LENGTH);
}

/** How deep a run is: the deepest piece on it, and never less than a counter. */
export function islandDepth(design: DesignData, islandId: string): number {
  let depth = 24;
  for (const it of design.items) if (it.run === islandId) depth = Math.max(depth, it.depth);
  return depth;
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
  if (isWall(design.room, run)) return wallFrame(design.room, run);
  const island = design.islands.find((i) => i.id === run);
  return island ? islandFrame(design, island) : null;
}

export function allFrames(design: DesignData): RunFrame[] {
  return [...roomShape(design.room).walls, ...design.islands.map((i) => islandFrame(design, i))];
}

export function pointOn(frame: RunFrame, s: number, t: number): Vec {
  return {
    x: frame.origin.x + frame.u.x * s + frame.n.x * t,
    y: frame.origin.y + frame.u.y * s + frame.n.y * t,
  };
}

/** Corner points of the area covering s in [s0, s1] along the run and t in [t0, t1] into the room. */
export function runQuad(frame: RunFrame, s0: number, s1: number, t0: number, t1: number): Vec[] {
  return [pointOn(frame, s0, t0), pointOn(frame, s1, t0), pointOn(frame, s1, t1), pointOn(frame, s0, t1)];
}

export function itemQuad(item: PlacedItem, frame: RunFrame): Vec[] {
  return runQuad(frame, item.offset, item.offset + item.width, 0, item.depth);
}

export function pointsAttr(pts: Vec[]): string {
  return pts.map((p) => `${p.x},${p.y}`).join(" ");
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
  return runRect(frame, 0, frame.length, 0, islandDepth(design, island.id));
}

/** Middle of a run's floor area. A run turns around this point, so it stays put. */
export function runPivot(design: DesignData, island: Island): Vec {
  const frame = islandFrame(design, island);
  return pointOn(frame, frame.length / 2, islandDepth(design, island.id) / 2);
}

/** Where a piece stands in room coordinates: the left end of its back line, and the angle it runs at. */
export function itemPlacement(design: DesignData, item: PlacedItem): { x: number; y: number; angle: number } | null {
  const frame = runFrame(design, item.run);
  if (!frame) return null;
  const p = pointOn(frame, item.offset, 0);
  return { x: p.x, y: p.y, angle: angleOf(frame.u) };
}

/** The piece's own middle on the floor, for turning it or reading its position. */
export function itemCenter(design: DesignData, item: PlacedItem): Vec | null {
  const frame = runFrame(design, item.run);
  return frame ? pointOn(frame, item.offset + item.width / 2, item.depth / 2) : null;
}

/** Inside the room, measured to the inside faces of the walls. */
export function insideRoom(room: Room, p: Vec): boolean {
  const pts = roomShape(room).inner;
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Convex outlines overlap by more than a hair (separating axis test). */
function quadsOverlap(a: Vec[], b: Vec[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const len = Math.hypot(q.x - p.x, q.y - p.y);
      if (len < 1e-9) continue;
      const ax = -(q.y - p.y) / len;
      const ay = (q.x - p.x) / len;
      let aMin = Infinity;
      let aMax = -Infinity;
      let bMin = Infinity;
      let bMax = -Infinity;
      for (const v of a) {
        const d = v.x * ax + v.y * ay;
        aMin = Math.min(aMin, d);
        aMax = Math.max(aMax, d);
      }
      for (const v of b) {
        const d = v.x * ax + v.y * ay;
        bMin = Math.min(bMin, d);
        bMax = Math.max(bMax, d);
      }
      if (aMax <= bMin + EPS || bMax <= aMin + EPS) return false;
    }
  }
  return true;
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
  if (isWall(design.room, run)) return wallLabel(design.room, run);
  return design.islands.find((i) => i.id === run)?.name ?? "Island";
}

/** Everything that would not build as drawn: overlaps, pieces past a wall end, pieces blocking a door or window. */
export function findProblems(design: DesignData): Problem[] {
  const problems: Problem[] = [];
  const frames = new Map(allFrames(design).map((f) => [f.id, f]));
  const quads = new Map<string, Vec[]>();
  for (const it of design.items) {
    const f = frames.get(it.run);
    if (f) quads.set(it.id, itemQuad(it, f));
  }

  for (const it of design.items) {
    const f = frames.get(it.run);
    if (f?.kind === "wall") {
      if (it.offset < -EPS || it.offset + it.width > f.length + EPS) {
        problems.push({ ids: [it.id], message: `${itemLabel(it)} runs past the end of ${f.label}` });
      }
      if (f.open && it.mountHeight > 0) {
        problems.push({ ids: [it.id], message: `${itemLabel(it)} hangs on ${f.label}, which is open` });
      }
    }
    const [, v1] = verticalSpan(it);
    if (v1 > design.room.ceiling + EPS) {
      problems.push({ ids: [it.id], message: `${itemLabel(it)} is taller than the ceiling` });
    }
    if (f?.kind === "island") {
      const middle = itemCenter(design, it);
      if (middle && !insideRoom(design.room, middle)) {
        problems.push({ ids: [it.id], message: `${itemLabel(it)} stands outside the room` });
      }
    }
  }

  const items = design.items;
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      const qa = quads.get(a.id);
      const qb = quads.get(b.id);
      if (!qa || !qb) continue;
      const [a0, a1] = verticalSpan(a);
      const [b0, b1] = verticalSpan(b);
      if (spansOverlap(a0, a1, b0, b1) && quadsOverlap(qa, qb)) {
        problems.push({ ids: [a.id, b.id], message: `${itemLabel(a)} overlaps ${itemLabel(b)}` });
      }
    }
  }

  for (const op of design.openings) {
    const f = frames.get(op.wall);
    if (!f) {
      problems.push({ ids: [op.id], message: `A ${op.type} is on a wall that was removed` });
      continue;
    }
    const [o0, o1] = openingSpan(op);
    for (const it of items) {
      if (it.run !== op.wall) continue;
      const [v0, v1] = verticalSpan(it);
      if (spansOverlap(it.offset, it.offset + it.width, op.offset, op.offset + op.width) && spansOverlap(v0, v1, o0, o1)) {
        const what = op.type === "window" ? "window" : op.type === "door" ? "door" : "opening";
        problems.push({ ids: [it.id, op.id], message: `${itemLabel(it)} blocks the ${what} on ${f.label}` });
      }
    }
    if (op.offset < -EPS || op.offset + op.width > f.length + EPS) {
      problems.push({ ids: [op.id], message: `A ${op.type} runs past the end of ${f.label}` });
    }
    if (f.open) problems.push({ ids: [op.id], message: `A ${op.type} is on ${f.label}, which is open` });
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
  if (isWall(design.room, run)) {
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
