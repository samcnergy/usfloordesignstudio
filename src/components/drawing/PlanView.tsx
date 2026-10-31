"use client";

// Top view of the room: walls, doors, windows, islands and every placed piece.
// Wall-hung pieces are drawn dashed over the floor pieces, the usual plan convention.

import type { PointerEvent as ReactPointerEvent } from "react";
import type { DesignData, Island, Opening, PlacedItem } from "@/lib/types";
import { allFrames, islandDepth, islandFrame, islandRect, itemLabel, itemQuad, pointOn, pointsAttr, roomShape, runQuad, type RunFrame } from "@/lib/geometry";
import { fmtFtIn, fmtIn } from "@/lib/units";
import { DimAligned } from "./dims";
import type { DrawTarget, ViewProps } from "./ElevationView";
import { PROBLEM, PaintDefs, SELECT, finishPaint } from "./paint";

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

export function PlanView({ design, catalog, selectedId, problemIds, onTargetDown, onBackgroundDown, className, selectedRun }: ViewProps & { selectedRun?: string | null }) {
  const t = design.room.wallThickness;
  const shape = roomShape(design.room);
  const B = shape.bounds;
  const fs = Math.max(3, Math.min(6, Math.max(B.x1 - B.x0, B.y1 - B.y0) / 38));
  const M = fs * 6;
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
  const turnRun = onTargetDown ? (design.islands.find((i) => i.id === selectedId || i.id === selectedItemRun) ?? null) : null;

  const drawItem = (it: PlacedItem, isUpper: boolean) => {
    const frame = frames.get(it.run);
    if (!frame) return null;
    const quad = itemQuad(it, frame);
    const paint = finishPaint(catalog, design, it);
    const selected = selectedId === it.id;
    const problem = problemIds?.has(it.id);
    const f0 = pointOn(frame, it.offset, it.depth);
    const f1 = pointOn(frame, it.offset + it.width, it.depth);
    const labelPoint = pointOn(frame, it.offset + it.width / 2, isUpper ? Math.min(it.depth * 0.38, 5) : it.depth * 0.66);
    const label = itemLabel(it);
    const span = Math.min(it.width, it.depth);
    const lfs = Math.min(fs * 0.85, Math.max(span / Math.max(label.length * 0.62, 1), fs * 0.45));
    return (
      <g key={it.id} onPointerDown={down({ kind: "item", id: it.id })} style={{ cursor: onTargetDown ? "grab" : undefined }}>
        <polygon
          points={pointsAttr(quad)}
          fill={paint.fill}
          fillOpacity={isUpper ? 0.55 : 1}
          stroke={problem ? PROBLEM : "#1A1D1F"}
          strokeWidth={problem ? 0.7 : 0.35}
          strokeDasharray={isUpper ? "1.6 1" : undefined}
        />
        {!isUpper && <line x1={f0.x} y1={f0.y} x2={f1.x} y2={f1.y} stroke="#1A1D1F" strokeWidth={0.8} />}
        {selected && <polygon points={pointsAttr(runQuad(frame, it.offset - 0.6, it.offset + it.width + 0.6, -0.6, it.depth + 0.6))} fill="none" stroke={SELECT} strokeWidth={1.1} />}
        <text
          x={labelPoint.x}
          y={labelPoint.y + lfs * 0.35}
          fontSize={lfs}
          textAnchor="middle"
          fill={paint.ink}
          fontWeight={600}
          style={{ pointerEvents: "none" }}
        >
          {label}
        </text>
      </g>
    );
  };

  const floor = pointsAttr(shape.inner);
  const wallColor = (id: string) => (selectedRun === id ? "#5A4A1E" : "#33363A");

  return (
    <svg
      className={className}
      viewBox={`${B.x0 - M} ${B.y0 - M} ${B.x1 - B.x0 + 2 * M} ${B.y1 - B.y0 + 2 * M}`}
      xmlns="http://www.w3.org/2000/svg"
      fontFamily="'Source Sans 3', Helvetica, Arial, sans-serif"
      onPointerDown={() => onBackgroundDown?.()}
      style={{ touchAction: "none", userSelect: "none" }}
    >
      <PaintDefs catalog={catalog} />
      <defs>
        <pattern id="floorgrid" patternUnits="userSpaceOnUse" width={12} height={12}>
          <path d="M 12 0 L 0 0 0 12" fill="none" stroke="#E4E2DC" strokeWidth={0.2} />
        </pattern>
      </defs>
      <polygon points={floor} fill="#FFFFFF" />
      <polygon points={floor} fill="url(#floorgrid)" />

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
              <polygon points={band} fill={wallColor(w.id)} stroke={wallColor(w.id)} strokeWidth={0.15} strokeLinejoin="round" />
            )}
          </g>
        );
      })}

      {design.openings.map((op) => {
        const frame = frames.get(op.wall);
        if (!frame) return null;
        const selected = selectedId === op.id;
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
        // a single piece standing on its own floor run needs no box around it
        if (isl.auto && on.length <= 1) return null;
        const r = islandRect(design, isl);
        const frame = islandFrame(design, isl);
        const back = pointOn(frame, frame.length / 2, -fs * 0.9);
        const selected = selectedId === isl.id;
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

      {lower.map((it) => drawItem(it, false))}
      {upper.map((it) => drawItem(it, true))}

      {turnRun && <TurnHandle design={design} run={turnRun} fs={fs} onDown={down({ kind: "turn", id: turnRun.id })} live={!!onTargetDown} />}

      {shape.walls.map((w) => {
        const mid = pointOn(w, w.length / 2, -(t + fs * 3.6));
        const on = selectedRun === w.id;
        return (
          <g key={`tag-${w.id}`}>
            <DimAligned p0={w.origin} p1={w.end} o={{ x: -w.n.x, y: -w.n.y }} d={t + fs * 1.4} fs={fs * 0.8} label={`${fmtIn(w.length)}  (${fmtFtIn(w.length)})`} />
            <g onPointerDown={down({ kind: "wall", id: w.id })} style={{ cursor: onTargetDown ? "pointer" : undefined }}>
              <circle cx={mid.x} cy={mid.y} r={fs * 1.05} fill={on ? "#D03238" : "#FFFFFF"} stroke="#1A1D1F" strokeWidth={0.4} strokeDasharray={w.open ? "1.2 0.8" : undefined} />
              <text x={mid.x} y={mid.y + fs * 0.36} fontSize={fs} textAnchor="middle" fontWeight={700} fill={on ? "#FFFFFF" : "#1A1D1F"}>
                {w.letter}
              </text>
            </g>
          </g>
        );
      })}
    </svg>
  );
}
