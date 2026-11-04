// Moving pieces around the floor.
//
// Every piece belongs to a run: a wall, an island, or a floor run of its own.
// A piece on a wall slides along it. Dragged a foot clear of the wall it gets a
// floor run of its own, so it can stand anywhere in the room and turn to any
// angle. Brought back against a wall it joins that wall again and the floor run
// it came from goes away.

import { angleGap, angleOf, firstFreeOffset, insideRoom, itemPlacement, roomCenter, roomShape, runFrame, runPivot, verticalSpan, wrapAngle, type Vec } from "./geometry";
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

/** Height the wall cabinets run to: the ceiling, less any crown molding sitting on top of them. */
export function cabinetTop(design: DesignData): number {
  return design.room.ceiling - Math.max(0, design.crown ?? 0);
}

/** A wall cabinet is level with the top when its own top is there, give or take a hair. */
export function atTop(design: DesignData, item: PlacedItem, top = cabinetTop(design)): boolean {
  return item.category === "wall" && item.mountHeight > 0 && Math.abs(item.mountHeight + item.height - top) < 0.01;
}

/**
 * Hangs the wall cabinets so their tops are at `to`. With `from` given, only the
 * ones that were level with that height move, so a cabinet hung lower on purpose
 * stays where the designer put it.
 */
export function levelWallCabinets(design: DesignData, to: number, from?: number): DesignData {
  return {
    ...design,
    items: design.items.map((i) => {
      if (i.category !== "wall" || i.mountHeight <= 0) return i;
      if (from !== undefined && Math.abs(i.mountHeight + i.height - from) > 0.01) return i;
      return { ...i, mountHeight: Math.max(0, to - i.height) };
    }),
  };
}

/** Sets the crown height and brings the wall cabinets that were at the old top along with it. */
export function setCrown(design: DesignData, crown: number): DesignData {
  const before = cabinetTop(design);
  const next = { ...design, crown: Math.max(0, crown) };
  return levelWallCabinets(next, cabinetTop(next), before);
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


// ---------- several pieces at once ----------

/**
 * Moves everything selected together, dx and dy inches from where the drag
 * started. An island, or a floor run whose pieces are all selected, moves
 * bodily. Pieces on a wall (or on a run that stays put) slide along it by the
 * part of the move that runs along it, as one block, so they keep their gaps
 * and stop together at the wall ends. Doors and windows slide along their wall
 * the same way. `along` replaces that part, for the front views and the arrows.
 */
export function moveGroup(design: DesignData, ids: Set<string>, dx: number, dy: number, along?: number): DesignData {
  const moving = new Set<string>();
  for (const run of design.islands) {
    const on = design.items.filter((i) => i.run === run.id);
    if (ids.has(run.id) || (on.length > 0 && on.every((i) => ids.has(i.id)))) moving.add(run.id);
  }
  let d = design;
  if (dx || dy) for (const id of moving) {
    const run = d.islands.find((i) => i.id === id);
    if (run) d = moveRun(d, id, run.x + dx, run.y + dy);
  }

  // what slides, grouped by the run it slides along
  const byRun = new Map<string, { items: PlacedItem[]; openings: string[] }>();
  const group = (run: string) => byRun.get(run) ?? byRun.set(run, { items: [], openings: [] }).get(run)!;
  for (const it of design.items) if (ids.has(it.id) && !moving.has(it.run)) group(it.run).items.push(it);
  for (const op of design.openings) if (ids.has(op.id)) group(op.wall).openings.push(op.id);

  for (const [runId, g] of byRun) {
    const frame = runFrame(design, runId);
    if (!frame) continue;
    let delta = along ?? dx * frame.u.x + dy * frame.u.y;
    if (frame.kind === "wall") {
      // the block stops together at the wall ends
      const spans = [
        ...g.items.map((i) => [i.offset, i.offset + i.width]),
        ...design.openings.filter((o) => g.openings.includes(o.id)).map((o) => [o.offset, o.offset + o.width]),
      ];
      const lo = Math.min(...spans.map((s) => s[0]));
      const hi = Math.max(...spans.map((s) => s[1]));
      delta = clamp(delta, -lo, frame.length - hi);
    }
    delta = snap(delta, 0.5);
    if (!delta) continue;
    const itemIds = new Set(g.items.map((i) => i.id));
    d = {
      ...d,
      items: d.items.map((i) => (itemIds.has(i.id) ? { ...i, offset: i.offset + delta } : i)),
      openings: d.openings.map((o) => (g.openings.includes(o.id) ? { ...o, offset: o.offset + delta } : o)),
    };
  }
  return d;
}

/** What Copy keeps: the selected pieces, and the floor runs and islands that go with them. */
export interface Clipboard {
  items: PlacedItem[];
  runs: Island[];
}

/**
 * Copies the selection. A selected island comes with everything on it, and a
 * piece standing on its own floor run comes with that run, so it pastes as a
 * free standing piece again. Each piece keeps its catalog snapshot.
 */
export function copySelection(design: DesignData, ids: Set<string>): Clipboard | null {
  const runs = design.islands.filter((r) => ids.has(r.id) || design.items.some((i) => i.run === r.id && ids.has(i.id) && standsAlone(design, i)));
  const runIds = new Set(runs.map((r) => r.id));
  const items = design.items.filter((i) => ids.has(i.id) || runIds.has(i.run));
  if (!items.length && !runs.length) return null;
  return { items: structuredClone(items), runs: structuredClone(runs) };
}

/**
 * Pastes a copy. Copied floor runs and islands land `shift` inches down and to
 * the right of the original, with their pieces on them. Copied pieces on a wall
 * (or on a run that was not copied) go back on that run as one block, keeping
 * their gaps, at the first spot where the block fits; on Wall A if that run is gone. Returns the design and the ids of the new pieces.
 */
export function pasteClipboard(design: DesignData, clip: Clipboard, shift: number, makeId: () => string): { design: DesignData; ids: string[] } {
  let d = design;
  const ids: string[] = [];
  const newRun = new Map<string, string>();
  for (const r of clip.runs) {
    const id = makeId();
    newRun.set(r.id, id);
    const name = r.auto ? floorRunName(d) : `${r.name} copy`;
    d = { ...d, islands: [...d.islands, { ...r, id, name, x: snap(r.x + shift, 0.5), y: snap(r.y + shift, 0.5) }] };
    if (!r.auto) ids.push(id);
  }
  // pieces on copied runs keep their places on them
  for (const it of clip.items) {
    const run = newRun.get(it.run);
    if (!run) continue;
    const id = makeId();
    d = { ...d, items: [...d.items, { ...structuredClone(it), id, run }] };
    ids.push(id);
  }
  // the rest go back on their run as one block, keeping the gaps between them,
  // at the first spot where the whole block fits
  const blocks = new Map<string, PlacedItem[]>();
  for (const it of clip.items) {
    if (newRun.has(it.run)) continue;
    const run = runFrame(d, it.run) ? it.run : d.room.walls[0].id;
    blocks.set(run, [...(blocks.get(run) ?? []), it]);
  }
  for (const [run, pieces] of blocks) {
    const start = Math.min(...pieces.map((i) => i.offset));
    const width = Math.max(...pieces.map((i) => i.offset + i.width)) - start;
    const spans = pieces.map(verticalSpan);
    const span: [number, number] = [Math.min(...spans.map((v) => v[0])), Math.max(...spans.map((v) => v[1]))];
    const at = firstFreeOffset(d, run, width, span);
    for (const it of pieces) {
      const id = makeId();
      d = { ...d, items: [...d.items, { ...structuredClone(it), id, run, offset: at + it.offset - start }] };
      ids.push(id);
    }
  }
  return { design: d, ids };
}

