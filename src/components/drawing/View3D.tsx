"use client";

// The kitchen in 3D, as a line drawing like the ones from 2020 Design (owner,
// 2026-11-10: "the US Floor Design Studio needs to produce designs like this").
//
// It is a parallel (axonometric) view: the room is turned about the floor and
// tilted toward the viewer. Every piece is a solid; the solids are drawn from
// the farthest to the nearest, each face white with a dark outline, so nearer
// pieces hide what is behind them. Walls are drawn only where their inside
// faces the viewer, so the room is open toward you, as in a 2020 drawing.
//
// In a parallel view a flat face maps to the screen by an affine transform, so
// the front of every cabinet and appliance is the very drawing the front views
// use (CabinetFront), laid onto its face; burners and sink bowls are drawn on
// the top faces the same way.

import type { ReactNode } from "react";
import type { Catalog, DesignData, PlacedItem } from "@/lib/types";
import { isWall, pointOn, roomShape, runFrame, type RunFrame, type Vec } from "@/lib/geometry";
import { atTop, cabinetTop } from "@/lib/place";
import { CabinetFront } from "./CabinetFront";
import { BASE_TOP, OpeningFront, counterRuns, mergeSpans } from "./ElevationView";
import { PaintDefs, counterPaint, finishPaint } from "./paint";

export interface Camera3D {
  /** Degrees: 0 looks straight at Wall A; positive turns the view to the right. */
  turn: number;
  /** Degrees the view looks down, 5 to 75. */
  tilt: number;
  /** A line drawing (the 2020 look) or the cabinets in their colors. */
  look: "line" | "color";
}

export const DEFAULT_CAMERA: Camera3D = { turn: 35, tilt: 30, look: "line" };

type V3 = { x: number; y: number; z: number };
interface Plane { o: V3; a: V3; b: V3 }
interface Face { pts: V3[]; fill: string; detail?: { plane: Plane; node: ReactNode } }
interface Solid { key: string; faces: Face[]; after?: V3[][]; axes: Vec[] }

const sub = (p: V3, q: V3): V3 => ({ x: p.x - q.x, y: p.y - q.y, z: p.z - q.z });
const cross = (p: V3, q: V3): V3 => ({ x: p.y * q.z - p.z * q.y, y: p.z * q.x - p.x * q.z, z: p.x * q.y - p.y * q.x });
const dot = (p: V3, q: V3) => p.x * q.x + p.y * q.y + p.z * q.z;
const mean = (ps: V3[]): V3 => ({ x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length, z: ps.reduce((s, p) => s + p.z, 0) / ps.length });
const flat = (v: Vec, z = 0): V3 => ({ x: v.x, y: v.y, z });

function camera(c: Camera3D) {
  const a = (c.turn * Math.PI) / 180;
  const t = (Math.max(5, Math.min(75, c.tilt)) * Math.PI) / 180;
  const d = { x: Math.sin(a), y: -Math.cos(a) }; // looking along the floor
  const r = { x: Math.cos(a), y: Math.sin(a) }; // to the right on the screen
  const sp = Math.sin(t);
  const cp = Math.cos(t);
  const forward: V3 = { x: d.x * cp, y: d.y * cp, z: -sp };
  return {
    view: d,
    // linear, so it maps a plane's axes too
    proj: (p: V3) => ({ x: p.x * r.x + p.y * r.y, y: -(p.x * d.x + p.y * d.y) * sp - p.z * cp }),
    depth: (p: V3) => dot(p, forward),
    faces: (n: V3) => dot(n, forward) < 0,
  };
}

/** A box in a run's own terms: s along the run, t into the room, z up. */
function boxFaces(frame: RunFrame, s0: number, s1: number, t0: number, t1: number, z0: number, z1: number, fill: string): Face[] {
  const P = (s: number, t: number, z: number) => flat(pointOn(frame, s, t), z);
  return [
    { pts: [P(s0, t1, z0), P(s1, t1, z0), P(s1, t1, z1), P(s0, t1, z1)], fill }, // front
    { pts: [P(s0, t0, z0), P(s1, t0, z0), P(s1, t0, z1), P(s0, t0, z1)], fill }, // back
    { pts: [P(s0, t0, z0), P(s0, t1, z0), P(s0, t1, z1), P(s0, t0, z1)], fill }, // left end
    { pts: [P(s1, t0, z0), P(s1, t1, z0), P(s1, t1, z1), P(s1, t0, z1)], fill }, // right end
    { pts: [P(s0, t0, z1), P(s1, t0, z1), P(s1, t1, z1), P(s0, t1, z1)], fill }, // top
    { pts: [P(s0, t0, z0), P(s1, t0, z0), P(s1, t1, z0), P(s0, t1, z0)], fill }, // bottom
  ];
}

/** The plane of a run's face at depth t: local x is s along the run, local y is -z (as the front views draw). */
const frontPlane = (frame: RunFrame, t: number): Plane => ({ o: flat(pointOn(frame, 0, t)), a: flat(frame.u), b: { x: 0, y: 0, z: -1 } });
/** A level plane at height z: local x is s along the run, local y is t into the room. */
const topPlane = (frame: RunFrame, z: number): Plane => ({ o: flat(pointOn(frame, 0, 0), z), a: flat(frame.u), b: flat(frame.n) });

const LINE = "#1A1D1F";
const SW = 0.3;

function RangeTop({ it }: { it: PlacedItem }) {
  const cols = it.width >= 42 ? 3 : 2;
  const rows = 2;
  const cw = (it.width - 4) / cols;
  const rh = (it.depth - 6) / rows;
  const els: ReactNode[] = [];
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const cx = it.offset + 2 + cw * (c + 0.5);
      const cy = 4 + rh * (r + 0.5);
      const g = Math.min(cw, rh) * 0.42;
      els.push(<rect key={`g${c}${r}`} x={cx - g} y={cy - g} width={g * 2} height={g * 2} fill="none" stroke={LINE} strokeWidth={0.25} />);
      els.push(<circle key={`b${c}${r}`} cx={cx} cy={cy} r={g * 0.45} fill="none" stroke={LINE} strokeWidth={0.25} />);
      els.push(<line key={`h${c}${r}`} x1={cx - g} x2={cx + g} y1={cy} y2={cy} stroke={LINE} strokeWidth={0.2} />);
      els.push(<line key={`v${c}${r}`} x1={cx} x2={cx} y1={cy - g} y2={cy + g} stroke={LINE} strokeWidth={0.2} />);
    }
  }
  // the back guard
  els.push(<rect key="guard" x={it.offset + 0.5} y={0.5} width={it.width - 1} height={2.5} fill="none" stroke={LINE} strokeWidth={0.25} />);
  return <g>{els}</g>;
}

function SinkTop({ it, depth }: { it: PlacedItem; depth: number }) {
  const s0 = it.offset + 3;
  const s1 = it.offset + it.width - 3;
  const t0 = 4;
  const t1 = Math.max(t0 + 8, depth - 4);
  const two = it.width >= 33;
  const mid = (s0 + s1) / 2;
  return (
    <g fill="none" stroke={LINE} strokeWidth={0.3}>
      <rect x={s0} y={t0} width={s1 - s0} height={t1 - t0} />
      {two ? (
        <>
          <rect x={s0 + 1} y={t0 + 1} width={mid - s0 - 1.5} height={t1 - t0 - 2} />
          <rect x={mid + 0.5} y={t0 + 1} width={s1 - mid - 1.5} height={t1 - t0 - 2} />
          <circle cx={(s0 + mid) / 2} cy={(t0 + t1) / 2 + 2} r={1.2} />
          <circle cx={(mid + s1) / 2} cy={(t0 + t1) / 2 + 2} r={1.2} />
        </>
      ) : (
        <>
          <rect x={s0 + 1} y={t0 + 1} width={s1 - s0 - 2} height={t1 - t0 - 2} />
          <circle cx={mid} cy={(t0 + t1) / 2 + 2} r={1.2} />
        </>
      )}
    </g>
  );
}

/** Everything in the design as solids, in room coordinates (inches). */
function solids(design: DesignData, catalog: Catalog, look: Camera3D["look"], faces: (n: V3) => boolean): { walls: Solid[]; parts: Solid[] } {
  const color = look === "color";
  const room = design.room;
  const shape = roomShape(room);
  const walls: Solid[] = [];
  const parts: Solid[] = [];

  // Walls: only those whose inside faces the viewer, so the room opens toward you.
  for (const w of shape.walls) {
    if (w.open || !faces(flat(w.n))) continue;
    const t = room.wallThickness;
    const f = boxFaces(w, 0, w.length, -t, 0, 0, room.ceiling, color ? "#FBFAF7" : "#FFFFFF");
    const openings = design.openings.filter((o) => o.wall === w.id);
    f[0].detail = { plane: frontPlane(w, 0), node: <g>{openings.map((op) => <OpeningFront key={op.id} op={op} Y={(z) => -z} />)}</g> };
    walls.push({ key: `wall-${w.id}`, axes: [w.u, w.n], faces: f });
  }

  const runIds = new Set(design.items.map((i) => i.run));
  for (const run of runIds) {
    const frame = runFrame(design, run);
    if (!frame) continue;
    const items = design.items.filter((i) => i.run === run);

    for (const it of items) {
      const paint = finishPaint(catalog, design, it);
      const fill = color ? paint.color : "#FFFFFF";
      const z0 = it.mountHeight;
      const s0 = it.offset;
      const s1 = it.offset + it.width;
      if (it.style === "hood") {
        // a canopy that narrows to a chimney, as a hood is
        const canopy = Math.min(10, it.height * 0.45);
        const cw = Math.max(it.width * 0.38, 10);
        const cx = s0 + it.width / 2;
        const P = (s: number, t: number, z: number) => flat(pointOn(frame, s, t), z);
        const zc = z0 + canopy;
        const td = Math.min(it.depth, 20);
        const tc = td * 0.6;
        const a0 = cx - cw / 2 - 1;
        const a1 = cx + cw / 2 + 1;
        const steel = color ? "#C9CCCE" : "#FFFFFF";
        parts.push({
          key: `hood-${it.id}`, axes: [frame.u, frame.n],
          faces: [
            { pts: [P(s0, td, z0), P(s1, td, z0), P(a1, tc, zc), P(a0, tc, zc)], fill: steel },
            { pts: [P(s0, 0, z0), P(s0, td, z0), P(a0, tc, zc), P(a0, 0, zc)], fill: steel },
            { pts: [P(s1, 0, z0), P(a1, 0, zc), P(a1, tc, zc), P(s1, td, z0)], fill: steel },
            { pts: [P(s0, 0, z0), P(s1, 0, z0), P(s1, td, z0), P(s0, td, z0)], fill: steel },
            { pts: [P(a0, 0, zc), P(a1, 0, zc), P(a1, tc, zc), P(a0, tc, zc)], fill: steel },
          ],
        });
        parts.push({ key: `chimney-${it.id}`, axes: [frame.u, frame.n], faces: boxFaces(frame, cx - cw / 2, cx + cw / 2, 0, tc - 1, zc, z0 + it.height, steel) });
        continue;
      }
      const f = boxFaces(frame, s0, s1, 0, it.depth, z0, z0 + it.height, fill);
      f[0].detail = { plane: frontPlane(frame, it.depth), node: <CabinetFront item={it} paint={color ? paint : { ...paint, fill: "#FFFFFF" }} Y={(z) => -z} swing={false} /> };
      if (it.style === "range") f[4].detail = { plane: topPlane(frame, z0 + it.height), node: <RangeTop it={it} /> };
      parts.push({ key: `item-${it.id}`, axes: [frame.u, frame.n], faces: f });
    }

    // Countertops: one slab over each row of base cabinets, an inch past their fronts.
    const top = catalog.countertops.find((c) => c.id === design.countertopId);
    const thick = top?.thickness ?? 1.5;
    const counter = color ? counterPaint(catalog, design).color : "#FFFFFF";
    counterRuns(items).forEach(([a, b], i) => {
      const under = items.filter((it) => it.mountHeight === 0 && it.offset < b && it.offset + it.width > a);
      const depth = Math.max(24, ...under.map((it) => it.depth)) + 1;
      const z = BASE_TOP + thick;
      const f = boxFaces(frame, a, b, 0, depth, BASE_TOP, z, counter);
      const sinks = under.filter((it) => it.style === "sink_base");
      if (sinks.length) f[4].detail = { plane: topPlane(frame, z), node: <g>{sinks.map((s) => <SinkTop key={s.id} it={s} depth={depth} />)}</g> };
      // the faucet behind each sink: up, over and down
      const after = sinks.map((s) => {
        const c = s.offset + s.width / 2;
        return [flat(pointOn(frame, c, 2), z), flat(pointOn(frame, c, 2), z + 13), flat(pointOn(frame, c, 7), z + 13), flat(pointOn(frame, c, 8), z + 9)];
      });
      parts.push({ key: `counter-${run}-${i}`, axes: [frame.u, frame.n], faces: f, after });
    });

    // Crown molding on the wall cabinets that run to the top.
    const crown = Math.max(0, design.crown ?? 0);
    if (crown > 0 && isWall(design.room, run)) {
      const ct = cabinetTop(design);
      const crowned = items.filter((i) => atTop(design, i, ct));
      const fill = color && crowned[0] ? finishPaint(catalog, design, crowned[0]).color : "#FFFFFF";
      mergeSpans(crowned).forEach(([a, b], i) => {
        const depth = Math.max(...crowned.filter((it) => it.offset < b && it.offset + it.width > a).map((it) => it.depth)) + 1.5;
        parts.push({ key: `crown-${run}-${i}`, axes: [frame.u, frame.n], faces: boxFaces(frame, a, b, 0, depth, ct, ct + crown, fill) });
      });
    }
  }
  return { walls, parts };
}

/**
 * The order to draw the pieces in, farthest first. A piece resting on another
 * (a countertop on its cabinets, a crown on the wall cabinets) always comes
 * after it, since the view looks down. Two pieces side by side on the floor
 * are ordered by the line that separates them: the one beyond it is farther.
 * Only pieces that overlap on the screen are compared; the rest keep their
 * order by distance.
 */
function drawOrder(parts: Solid[], c: ReturnType<typeof camera>, view: Vec): Solid[] {
  const info = parts.map((s) => {
    const all = s.faces.flatMap((f) => f.pts);
    const scr = all.map(c.proj);
    return {
      s, all,
      depth: c.depth(mean(all)),
      z0: Math.min(...all.map((p) => p.z)), z1: Math.max(...all.map((p) => p.z)),
      sx0: Math.min(...scr.map((p) => p.x)), sx1: Math.max(...scr.map((p) => p.x)),
      sy0: Math.min(...scr.map((p) => p.y)), sy1: Math.max(...scr.map((p) => p.y)),
    };
  });
  type Info = (typeof info)[number];
  const span = (a: Info, k: Vec): [number, number] => {
    const v = a.all.map((p) => p.x * k.x + p.y * k.y);
    return [Math.min(...v), Math.max(...v)];
  };
  const EPS = 0.05;
  /** -1: a is drawn first; 1: b is drawn first; 0: no rule between them. */
  const rule = (a: Info, b: Info): number => {
    if (a.sx1 <= b.sx0 || b.sx1 <= a.sx0 || a.sy1 <= b.sy0 || b.sy1 <= a.sy0) return 0;
    const axes = [...a.s.axes, ...b.s.axes];
    let separated: number = 0;
    for (const k of axes) {
      const [a0, a1] = span(a, k);
      const [b0, b1] = span(b, k);
      const along = k.x * view.x + k.y * view.y;
      if (Math.abs(along) < 1e-6) continue;
      // b lies beyond a along k: when k points away from the viewer b is farther, so b is drawn first
      if (a1 <= b0 + EPS) separated = along > 0 ? 1 : -1;
      else if (b1 <= a0 + EPS) separated = along > 0 ? -1 : 1;
      if (separated) return separated;
    }
    // over one another: the lower piece first
    if (a.z1 <= b.z0 + EPS) return -1;
    if (b.z1 <= a.z0 + EPS) return 1;
    return 0;
  };
  // Draw the farthest piece that nothing still waiting has to come before.
  const left = [...info].sort((a, b) => b.depth - a.depth);
  const out: Solid[] = [];
  while (left.length) {
    let pick = left.findIndex((a) => !left.some((b) => b !== a && rule(b, a) === -1));
    if (pick < 0) pick = 0; // a loop: fall back to distance
    out.push(left[pick].s);
    left.splice(pick, 1);
  }
  return out;
}

export function View3D({ design, catalog, cam, className }: { design: DesignData; catalog: Catalog; cam: Camera3D; className?: string }) {
  const c = camera(cam);
  const { walls, parts } = solids(design, catalog, cam.look, c.faces);
  const order = [...walls, ...drawOrder(parts, c, c.view)];

  // fit the drawing
  const all = order.flatMap((s) => s.faces.flatMap((f) => f.pts)).map(c.proj);
  if (!all.length) {
    return (
      <svg className={className} viewBox="0 0 100 40" xmlns="http://www.w3.org/2000/svg">
        <text x={50} y={20} fontSize={4} textAnchor="middle" fill="#6A6D70">Add walls or cabinets to see the 3D view.</text>
      </svg>
    );
  }
  const x0 = Math.min(...all.map((p) => p.x));
  const x1 = Math.max(...all.map((p) => p.x));
  const y0 = Math.min(...all.map((p) => p.y));
  const y1 = Math.max(...all.map((p) => p.y));
  const m = Math.max(x1 - x0, y1 - y0) * 0.04;

  const pts = (ps: V3[]) => ps.map(c.proj).map((p) => `${p.x},${p.y}`).join(" ");
  const matrix = (pl: Plane) => {
    const o = c.proj(pl.o);
    const a = c.proj(pl.a);
    const b = c.proj(pl.b);
    return `matrix(${a.x} ${a.y} ${b.x} ${b.y} ${o.x} ${o.y})`;
  };

  return (
    <svg
      className={`${className ?? ""}${cam.look === "line" ? " lineart" : ""}`}
      viewBox={`${x0 - m} ${y0 - m} ${x1 - x0 + 2 * m} ${y1 - y0 + 2 * m}`}
      xmlns="http://www.w3.org/2000/svg"
      fontFamily="'Source Sans 3', Helvetica, Arial, sans-serif"
      strokeLinejoin="round"
    >
      <PaintDefs catalog={catalog} />
      {order.map((s) => (
        <g key={s.key}>
          {s.faces.map((f, i) => {
            const centre = mean(s.faces.flatMap((g) => g.pts));
            const n0 = cross(sub(f.pts[1], f.pts[0]), sub(f.pts[2], f.pts[0]));
            const n = dot(n0, sub(mean(f.pts), centre)) < 0 ? { x: -n0.x, y: -n0.y, z: -n0.z } : n0;
            if (!c.faces(n)) return null;
            return (
              <g key={i}>
                <polygon points={pts(f.pts)} fill={f.fill} stroke={LINE} strokeWidth={SW} />
                {f.detail && <g transform={matrix(f.detail.plane)}>{f.detail.node}</g>}
              </g>
            );
          })}
          {s.after?.map((line, i) => <polyline key={`a${i}`} points={pts(line)} fill="none" stroke={LINE} strokeWidth={0.9} />)}
        </g>
      ))}
    </svg>
  );
}
