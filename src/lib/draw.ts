// Drawing a room with the mouse. The designer clicks the first corner, then
// pulls out each wall: the mouse gives the direction (in 15 degree steps unless
// Shift is held) and the length, or they type the length and the corner angle.
// Clicking the first corner again closes the room, which turns the corner
// points into the usual list of walls.

import type { Vec } from "./geometry";
import type { Room, Wall } from "./types";

export const ANGLE_STEP = 15;

/** Walls shorter than this are treated as a stray click. */
export const MIN_WALL = 1;

function deg(v: Vec): number {
  return (Math.atan2(v.y, v.x) * 180) / Math.PI;
}

/** Angle folded into (-180, 180]. */
function norm(a: number): number {
  const r = ((((a + 180) % 360) + 360) % 360) - 180;
  return r === -180 ? 180 : r;
}

function unit(heading: number): Vec {
  const r = (heading * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  // keep square directions exact so walls drawn at 0 or 90 degrees stay straight
  return { x: Math.abs(c) < 1e-12 ? 0 : c, y: Math.abs(s) < 1e-12 ? 0 : s };
}

function dist(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Drops floating point noise from angles that are really whole hundredths. */
function clean(a: number): number {
  const r = Math.round(a * 100) / 100;
  return Math.abs(a - r) < 1e-6 ? r : a;
}

export interface DrawInput {
  points: Vec[]; // corners placed so far, at least one
  mouse: Vec;
  length: number | null; // typed length, or null to follow the mouse
  angle: number | null; // typed angle, or null to follow the mouse
  free: boolean; // Shift held: any direction
  tol: number; // snapping distance in inches
}

export interface DrawPreview {
  end: Vec;
  length: number;
  heading: number;
  /** Corner with the previous wall (90 square, 135 cut); for the first wall its tilt from level. */
  angle: number;
  closes: boolean; // the end is the first corner, so this wall closes the room
  guide: "x" | "y" | null; // the end lines up with the first corner
}

/** Where the next corner would go for the current mouse position and typed values. */
export function nextPoint({ points, mouse, length, angle, free, tol }: DrawInput): DrawPreview {
  const n = points.length;
  const last = points[n - 1];
  const start = points[0];
  const prev = n >= 2 ? deg({ x: last.x - points[n - 2].x, y: last.y - points[n - 2].y }) : null;
  const v = { x: mouse.x - last.x, y: mouse.y - last.y };
  const mh = Math.hypot(v.x, v.y) > 1e-6 ? deg(v) : (prev ?? 0);
  const angleOf = (h: number) => (prev === null ? (Math.abs(h) <= 90 ? Math.abs(h) : 180 - Math.abs(h)) : 180 - Math.abs(norm(h - prev)));

  if (n >= 3 && length === null && angle === null && dist(mouse, start) <= tol) {
    const h = deg({ x: start.x - last.x, y: start.y - last.y });
    return { end: start, length: dist(start, last), heading: h, angle: angleOf(h), closes: true, guide: null };
  }

  let heading: number;
  if (angle !== null) {
    // the typed angle fixes the turn; the mouse picks which way
    const cands = prev === null ? [angle, -angle, 180 - angle, 180 + angle] : [prev + (180 - angle), prev - (180 - angle)];
    heading = cands.reduce((best, c) => (Math.abs(norm(c - mh)) < Math.abs(norm(best - mh)) ? c : best));
  } else if (free) heading = mh;
  else {
    const base = prev ?? 0;
    heading = base + Math.round(norm(mh - base) / ANGLE_STEP) * ANGLE_STEP;
  }
  heading = clean(norm(heading));
  const d = unit(heading);

  let len: number;
  let guide: DrawPreview["guide"] = null;
  if (length !== null) len = length;
  else {
    const raw = Math.max(0, v.x * d.x + v.y * d.y);
    len = Math.round(raw);
    // stop where the wall lines up with the first corner, so the room closes square
    if (n >= 2) {
      let best = tol;
      for (const axis of ["x", "y"] as const) {
        if (Math.abs(d[axis]) < 1e-6) continue;
        const la = (start[axis] - last[axis]) / d[axis];
        if (la > MIN_WALL && Math.abs(la - raw) <= best) {
          best = Math.abs(la - raw);
          len = la;
          guide = axis;
        }
      }
    }
  }
  const end = { x: last.x + d.x * len, y: last.y + d.y * len };
  const closes = n >= 3 && dist(end, start) < 0.5;
  return { end: closes ? start : end, length: len, heading, angle: clean(angleOf(heading)), closes, guide: closes ? null : guide };
}

/** Signed area, positive when the corners go clockwise in the top view (y down). */
function area(pts: Vec[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/**
 * Turns the drawn corners into walls. Walls always go clockwise; Wall A is the
 * top wall if there is a straight one, otherwise the first wall drawn and the
 * room keeps its angle with `rotation`. Existing wall ids are reused in order
 * so pieces stay on the wall with the same letter.
 */
export function roomFromPoints(points: Vec[], base: Room, newId: () => string): Room {
  const p = area(points) < 0 ? [...points].reverse() : [...points];
  const N = p.length;
  const h = p.map((a, i) => deg({ x: p[(i + 1) % N].x - a.x, y: p[(i + 1) % N].y - a.y }));
  let first = -1;
  for (let i = 0; i < N; i++) {
    if (Math.abs(norm(h[i])) < 0.01 && (first === -1 || p[i].y < p[first].y)) first = i;
  }
  const rotation = first === -1 ? clean(norm(h[0])) : 0;
  if (first === -1) first = 0;
  const walls: Wall[] = [];
  for (let k = 0; k < N; k++) {
    const i = (first + k) % N;
    const j = (i + 1) % N;
    walls.push({
      id: base.walls[k]?.id ?? newId(),
      // exact, so the closing wall stays square; lengths show to the nearest 1/8"
      length: Math.round(dist(p[i], p[j]) * 1e6) / 1e6,
      corner: clean(180 - norm(h[j] - h[i])),
    });
  }
  const room: Room = { walls, ceiling: base.ceiling, wallThickness: base.wallThickness };
  if (rotation) room.rotation = rotation;
  return room;
}
