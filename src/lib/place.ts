// Moving pieces around the floor.
//
// Every piece belongs to a run: a wall, an island, or a floor run of its own.
// A piece on a wall slides along it. Dragged a foot clear of the wall it gets a
// floor run of its own, so it can stand anywhere in the room and turn to any
// angle. Brought back against a wall it joins that wall again and the floor run
// it came from goes away.

import { angleGap, angleOf, insideRoom, itemPlacement, roomCenter, roomShape, runFrame, runPivot, verticalSpan, wrapAngle, type Vec } from "./geometry";
import type { DesignData, Island, PlacedItem } from "./types";
import { snap } from "./units";

/** How far into the room a piece has to be dragged before it leaves its wall. */
export const LIFT_OFF = 12;
/** How close a piece's back has to come to a wall, on either side of it, to join it again. */
const JOIN_REACH = 10;
/** How far off parallel a piece may be and still join a wall, in degrees. */
const JOIN_ANGLE = 20;
/** How close a piece has to be to a wall end or a neighbor to line up with it. */
const MAGNET = 2;
/** How far a piece is set out from its wall by "Put on the open floor". */
const LIFT_OUT = 30;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export interface Spot {
  x: number;
  y: number;
  angle: number;
}

/** The run a piece stands on when that run is a floor run or island, not a wall. */
export function itemRun(design: DesignData, item: PlacedItem): Island | null {
  return design.islands.find((i) => i.id === item.run) ?? null;
}

/** True when the piece is the only one on its floor run, so moving it moves nothing else. */
export function standsAlone(design: DesignData, item: PlacedItem): boolean {
  const run = itemRun(design, item);
  return !!run && design.items.filter((i) => i.run === run.id).length === 1;
}

function floorRunName(design: DesignData): string {
  const used = new Set(design.islands.map((i) => i.name));
  for (let n = design.islands.filter((i) => i.auto).length + 1; ; n++) {
    const name = `Floor run ${n}`;
    if (!used.has(name)) return name;
  }
}

/** Floor runs made by dragging a piece off a wall go away once nothing is left on them. */
export function dropEmptyRuns(design: DesignData): DesignData {
  const empty = design.islands.filter((i) => i.auto && !design.items.some((it) => it.run === i.id));
  if (!empty.length) return design;
  return { ...design, islands: design.islands.filter((i) => !empty.includes(i)) };
}

/** Puts a piece on a floor run of its own at this spot, so it stands clear of every wall. */
export function putOnFloor(design: DesignData, itemId: string, at: Spot, runId: string): DesignData {
  const run: Island = {
    id: runId,
    name: floorRunName(design),
    x: snap(at.x, 0.5),
    y: snap(at.y, 0.5),
    rotation: wrapAngle(at.angle),
    auto: true,
  };
  return dropEmptyRuns({
    ...design,
    islands: [...design.islands, run],
    items: design.items.map((i) => (i.id === itemId ? { ...i, run: runId, offset: 0 } : i)),
  });
}

/** Where to set a piece down when it is lifted off its wall: out in front of where it stood. */
export function floorSpotFor(design: DesignData, item: PlacedItem): Spot {
  const frame = runFrame(design, item.run);
  const at = itemPlacement(design, item);
  if (!frame || !at) {
    const c = roomCenter(design.room);
    return { x: c.x - item.width / 2, y: c.y - item.depth / 2, angle: 0 };
  }
  const out = { x: at.x + frame.n.x * LIFT_OUT, y: at.y + frame.n.y * LIFT_OUT, angle: at.angle };
  const middle = {
    x: out.x + frame.u.x * (item.width / 2) + frame.n.x * (item.depth / 2),
    y: out.y + frame.u.y * (item.width / 2) + frame.n.y * (item.depth / 2),
  };
  if (insideRoom(design.room, middle)) return out;
  const c = roomCenter(design.room);
  return {
    x: c.x - frame.u.x * (item.width / 2) - frame.n.x * (item.depth / 2),
    y: c.y - frame.u.y * (item.width / 2) - frame.n.y * (item.depth / 2),
    angle: at.angle,
  };
}

/** The wall a piece standing at this spot should join, if it is close to one and square with it. */
export function wallToJoin(design: DesignData, at: Spot, width: number): { wall: string; offset: number } | null {
  let best: { wall: string; offset: number; score: number } | null = null;
  for (const w of roomShape(design.room).walls) {
    if (w.open) continue;
    const off = angleGap(at.angle, angleOf(w.u));
    if (Math.abs(off) > JOIN_ANGLE) continue;
    const vx = at.x - w.origin.x;
    const vy = at.y - w.origin.y;
    const along = vx * w.u.x + vy * w.u.y;
    const into = vx * w.n.x + vy * w.n.y;
    if (Math.abs(into) > JOIN_REACH) continue;
    if (along < -8 || along > w.length - width + 8) continue;
    const score = Math.abs(into) + Math.abs(off) * 0.25;
    if (!best || score < best.score) {
      best = { wall: w.id, offset: clamp(snap(along, 0.5), 0, Math.max(0, w.length - width)), score };
    }
  }
  return best ? { wall: best.wall, offset: best.offset } : null;
}

/** Slides a piece along the run it is on, with a magnet to the wall ends and to its neighbors. */
export function slideAlongRun(design: DesignData, itemId: string, delta: number): DesignData {
  const item = design.items.find((i) => i.id === itemId);
  const frame = item ? runFrame(design, item.run) : null;
  if (!item || !frame) return design;
  let next = snap(item.offset + delta, 0.5);
  const stops = [0];
  if (frame.kind === "wall") stops.push(frame.length - item.width);
  const [m0, m1] = verticalSpan(item);
  for (const o of design.items) {
    if (o.run !== item.run || o.id === item.id) continue;
    const [v0, v1] = verticalSpan(o);
    if (v0 >= m1 || m0 >= v1) continue; // nothing in the way at this height
    stops.push(o.offset + o.width, o.offset - item.width);
  }
  for (const s of stops) if (Math.abs(next - s) < MAGNET) next = s;
  return { ...design, items: design.items.map((i) => (i.id === item.id ? { ...i, offset: next } : i)) };
}

/** Moves a floor run bodily, keeping the pieces on it where they sit along it. */
export function moveRun(design: DesignData, runId: string, x: number, y: number): DesignData {
  return { ...design, islands: design.islands.map((i) => (i.id === runId ? { ...i, x: snap(x, 0.5), y: snap(y, 0.5) } : i)) };
}

/** Turns a run to a new angle. The pieces on it swing around the run's middle, which stays put. */
export function turnRun(design: DesignData, runId: string, angle: number): DesignData {
  const run = design.islands.find((i) => i.id === runId);
  if (!run) return design;
  const pivot = runPivot(design, run);
  const turned: Island = { ...run, rotation: wrapAngle(angle) };
  const after = runPivot(design, turned);
  const moved: Island = { ...turned, x: snap(run.x + pivot.x - after.x, 0.25), y: snap(run.y + pivot.y - after.y, 0.25) };
  return { ...design, islands: design.islands.map((i) => (i.id === runId ? moved : i)) };
}

/**
 * A piece dragged in the top view, dx and dy inches from where the drag started.
 * It slides along its wall until it is pulled clear, then stands free on the
 * floor, and joins a wall again when it is brought back to one.
 */
export function dragInPlan(design: DesignData, itemId: string, dx: number, dy: number, newRunId: string): DesignData {
  const item = design.items.find((i) => i.id === itemId);
  const frame = item ? runFrame(design, item.run) : null;
  const at = item ? itemPlacement(design, item) : null;
  if (!item || !frame || !at) return design;
  const spot: Spot = { x: at.x + dx, y: at.y + dy, angle: at.angle };

  if (!standsAlone(design, item)) {
    const into = dx * frame.n.x + dy * frame.n.y;
    // wall cabinets and hoods hang on the wall, so they only ever slide along it
    if (item.mountHeight > 0 || into <= LIFT_OFF) return slideAlongRun(design, itemId, dx * frame.u.x + dy * frame.u.y);
    return putOnFloor(design, itemId, spot, newRunId);
  }

  const run = itemRun(design, item);
  if (!run) return design;
  const join = wallToJoin(design, spot, item.width);
  if (join) {
    return dropEmptyRuns({
      ...design,
      items: design.items.map((i) => (i.id === itemId ? { ...i, run: join.wall, offset: join.offset } : i)),
    });
  }
  return moveRun(design, run.id, run.x + dx, run.y + dy);
}

/** The point a turn handle drags around: the middle of the run being turned. */
export function turnPivot(design: DesignData, runId: string): Vec | null {
  const run = design.islands.find((i) => i.id === runId);
  return run ? runPivot(design, run) : null;
}

