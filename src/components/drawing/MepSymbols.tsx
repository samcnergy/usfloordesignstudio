"use client";

// MEP symbols for the plan, after the K&B drawing standards (Chapter 11):
// 6" across on the drawing (1/4" plotted at 1/2" = 1'-0"); wall symbols have a
// tail to the wall, ceiling symbols stand alone, the disposal is a hidden-line
// circle in its cabinet; switching lines are heavy long dash-dot arcs.

import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { MEP_KINDS, mepPoint, type MepItem, type MepKind } from "@/lib/mep";
import { pointsAttr, roomShape, type Vec } from "@/lib/geometry";
import type { DesignData } from "@/lib/types";

const INK = "#000000";
export const MEP_R = 3; // symbol radius: 6" across

const add = (a: Vec, b: Vec, k = 1): Vec => ({ x: a.x + b.x * k, y: a.y + b.y * k });

/**
 * One symbol. `p` is where it meets the wall (or its center when it is not on a wall), `n` points into
 * the room and `u` along the wall. Returns the drawing and where its tag goes.
 */
export function mepGlyph(kind: MepKind, p: Vec, n: Vec, u: Vec, r: number, extra?: { length?: number; tag?: string }): { body: ReactNode; tagAt: Vec } {
  const sw = r * 0.16;
  const c = add(p, n, r * 2.2); // a wall symbol's center
  const line = (a: Vec, b: Vec, k = sw, dash?: string) => <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={INK} strokeWidth={k} strokeDasharray={dash} />;
  const circle = (at: Vec, rr: number, fill = "#FFFFFF", dash?: string) => <circle cx={at.x} cy={at.y} r={rr} fill={fill} stroke={INK} strokeWidth={sw} strokeDasharray={dash} />;
  const text = (at: Vec, s: string, size: number, weight = 600) => (
    <text x={at.x} y={at.y + size * 0.36} fontSize={size} textAnchor="middle" fontWeight={weight} fill={INK}>{s}</text>
  );
  const tagBeside = add(add(c, n, r * 1.25), u, r * 1.35);
  const bars = (offsets: number[]) => offsets.map((k, i) => {
    const along = Math.sqrt(Math.max(0, 1 - k * k)) * r;
    return <g key={i}>{line(add(p, u, k * r), add(add(c, u, k * r), n, along))}</g>;
  });
  switch (kind) {
    case "duplex":
    case "duplex_switched":
      return { body: <g>{circle(c, r)}{bars([-0.45, 0.45])}</g>, tagAt: tagBeside };
    case "r240":
      return { body: <g>{circle(c, r)}{bars([-0.55, 0, 0.55])}</g>, tagAt: tagBeside };
    case "hardwired": {
      const a = add(c, n, -r);
      const rot = (deg: number) => {
        const t = (deg * Math.PI) / 180;
        return { x: n.x * Math.cos(t) - n.y * Math.sin(t), y: n.x * Math.sin(t) + n.y * Math.cos(t) };
      };
      return { body: <g>{line(p, a)}{circle(c, r)}{line(a, c)}{line(c, add(c, rot(55), r))}{line(c, add(c, rot(-55), r))}</g>, tagAt: tagBeside };
    }
    case "junction":
    case "thermostat":
      return { body: <g>{line(p, add(c, n, -r))}{circle(c, r)}{text(c, kind === "junction" ? "J" : "T", r * 1.1)}</g>, tagAt: tagBeside };
    case "sconce":
      return { body: <g>{line(p, add(c, n, -r))}{circle(c, r)}</g>, tagAt: tagBeside };
    case "data": {
      const base = add(p, n, r * 1.7);
      return { body: <polygon points={pointsAttr([p, add(base, u, r * 0.9), add(base, u, -r * 0.9)])} fill="#FFFFFF" stroke={INK} strokeWidth={sw} />, tagAt: add(base, n, r * 0.9) };
    }
    case "switch": {
      const mid = add(p, n, r * 1.25);
      return { body: <g>{line(p, add(p, n, r * 2.5))}{text(mid, "S", r * 2.3, 700)}</g>, tagAt: add(add(p, n, r * 2.6), u, r * 0.9) };
    }
    case "supply_valve": {
      const k = add(p, n, r * 1.6);
      return { body: <g>{line(p, add(p, n, r * 0.9))}{line(add(k, n, -r * 0.7), add(k, n, r * 0.7))}{line(add(k, u, -r * 0.7), add(k, u, r * 0.7))}</g>, tagAt: add(add(k, n, r), u, r * 0.9) };
    }
    case "gas_valve": {
      const k = add(p, n, r * 2);
      const q = [add(add(k, u, -r * 1.3), n, -r * 0.7), add(add(k, u, r * 1.3), n, -r * 0.7), add(add(k, u, r * 1.3), n, r * 0.7), add(add(k, u, -r * 1.3), n, r * 0.7)];
      return { body: <g>{line(p, add(k, n, -r * 0.7))}<polygon points={pointsAttr(q)} fill="#FFFFFF" stroke={INK} strokeWidth={sw} />{text(k, "GAS", r * 0.75, 700)}</g>, tagAt: add(add(k, n, r * 1.3), u, r * 1.6) };
    }
    case "undercabinet": {
      const len = extra?.length ?? 24;
      const a = add(p, n, r * 0.35);
      const q = [a, add(a, u, len), add(add(a, u, len), n, r * 0.7), add(a, n, r * 0.7)];
      return { body: <g><polygon points={pointsAttr(q)} fill="#FFFFFF" stroke={INK} strokeWidth={sw} />{line(q[0], q[2], sw * 0.8)}</g>, tagAt: add(add(a, u, len + r * 1.2), n, r * 0.5) };
    }
    case "recessed": {
      const ticks = [n, u, { x: -n.x, y: -n.y }, { x: -u.x, y: -u.y }].map((d, i) => <g key={i}>{line(add(p, d, r), add(p, d, r * 1.45))}</g>);
      return { body: <g>{circle(p, r)}{ticks}{text(p, extra?.tag ?? "", r * 0.85)}</g>, tagAt: add(add(p, n, r * 1.5), u, r * 1.5) };
    }
    case "pendant":
    case "ceiling_light":
      return { body: <g>{circle(p, r)}{line(add(p, n, -r * 1.45), add(p, n, r * 1.45))}{line(add(p, u, -r * 1.45), add(p, u, r * 1.45))}</g>, tagAt: add(add(p, n, r * 1.5), u, r * 1.7) };
    case "disposal":
      return { body: <g>{circle(p, r * 1.2, "none", `${r * 0.35} ${r * 0.25}`)}{text(p, "G", r * 1.1)}</g>, tagAt: add(p, n, r * 2) };
    case "smoke":
      return { body: <g>{circle(p, r * 1.1)}{text(p, "SD", r * 0.8)}</g>, tagAt: add(p, n, r * 2) };
    case "register": {
      const q = [add(add(p, u, -r * 1.6), n, -r * 0.7), add(add(p, u, r * 1.6), n, -r * 0.7), add(add(p, u, r * 1.6), n, r * 0.7), add(add(p, u, -r * 1.6), n, r * 0.7)];
      return { body: <g><polygon points={pointsAttr(q)} fill="#FFFFFF" stroke={INK} strokeWidth={sw} />{[-0.8, 0, 0.8].map((k, i) => <g key={i}>{line(add(add(p, u, r * k), n, -r * 0.7), add(add(p, u, r * k), n, r * 0.7), sw * 0.7)}</g>)}</g>, tagAt: add(p, n, r * 1.5) };
    }
    case "exhaust": {
      const tip = add(p, n, -r * 4);
      const back = add(tip, n, r * 0.9);
      return {
        body: <g>{line(p, tip, sw * 1.2)}<polygon points={pointsAttr([tip, add(back, u, r * 0.5), add(back, u, -r * 0.5)])} fill={INK} /></g>,
        tagAt: add(add(p, n, r * 1.2), u, 0),
      };
    }
  }
}

/** The direction "into the room" for a piece that is not on a wall: from the nearest wall. */
function nearestWallDirs(design: DesignData, p: Vec): { n: Vec; u: Vec } {
  let best: { n: Vec; u: Vec; d: number } | null = null;
  for (const w of roomShape(design.room).walls) {
    const dx = p.x - w.origin.x, dy = p.y - w.origin.y;
    const s = Math.max(0, Math.min(w.length, dx * w.u.x + dy * w.u.y));
    const q = { x: w.origin.x + w.u.x * s, y: w.origin.y + w.u.y * s };
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (!best || d < best.d) best = { n: w.n, u: w.u, d };
  }
  return best ?? { n: { x: 0, y: 1 }, u: { x: 1, y: 0 } };
}

/** Where a symbol's switching line ends: its center. */
export function mepCenter(design: DesignData, m: MepItem, r = MEP_R): Vec {
  const { p, n } = mepPoint(design, m);
  if (!n) return p;
  if (m.kind === "switch") return add(p, n, r * 1.25);
  if (m.kind === "undercabinet") return add(add(p, n, r * 0.7), { x: 0, y: 0 });
  return add(p, n, r * 2.2);
}

export function MepLayer({ design, items, selectedId, onDown, fs }: {
  design: DesignData; items: MepItem[]; selectedId?: string | null;
  onDown?: (e: ReactPointerEvent<SVGElement>, id: string) => void; fs: number;
}) {
  const r = MEP_R;
  const byId = new Map(items.map((m) => [m.id, m]));
  return (
    <g>
      {/* switching lines first, so the symbols sit on top */}
      {items.filter((m) => m.kind === "switch" && m.controls?.length).map((sw) => {
        const pts: Vec[] = [mepCenter(design, sw)];
        const left = (sw.controls ?? []).map((id) => byId.get(id)).filter((m): m is MepItem => !!m).map((m) => mepCenter(design, m));
        while (left.length) {
          const last = pts[pts.length - 1];
          let k = 0;
          for (let i = 1; i < left.length; i++) if (Math.hypot(left[i].x - last.x, left[i].y - last.y) < Math.hypot(left[k].x - last.x, left[k].y - last.y)) k = i;
          pts.push(left.splice(k, 1)[0]);
        }
        const d = pts.slice(1).map((b, i) => {
          const a = pts[i];
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
          const bow = Math.min(len * 0.22, 24);
          const cx = mx - ((b.y - a.y) / len) * bow, cy = my + ((b.x - a.x) / len) * bow;
          return `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`;
        }).join(" ");
        return <path key={`sl-${sw.id}`} d={d} fill="none" stroke={INK} strokeWidth={r * 0.17} strokeDasharray={`${r * 2.2} ${r * 0.7} ${r * 0.25} ${r * 0.7}`} />;
      })}
      {items.map((m) => {
        const pos = mepPoint(design, m);
        const dirs = pos.n && pos.u ? { n: pos.n, u: pos.u } : nearestWallDirs(design, pos.p);
        const g = mepGlyph(m.kind, pos.p, dirs.n, dirs.u, r, { length: m.length, tag: m.tag });
        const showTag = m.kind !== "recessed" && (m.tag || m.kind === "exhaust");
        const sel = selectedId === m.id;
        return (
          <g key={m.id} onPointerDown={onDown ? (e) => { e.stopPropagation(); onDown(e, m.id); } : undefined} style={{ cursor: onDown ? "grab" : undefined }}>
            {g.body}
            {showTag && (
              <text x={g.tagAt.x} y={g.tagAt.y + fs * 0.3} fontSize={fs * 0.8} textAnchor="middle" fill={INK} stroke="#FFFFFF" strokeWidth={fs * 0.2} paintOrder="stroke">
                {m.kind === "exhaust" ? "EXH" : m.tag}
              </text>
            )}
            {sel && <circle cx={mepCenter(design, m).x} cy={mepCenter(design, m).y} r={r * 2.4} fill="none" stroke="#D03238" strokeWidth={0.8} />}
            {onDown && <circle cx={mepCenter(design, m).x} cy={mepCenter(design, m).y} r={r * 2} fill="transparent" />}
          </g>
        );
      })}
    </g>
  );
}

/** A legend sample: the symbol drawn small, against a short piece of wall when it is wall-mounted. */
export function MepLegendGlyph({ kind, tag }: { kind: MepKind; tag: string }) {
  const wall = MEP_KINDS[kind].mount === "wall";
  const p = kind === "undercabinet" ? { x: 2, y: 12 } : wall ? { x: 2, y: 7 } : { x: 11, y: 7 };
  const g = mepGlyph(kind, p, { x: 1, y: 0 }, { x: 0, y: -1 }, 2.2, { length: 10, tag });
  return (
    <svg width="0.45in" height="0.26in" viewBox="0 0 22 14" aria-hidden="true">
      {wall && <line x1={1.4} x2={1.4} y1={0} y2={14} stroke="#888" strokeWidth={1} />}
      {g.body}
    </svg>
  );
}
