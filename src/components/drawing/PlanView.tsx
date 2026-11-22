"use client";

// Top view of the room: walls, doors, windows, islands and every placed piece.
// On screen, wall-hung pieces are drawn dashed over the floor pieces, which is
// easiest to work with. The printed plan follows the K&B drawing standards
// (src/lib/plan.ts): cut at the ceiling, base cabinets hidden under an object
// line countertop, wall and tall cabinets solid, appliance doors open, and
// three dimension strings with centerlines.

import type { PointerEvent as ReactPointerEvent } from "react";
import type { DesignData, Island, Opening, PlacedItem } from "@/lib/types";
import { allFrames, insideRoom, islandDepth, islandFrame, islandRect, itemCenter, itemLabel, itemRect, itemQuad, pointOn, pointsAttr, roomShape, runQuad, type RunFrame, type Vec } from "@/lib/geometry";
import { fmtFtIn, fmtIn } from "@/lib/units";
import { DimAligned, DimChain } from "./dims";
import { MepLayer } from "./MepSymbols";
import { BacksplashTags, FinishCross, FloorPattern } from "./FinishSymbols";
import type { FinishData, FinishUse } from "@/lib/finishes";
import { MEP_KINDS, type MepItem } from "@/lib/mep";
import { BASE_TOP, COUNTER_STYLES, CENTERLINE_STYLES, DROP_DOOR, applianceDoors, centerlines, counterOutlines, openingStops, planLine, planTiers } from "@/lib/plan";
import type { DrawTarget, ViewProps } from "./ElevationView";
import { PROBLEM, PaintDefs, SELECT, finishPaint, monoPaint } from "./paint";

function OpeningPlan({ op, frame, t }: { op: Opening; frame: RunFrame; t: number }) {
  const s0 = op.offset;
  const s1 = op.offset + op.width;
  const cut = pointsAttr(runQuad(frame, s0, s1, -t, 0));
  const elems = [<polygon key="cut" points={cut} fill="#FFFFFF" />];
  if (op.type === "window") {
    const a = pointOn(frame, s0, -t / 2);
    const b = pointOn(frame, s1, -t / 2);
    elems.push(
      <polygon key="frame" points={cut} fill="none" stroke="#3A3D40" strokeWidth={0.35} />,
      <line key="glass" x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#3A3D40" strokeWidth={0.35} />,
    );
  } else if (op.type === "door") {
    const hingeS = op.hinge === "left" ? s0 : s1;
    const otherS = op.hinge === "left" ? s1 : s0;
    const p = pointOn(frame, hingeS, 0);
    const leaf = pointOn(frame, hingeS, op.width);
    const jamb = pointOn(frame, otherS, 0);
    const ax = leaf.x - p.x;
    const ay = leaf.y - p.y;
    const bx = jamb.x - p.x;
    const by = jamb.y - p.y;
    const sweep = ax * by - ay * bx > 0 ? 1 : 0;
    elems.push(
      <line key="leaf" x1={p.x} y1={p.y} x2={leaf.x} y2={leaf.y} stroke="#1A1D1F" strokeWidth={0.6} />,
      <path key="arc" d={`M ${leaf.x} ${leaf.y} A ${op.width} ${op.width} 0 0 ${sweep} ${jamb.x} ${jamb.y}`} fill="none" stroke="#1A1D1F" strokeWidth={0.3} strokeDasharray="1.5 1" />,
    );
  }
  return <g>{elems}</g>;
}

/** Grip behind a free standing run: drag it to turn the run to any angle. */
function TurnHandle({ design, run, fs, onDown, live }: { design: DesignData; run: Island; fs: number; onDown: (e: ReactPointerEvent<SVGElement>) => void; live: boolean }) {
  const frame = islandFrame(design, run);
  const depth = islandDepth(design, run.id);
  const from = pointOn(frame, frame.length / 2, depth / 2);
  const grip = pointOn(frame, frame.length / 2, -(depth / 2 + fs * 2.6));
  return (
    <g onPointerDown={onDown} style={{ cursor: live ? "grab" : undefined }}>
      <line x1={from.x} y1={from.y} x2={grip.x} y2={grip.y} stroke={SELECT} strokeWidth={0.4} strokeDasharray="1.5 1" />
      <circle cx={grip.x} cy={grip.y} r={fs * 1.15} fill="#FFFFFF" stroke={SELECT} strokeWidth={0.7} />
      <text x={grip.x} y={grip.y + fs * 0.42} fontSize={fs * 1.2} textAnchor="middle" fill={SELECT} style={{ pointerEvents: "none" }}>
        {"↻"}
      </text>
    </g>
  );
}

/** Counter spans along a wall, merged: where each work surface starts and stops. */
function counterSpans(design: DesignData, run: string): [number, number][] {
  const s = design.items.filter((i) => i.run === run && i.mountHeight === 0 && COUNTER_STYLES.has(i.style) && Math.abs(i.height - BASE_TOP) < 0.01)
    .map((i) => [i.offset, i.offset + i.width] as [number, number]).sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const x of s) {
    const last = out[out.length - 1];
    if (last && x[0] <= last[1] + 0.1) last[1] = Math.max(last[1], x[1]);
    else out.push([...x]);
  }
  return out;
}

/** The walls that carry the light positions on the MEP plan: the top one and the left one. */
function lightWalls(design: DesignData): string[] {
  const walls = roomShape(design.room).walls.filter((w) => !w.open);
  const top = walls.filter((w) => w.u.x > 0.9).sort((a, b) => a.origin.y - b.origin.y)[0];
  const left = walls.filter((w) => w.u.y < -0.9).sort((a, b) => a.origin.x - b.origin.x)[0];
  return [top?.id, left?.id].filter((x): x is string => !!x);
}

/** Where each ceiling light falls along a wall, for its dimension string (only on the top and left walls). */
export function mepLightStops(design: DesignData, items: MepItem[], w: RunFrame): number[] {
  if (!lightWalls(design).includes(w.id)) return [];
  const out = new Set<number>();
  for (const m of items) {
    if (MEP_KINDS[m.kind].group !== "lighting" || MEP_KINDS[m.kind].mount !== "ceiling") continue;
    const s = (m.x - w.origin.x) * w.u.x + (m.y - w.origin.y) * w.u.y;
    if (s > 0.5 && s < w.length - 0.5) out.add(Math.round(s * 2) / 2);
  }
  return [...out].sort((a, b) => a - b);
}

function mepTiers(design: DesignData, items: MepItem[]): number {
  let most = 1;
  for (const w of roomShape(design.room).walls) {
    if (w.open) continue;
    most = Math.max(most, 1 + (centerlines(design, w.id).length ? 1 : 0) + (mepLightStops(design, items, w).length ? 1 : 0));
  }
  return most;
}

/** The top view's drawing frame in real inches, with room around the walls for dimensions and tags. */
export function planBox(design: DesignData, fs?: number, tiers?: number): { x: number; y: number; width: number; height: number; fs: number } {
  const B = roomShape(design.room).bounds;
  const f = fs ?? Math.max(3, Math.min(6, Math.max(B.x1 - B.x0, B.y1 - B.y0) / 38));
  // the printed plan keeps room for three dimension strings and the centerline symbols outside the walls
  const M = fs === undefined ? f * 6 : (design.room.wallThickness ?? 4.5) + f * (1.4 * (tiers ?? planTiers(design)) + 1.4);
  return { x: B.x0 - M, y: B.y0 - M, width: B.x1 - B.x0 + 2 * M, height: B.y1 - B.y0 + 2 * M, fs: f };
}

/** Elevation markers for the printed plan: which wall each looks at and its number (north wall first, clockwise). */
export type ElevationMark = { wallId: string; n: number };

export function PlanView({ design, catalog, selectedId, selectedIds, problemIds, onTargetDown, onBackgroundDown, className, selectedRun, box, print, marks, room, mep, finish }: ViewProps & {
  selectedRun?: string | null; box?: { x0: number; y0: number; x1: number; y1: number } | null;
  /** On the printed plan: the elevation markers and the room's name and ceiling height. */
  marks?: ElevationMark[]; room?: { name: string; ceiling: string };
  /**
   * The electrical, lighting and plumbing plan: walls in outline, cabinets in light gray behind the
   * symbols (K&B drawing standards, Chapter 11). With `onDown`, the symbols can be picked and dragged.
   */
  mep?: { items: MepItem[]; selectedId?: string | null; onDown?: (e: ReactPointerEvent<SVGElement>, id: string) => void };
  /** The finish plan: no codes or fixture dimensions, the floor pattern, the finish symbol and the countertop extents. */
  finish?: { data: FinishData; keys: Partial<Record<FinishUse, string>>; counterThick: number };
}) {
  const isSelected = (id: string) => (selectedIds ? selectedIds.has(id) : selectedId === id);
  const t = design.room.wallThickness;
  const shape = roomShape(design.room);
  const frameBox = planBox(design, print ? print.scale * 0.12 : undefined, print && mep ? mepTiers(design, mep.items) : print && finish ? 1 : undefined);
  const fs = frameBox.fs;
  const mono = !!print;
  const frames = new Map(allFrames(design).map((f) => [f.id, f]));

  const down = (target: DrawTarget) => (e: ReactPointerEvent<SVGElement>) => {
    if (!onTargetDown) return;
    e.stopPropagation();
    onTargetDown(e, target);
  };

  const lower = design.items.filter((i) => i.mountHeight === 0);
  const upper = design.items.filter((i) => i.mountHeight > 0);

  // the selected island, or the floor run the selected piece stands on, gets a turn handle
  const selectedItemRun = design.items.find((i) => i.id === selectedId)?.run;
  const turnRun = onTargetDown && (selectedIds?.size ?? 1) <= 1 ? (design.islands.find((i) => i.id === selectedId || i.id === selectedItemRun) ?? null) : null;

  /** One piece: its outline and its code, or (on the printed plan, where codes go on top of everything) just one of them. */
  const drawItem = (it: PlacedItem, isUpper: boolean, part: "all" | "shape" | "label" = "all") => {
    const frame = frames.get(it.run);
    if (!frame) return null;
    const quad = itemQuad(it, frame);
    const paint = mono ? monoPaint(finishPaint(catalog, design, it)) : finishPaint(catalog, design, it);
    const hidden = mono && planLine(design, it) === "hidden";
    const selected = isSelected(it.id);
    const problem = problemIds?.has(it.id);
    const f0 = pointOn(frame, it.offset, it.depth);
    const f1 = pointOn(frame, it.offset + it.width, it.depth);
    // on the printed plan, a label under a hood or cabinet moves in front of it
    const cover = mono && planLine(design, it) === "hidden"
      ? Math.max(0, ...design.items.filter((o) => o.run === it.run && o.mountHeight > 0 && o.offset < it.offset + it.width - 0.01 && it.offset < o.offset + o.width - 0.01).map((o) => o.depth))
      : 0;
    const labelPoint = pointOn(frame, it.offset + it.width / 2, isUpper ? Math.min(it.depth * 0.38, 5) : cover > 0 ? Math.max(cover + (it.depth - cover) / 2, it.depth * 0.66) : it.depth * 0.66);
    const label = itemLabel(it);
    const span = Math.min(it.width, it.depth);
    const lfs = Math.min(fs * 0.85, Math.max(span / Math.max(label.length * 0.62, 1), fs * 0.45));
    const text = (
      <text
        key={`label-${it.id}`}
        x={labelPoint.x}
        y={labelPoint.y + lfs * 0.35}
        fontSize={lfs}
        textAnchor="middle"
        fill={mono ? "#1A1D1F" : paint.ink}
        fontWeight={600}
        stroke={mono ? "#FFFFFF" : undefined}
        strokeWidth={mono ? lfs * 0.25 : undefined}
        paintOrder="stroke"
        style={{ pointerEvents: "none" }}
      >
        {label}
      </text>
    );
    if (part === "label") return text;
    return (
      <g key={it.id} onPointerDown={down({ kind: "item", id: it.id })} style={{ cursor: onTargetDown ? "grab" : undefined }}>
        <polygon
          points={pointsAttr(quad)}
          fill={mono ? (hidden ? "none" : "#FFFFFF") : paint.fill}
          fillOpacity={mono ? 1 : isUpper ? 0.55 : 1}
          stroke={problem ? PROBLEM : "#1A1D1F"}
          strokeWidth={problem ? 0.7 : mono ? (hidden ? 0.3 : 0.45) : 0.35}
          strokeDasharray={mono ? (hidden ? `${fs * 0.5} ${fs * 0.3}` : undefined) : isUpper ? "1.6 1" : undefined}
        />
        {!isUpper && !mono && <line x1={f0.x} y1={f0.y} x2={f1.x} y2={f1.y} stroke="#1A1D1F" strokeWidth={0.8} />}
        {selected && <polygon points={pointsAttr(runQuad(frame, it.offset - 0.6, it.offset + it.width + 0.6, -0.6, it.depth + 0.6))} fill="none" stroke={SELECT} strokeWidth={1.1} />}
        {part === "all" ? text : null}
      </g>
    );
  };

  const floor = pointsAttr(shape.inner);
  const wallColor = (id: string) => (selectedRun === id ? "#5A4A1E" : "#33363A");
  /**
   * Where each elevation marker sits: inside the room, just past the base cabinets along the middle of its
   * wall; a marker that would touch one placed before it slides along its wall until it is clear.
   */
  const markerCenters = new Map<string, { x: number; y: number }>();
  // the island location strings (drawn below), which the markers keep clear of
  const minX = Math.min(...shape.inner.map((p) => p.x));
  const minY = Math.min(...shape.inner.map((p) => p.y));
  const dimIslands = print ? design.islands.filter((isl) => design.items.some((i) => i.run === isl.id) && Math.abs(((isl.rotation % 90) + 90) % 90) < 0.01) : [];
  const islandDims: [Vec, Vec][] = dimIslands.flatMap((isl) => {
    const r = islandRect(design, isl);
    const y = r.y0 - fs * 1.6;
    const x = r.x0 - fs * 1.6;
    return [[{ x: minX, y }, { x: r.x1, y }], [{ x, y: minY }, { x, y: r.y0 }]] as [Vec, Vec][];
  });
  const segDist = (p: Vec, [a, b]: [Vec, Vec]) => {
    const dx = b.x - a.x, dy = b.y - a.y;
    const k = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / Math.max(1e-9, dx * dx + dy * dy)));
    return Math.hypot(p.x - (a.x + dx * k), p.y - (a.y + dy * k));
  };
  if (print) {
    const r = print.scale * 0.3125;
    for (const m of marks ?? []) {
      const w = shape.walls.find((x) => x.id === m.wallId);
      if (!w) continue;
      // how far into the room things reach at a spot: cabinets, open appliance doors, a door swing
      const reachAt = (s: number) => {
        let d = 0;
        for (const i of design.items) {
          if (i.run !== w.id || i.mountHeight > 0 || i.offset > s + r * 1.2 || i.offset + i.width < s - r * 1.2) continue;
          d = Math.max(d, i.depth + (i.style === "dishwasher" ? DROP_DOOR.dishwasher : i.style === "range" ? DROP_DOOR.range : i.style === "refrigerator" ? (i.width >= 33 ? i.width / 2 : i.width) : 0));
        }
        for (const op of design.openings) {
          if (op.wall === w.id && op.type === "door" && op.offset < s + r * 1.2 && op.offset + op.width > s - r * 1.2) d = Math.max(d, op.width);
        }
        return d;
      };
      const at = (s: number) => pointOn(w, s, reachAt(s) + r * 1.6);
      const clear = (p: { x: number; y: number }) =>
        [...markerCenters.values()].every((c) => Math.hypot(c.x - p.x, c.y - p.y) >= r * 2.4) && islandDims.every((seg) => segDist(p, seg) >= r * 1.4);
      let best: { x: number; y: number } | null = null;
      let bestScore = Infinity;
      for (let s0 = r * 1.5; s0 <= w.length - r * 1.5; s0 += r * 0.5) {
        const p = at(s0);
        if (!clear(p)) continue;
        const score = reachAt(s0) + Math.abs(s0 - w.length / 2) * 0.15;
        if (score < bestScore) { best = p; bestScore = score; }
      }
      markerCenters.set(w.id, best ?? at(w.length / 2));
    }
  }
  const markerCenter = (wallId: string) => markerCenters.get(wallId) ?? null;

  return (
    <svg
      className={className}
      viewBox={`${frameBox.x} ${frameBox.y} ${frameBox.width} ${frameBox.height}`}
      xmlns="http://www.w3.org/2000/svg"
      fontFamily="'Source Sans 3', Helvetica, Arial, sans-serif"
      onPointerDown={(e) => onBackgroundDown?.(e)}
      style={print
        ? { width: `${frameBox.width / print.scale}in`, height: `${frameBox.height / print.scale}in`, display: "block" }
        : { touchAction: "none", userSelect: "none" }}
    >
      <PaintDefs catalog={catalog} />
      <defs>
        <pattern id="floorgrid" patternUnits="userSpaceOnUse" width={12} height={12}>
          <path d="M 12 0 L 0 0 0 12" fill="none" stroke="#E4E2DC" strokeWidth={0.2} />
        </pattern>
      </defs>
      <polygon points={floor} fill="#FFFFFF" />
      {mono ? null : <polygon points={floor} fill="url(#floorgrid)" />}
      {finish?.data.uses.floor?.size && (
        <>
          <defs><clipPath id="finish-floor-clip"><polygon points={floor} /></clipPath></defs>
          <FloorPattern design={design} size={finish.data.uses.floor.size} clipId="finish-floor-clip"
            kind={["wood", "vinyl", "laminate"].includes(finish.data.uses.floor.material) ? "plank" : "grid"} />
        </>
      )}

      {shape.walls.map((w) => {
        const band = pointsAttr([w.origin, w.end, w.outerEnd, w.outerStart]);
        return (
          <g key={w.id} onPointerDown={down({ kind: "wall", id: w.id })} style={{ cursor: onTargetDown ? "pointer" : undefined }}>
            {w.open ? (
              <>
                <polygon points={band} fill="transparent" />
                <line x1={w.origin.x} y1={w.origin.y} x2={w.end.x} y2={w.end.y} stroke={wallColor(w.id)} strokeWidth={0.5} strokeDasharray="3 2" />
              </>
            ) : (
              print && (mep || finish)
                ? <polygon points={band} fill="#FFFFFF" stroke="#000000" strokeWidth={0.45} strokeLinejoin="miter" />
                : <polygon points={band} fill={wallColor(w.id)} stroke={wallColor(w.id)} strokeWidth={0.15} strokeLinejoin="round" />
            )}
          </g>
        );
      })}

      {design.openings.map((op) => {
        const frame = frames.get(op.wall);
        if (!frame) return null;
        const selected = isSelected(op.id);
        const problem = problemIds?.has(op.id);
        const hit = pointsAttr(runQuad(frame, op.offset, op.offset + op.width, -t, Math.min(op.width, 12)));
        return (
          <g key={op.id} onPointerDown={down({ kind: "opening", id: op.id })} style={{ cursor: onTargetDown ? "grab" : undefined }}>
            <polygon points={hit} fill="transparent" />
            <OpeningPlan op={op} frame={frame} t={t} />
            {(selected || problem) && (
              <polygon points={pointsAttr(runQuad(frame, op.offset, op.offset + op.width, -t - 0.6, 0.6))} fill="none" stroke={selected ? SELECT : PROBLEM} strokeWidth={1.1} />
            )}
          </g>
        );
      })}

      {design.islands.map((isl) => {
        const on = design.items.filter((i) => i.run === isl.id);
        // a single piece standing on its own floor run needs no box around it; the printed plan shows only the cabinets and top
        if (print || (isl.auto && on.length <= 1)) return null;
        const r = islandRect(design, isl);
        const frame = islandFrame(design, isl);
        const back = pointOn(frame, frame.length / 2, -fs * 0.9);
        const selected = isSelected(isl.id);
        return (
          <g key={isl.id} onPointerDown={down({ kind: "island", id: isl.id })} style={{ cursor: onTargetDown ? "move" : undefined }}>
            <rect x={r.x0 - 1.5} y={r.y0 - 1.5} width={r.x1 - r.x0 + 3} height={r.y1 - r.y0 + 3} fill="#F4F3EF" stroke={selected || selectedRun === isl.id ? SELECT : "#8A8D90"} strokeWidth={selected ? 1.1 : 0.4} strokeDasharray="2 1.2" />
            {/* the name tag is the handle for moving the island */}
            <text x={back.x} y={back.y + fs * 0.3} fontSize={fs * 0.75} textAnchor="middle" fill={selected ? "#1A1D1F" : "#6D7276"} fontWeight={600}>
              {"\u2725 "}
              {isl.name}
            </text>
          </g>
        );
      })}

      {finish ? (
        <g style={{ pointerEvents: "none" }}>
          {/* cabinets and appliances light, the work surfaces in a medium line */}
          {design.items.map((it) => {
            const frame = frames.get(it.run);
            if (!frame) return null;
            return <polygon key={it.id} points={pointsAttr(itemQuad(it, frame))} fill="#FFFFFF" stroke="#8A8D90" strokeWidth={0.22} />;
          })}
          {counterOutlines(design, frames).map((q, i) => (
            <polygon key={`ctr-${i}`} points={pointsAttr(q)} fill="#FFFFFF" stroke="#000000" strokeWidth={0.4} />
          ))}
        </g>
      ) : mep ? (
        <g opacity={print ? 1 : 0.4} style={{ pointerEvents: "none" }}>
          {/* cabinets, counters and appliances kept light, so the symbols read first */}
          {counterOutlines(design, frames).map((q, i) => (
            <polygon key={`ctr-${i}`} points={pointsAttr(q)} fill="none" stroke="#A6A9AC" strokeWidth={0.3} />
          ))}
          {design.items.map((it) => {
            const frame = frames.get(it.run);
            if (!frame) return null;
            const hidden = planLine(design, it) === "hidden";
            return <polygon key={it.id} points={pointsAttr(itemQuad(it, frame))} fill="none" stroke="#A6A9AC" strokeWidth={0.25} strokeDasharray={hidden ? `${fs * 0.5} ${fs * 0.3}` : undefined} />;
          })}
        </g>
      ) : mono ? (
        <>
          {/* cut at the ceiling: what is under the counter first, then the countertop, then what is seen from above */}
          {design.items.filter((it) => planLine(design, it) === "hidden").map((it) => drawItem(it, it.mountHeight > 0, "shape"))}
          {counterOutlines(design, frames).map((q, i) => (
            <polygon key={`ctr-${i}`} points={pointsAttr(q)} fill="none" stroke="#1A1D1F" strokeWidth={0.45} />
          ))}
          {[...lower, ...upper].filter((it) => planLine(design, it) === "object").map((it) => drawItem(it, it.mountHeight > 0, "shape"))}
          {design.items.map((it) => {
            const frame = frames.get(it.run);
            if (!frame) return null;
            const dash = `${fs * 0.5} ${fs * 0.3}`;
            return (
              <g key={`door-${it.id}`}>
                {applianceDoors(it, frame).map((sh, i) =>
                  sh.kind === "line" ? <line key={i} x1={sh.a.x} y1={sh.a.y} x2={sh.b.x} y2={sh.b.y} stroke="#1A1D1F" strokeWidth={0.3} strokeDasharray={dash} />
                  : sh.kind === "arc" ? <path key={i} d={`M ${sh.from.x} ${sh.from.y} A ${sh.r} ${sh.r} 0 0 ${sh.sweep} ${sh.to.x} ${sh.to.y}`} fill="none" stroke="#1A1D1F" strokeWidth={0.25} strokeDasharray={dash} />
                  : <polygon key={i} points={pointsAttr(sh.pts)} fill="none" stroke="#1A1D1F" strokeWidth={0.3} strokeDasharray={dash} />,
                )}
              </g>
            );
          })}
          {design.items.map((it) => drawItem(it, it.mountHeight > 0, "label"))}
        </>
      ) : (
        <>
          {lower.map((it) => drawItem(it, false))}
          {upper.map((it) => drawItem(it, true))}
        </>
      )}

      {mep && <MepLayer design={design} items={mep.items} selectedId={mep.selectedId} onDown={mep.onDown} fs={fs} />}

      {turnRun && !mep && <TurnHandle design={design} run={turnRun} fs={fs} onDown={down({ kind: "turn", id: turnRun.id })} live={!!onTargetDown} />}

      {shape.walls.map((w) => {
        const mid = pointOn(w, w.length / 2, -(t + fs * 3.6));
        const on = selectedRun === w.id;
        return (
          <g key={`tag-${w.id}`}>
            {/* one unit on a drawing: inches and fractions on the printed plan (K&B drawing standards) */}
            {print && finish ? (() => {
              // the finish plan dimensions only the work surfaces: where each counter starts and stops
              const spans = counterSpans(design, w.id);
              if (w.open || !spans.length) return null;
              return <DimChain origin={w.origin} u={w.u} o={{ x: -w.n.x, y: -w.n.y }} d={t + fs * 1.4} stops={[0, ...spans.flat(), w.length]} fs={fs * 0.8} from={t} />;
            })() : print ? (() => {
              // three strings from the wall out: openings (inner), centerlines (center), overall (outer)
              const o = { x: -w.n.x, y: -w.n.y };
              const tiers: React.ReactNode[] = [];
              const step = fs * 1.4;
              let d = t + step;
              const inner = w.open || mep ? [] : openingStops(design.openings, w.id, w.length);
              if (inner.length > 2) {
                tiers.push(<DimChain key="in" origin={w.origin} u={w.u} o={o} d={d} stops={inner} fs={fs * 0.8} from={t} />);
                d += step;
              }
              const cls = w.open ? [] : centerlines(design, w.id);
              if (cls.length) {
                const centers = new Map<number, { x: number; y: number }>();
                for (const c of cls) {
                  const key = Math.round(c * 1000) / 1000;
                  const it = design.items.find((i) => i.run === w.id && Math.abs(i.offset + i.width / 2 - c) < 0.25);
                  centers.set(key, pointOn(w, c, (it?.depth ?? 24) / 2));
                }
                tiers.push(<DimChain key="cl" origin={w.origin} u={w.u} o={o} d={d} stops={[0, ...cls, w.length]} fs={fs * 0.8} from={t} centers={centers} />);
                d += step;
              }
              if (mep) {
                // lights are located from two walls: the top wall and the left wall carry their positions
                const lightStops = mepLightStops(design, mep.items, w);
                if (lightStops.length) {
                  tiers.push(<DimChain key="lt" origin={w.origin} u={w.u} o={o} d={d} stops={[0, ...lightStops, w.length]} fs={fs * 0.8} from={t} />);
                  d += step;
                }
              }
              tiers.push(<DimChain key="all" origin={w.origin} u={w.u} o={o} d={d} stops={[0, w.length]} fs={fs * 0.8} from={t} />);
              return tiers;
            })() : (
              <DimAligned p0={w.origin} p1={w.end} o={{ x: -w.n.x, y: -w.n.y }} d={t + fs * 1.4} fs={fs * 0.8} label={`${fmtIn(w.length)}  (${fmtFtIn(w.length)})`} />
            )}
            {print ? null : (
              <g onPointerDown={down({ kind: "wall", id: w.id })} style={{ cursor: onTargetDown ? "pointer" : undefined }}>
                <circle cx={mid.x} cy={mid.y} r={fs * 1.05} fill={on ? "#D03238" : "#FFFFFF"} stroke="#1A1D1F" strokeWidth={0.4} strokeDasharray={w.open ? "1.2 0.8" : undefined} />
                <text x={mid.x} y={mid.y + fs * 0.36} fontSize={fs} textAnchor="middle" fontWeight={700} fill={on ? "#FFFFFF" : "#1A1D1F"}>
                  {w.letter}
                </text>
              </g>
            )}
          </g>
        );
      })}
      {finish && dimIslands.map((isl) => {
        const f = frames.get(isl.id);
        if (!f) return null;
        const q = counterOutlines(design, new Map([[isl.id, f]])).flat();
        if (!q.length) return null;
        const x0 = Math.min(...q.map((p) => p.x)), x1 = Math.max(...q.map((p) => p.x));
        const y0 = Math.min(...q.map((p) => p.y)), y1 = Math.max(...q.map((p) => p.y));
        return (
          <g key={`isl-top-${isl.id}`}>
            <DimChain origin={{ x: x0, y: y0 }} u={{ x: 1, y: 0 }} o={{ x: 0, y: -1 }} d={fs * 1.4} fs={fs * 0.8} stops={[0, x1 - x0]} />
            <DimChain origin={{ x: x0, y: y0 }} u={{ x: 0, y: 1 }} o={{ x: -1, y: 0 }} d={fs * 1.4} fs={fs * 0.8} stops={[0, y1 - y0]} />
          </g>
        );
      })}
      {!finish && dimIslands.map((isl) => {
        // an island is located from the walls in two directions, with the centerlines of any fixture on it
        const on = design.items.filter((i) => i.run === isl.id);
        const r = islandRect(design, isl);
        const centers = new Map<number, { x: number; y: number }>();
        for (const it of on.filter((i) => CENTERLINE_STYLES.has(i.style))) {
          const c = itemCenter(design, it);
          if (c) centers.set(Math.round((c.x - minX) * 1000) / 1000, c);
        }
        return (
          <g key={`isl-dim-${isl.id}`}>
            <DimChain origin={{ x: minX, y: r.y0 }} u={{ x: 1, y: 0 }} o={{ x: 0, y: -1 }} d={fs * 1.6} fs={fs * 0.8}
              stops={[0, r.x0 - minX, ...centers.keys()]} centers={centers} />
            <DimChain origin={{ x: r.x0, y: minY }} u={{ x: 0, y: 1 }} o={{ x: -1, y: 0 }} d={fs * 1.6} fs={fs * 0.8} stops={[0, r.y0 - minY]} />
          </g>
        );
      })}
      {print && marks?.map((m) => {
        if (!markerCenter(m.wallId)) return null;
        // Elevation marker: a 5/8" circle with a filled arrow pointing at the wall it looks at, numbered from the north wall clockwise.
        const w = shape.walls.find((x) => x.id === m.wallId);
        if (!w) return null;
        const r = print.scale * 0.3125;
        const c = markerCenter(w.id)!;
        const tip = { x: c.x - w.n.x * r * 1.9, y: c.y - w.n.y * r * 1.9 };
        const side = { x: w.u.x * r * 0.75, y: w.u.y * r * 0.75 };
        const baseC = { x: c.x - w.n.x * r * 0.55, y: c.y - w.n.y * r * 0.55 };
        return (
          <g key={`mark-${m.wallId}`}>
            <polygon points={pointsAttr([tip, { x: baseC.x + side.x, y: baseC.y + side.y }, { x: baseC.x - side.x, y: baseC.y - side.y }])} fill="#1A1D1F" />
            <circle cx={c.x} cy={c.y} r={r} fill="#FFFFFF" stroke="#1A1D1F" strokeWidth={0.6} />
            <text x={c.x} y={c.y + r * 0.36} fontSize={r * 1.05} textAnchor="middle" fontWeight={700} fill="#1A1D1F">
              {m.n}
            </text>
          </g>
        );
      })}
      {print && room && (() => {
        // Room name and ceiling height, near the middle of the floor and clear of the elevation markers.
        const pts = shape.inner;
        const mx = pts.reduce((n, p) => n + p.x, 0) / Math.max(1, pts.length);
        const my = pts.reduce((n, p) => n + p.y, 0) / Math.max(1, pts.length);
        const B = shape.bounds;
        const centers = [
          ...(marks ?? []).map((m) => markerCenter(m.wallId)).filter((c): c is { x: number; y: number } => !!c),
          // on the MEP plan, the lights and other symbols out in the room
          ...(mep?.items ?? []).filter((m) => !m.wall).map((m) => ({ x: m.x, y: m.y })),
        ];
        const options = [0, 0.12, -0.12, 0.18, -0.18, 0.24, -0.24, 0.3, -0.3].flatMap((fy) => [0, 0.2, -0.2].map((fx) => ({ x: mx + fx * (B.x1 - B.x0), y: my + fy * (B.y1 - B.y0) })));
        const rects = design.islands.filter((i) => design.items.some((x) => x.run === i.id)).map((i) => islandRect(design, i));
        const toRect = (p: { x: number; y: number }, q: { x0: number; y0: number; x1: number; y1: number }) =>
          Math.hypot(Math.max(q.x0 - p.x, 0, p.x - q.x1), Math.max(q.y0 - p.y, 0, p.y - q.y1));
        // the finish symbol is large: it also keeps clear of the counters and the backsplash tags along the walls
        const fromWalls = (p: { x: number; y: number }) => Math.min(...shape.walls.map((w) => {
          const s0 = Math.max(0, Math.min(w.length, (p.x - w.origin.x) * w.u.x + (p.y - w.origin.y) * w.u.y));
          return Math.hypot(p.x - (w.origin.x + w.u.x * s0), p.y - (w.origin.y + w.u.y * s0));
        }));
        // the finish symbol keeps clear of every cabinet, counter and appliance, and a little off the walls
        const pieces = finish ? [...design.items.map((it) => { const f = frames.get(it.run); return f ? itemRect(it, f) : null; }).filter((r): r is NonNullable<typeof r> => !!r),
          ...counterOutlines(design, frames).map((q) => ({ x0: Math.min(...q.map((v) => v.x)), y0: Math.min(...q.map((v) => v.y)), x1: Math.max(...q.map((v) => v.x)), y1: Math.max(...q.map((v) => v.y)) }))] : [];
        const clear = (p: { x: number; y: number }) => Math.min(Infinity, ...centers.map((c) => Math.hypot(c.x - p.x, c.y - p.y)), ...rects.map((q) => toRect(p, q) * 1.6),
          ...pieces.map((q) => toRect(p, q) * 1.6), ...(finish ? [fromWalls(p) * 1.6] : []));
        // the finish symbol looks over the whole floor, every 6", for the most open spot (inside the room)
        const grid: { x: number; y: number }[] = [];
        if (finish) for (let y = B.y0; y <= B.y1; y += 6) for (let x = B.x0; x <= B.x1; x += 6) if (insideRoom(design.room, { x, y })) grid.push({ x, y });
        const pool = finish && grid.length ? grid : options;
        // for the finish symbol, every part of it (the cross, the ceiling and base boxes, the name under it) has to be clear
        const fb = fs * 2.1;
        const score = (p: { x: number; y: number }) => finish
          ? Math.min(...[[0, 0], [0, -2.6], [0, 2.6], [0, 4.6], [-1.6, 0], [1.6, 0], [-1.6, 4.6], [1.6, 4.6]].map(([dx, dy]) => clear({ x: p.x + dx * fb, y: p.y + dy * fb })))
          : clear(p);
        const best = pool.reduce((a, b) => (score(b) > score(a) + 0.01 ? b : a), pool[0]);
        const cx = best.x;
        const cy = best.y;
        if (finish) {
          // the finish symbol takes the room's spot; the name and ceiling height go under it
          const b = fs * 2.1;
          const below = cy + (finish.data.uses.base ? 3.6 : 2.4) * b;
          return (
            <g>
              <FinishCross design={design} at={{ x: cx, y: cy }} b={b} keys={finish.keys} uses={finish.data.uses} />
              <text x={cx} y={below} fontSize={fs * 1.25} textAnchor="middle" fontWeight={700} fill="#1A1D1F" letterSpacing={fs * 0.06}>{room.name.toUpperCase()}</text>
              <text x={cx} y={below + fs * 1.5} fontSize={fs} textAnchor="middle" fill="#1A1D1F">{room.ceiling}</text>
              {finish.keys.backsplash && <BacksplashTags design={design} b={b} keyText={finish.keys.backsplash} counterThick={finish.counterThick} />}
            </g>
          );
        }
        return (
          <g>
            <text x={cx} y={cy} fontSize={fs * 1.25} textAnchor="middle" fontWeight={700} fill="#1A1D1F" letterSpacing={fs * 0.06}>{room.name.toUpperCase()}</text>
            <text x={cx} y={cy + fs * 1.5} fontSize={fs} textAnchor="middle" fill="#1A1D1F">{room.ceiling}</text>
          </g>
        );
      })()}
      {box && (
        <rect
          x={Math.min(box.x0, box.x1)}
          y={Math.min(box.y0, box.y1)}
          width={Math.abs(box.x1 - box.x0)}
          height={Math.abs(box.y1 - box.y0)}
          fill={SELECT}
          fillOpacity={0.08}
          stroke={SELECT}
          strokeWidth={0.6}
          strokeDasharray="2 1.2"
          style={{ pointerEvents: "none" }}
        />
      )}
    </svg>
  );
}
