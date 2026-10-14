"use client";

// Room tab: ceiling, wall thickness, and the walls themselves. Designers go
// clockwise around the room typing each wall's length and the corner at its
// end. The last wall closes the room by itself, so a field measurement that is
// a little off shows up as a slanted last wall instead of a broken drawing.

import { useState } from "react";
import { MAX_WALLS, roomShape, wallLetter } from "@/lib/geometry";
import type { DesignData, Room, Wall } from "@/lib/types";
import { fmtFtIn, fmtIn } from "@/lib/units";
import { LengthInput } from "./LengthInput";

const PRESETS: [number, string][] = [
  [90, "90° corner"],
  [270, "270° inside corner (L)"],
  [135, "135° cut corner"],
  [225, "225° cut corner, inside"],
  [180, "180° straight on"],
];

function fmtAngle(v: number): string {
  return `${Math.round(v * 10) / 10}°`;
}

function newId(): string {
  return `w${Math.random().toString(36).slice(2, 9)}`;
}

function CornerInput({ id, value, onChange }: { id: string; value: number; onChange: (v: number) => void }) {
  const preset = PRESETS.some(([v]) => Math.abs(v - value) < 0.01);
  const [custom, setCustom] = useState(!preset);
  const [draft, setDraft] = useState<string | null>(null);
  const showNumber = custom || !preset;
  const commit = () => {
    if (draft === null) return;
    const v = Number(draft.replace("°", "").trim());
    setDraft(null);
    if (Number.isFinite(v) && v > 0 && v < 360 && v !== value) onChange(Math.round(v * 100) / 100);
  };
  return (
    <div className="corner-input">
      <select
        id={id}
        className="input"
        value={showNumber ? "other" : String(value)}
        onChange={(e) => {
          if (e.target.value === "other") {
            setCustom(true);
            return;
          }
          setCustom(false);
          onChange(Number(e.target.value));
        }}
      >
        {PRESETS.map(([v, label]) => (
          <option key={v} value={v}>
            {label}
          </option>
        ))}
        <option value="other">Other angle</option>
      </select>
      {showNumber && (
        <input
          className="input tabular corner-num"
          aria-label="Corner angle in degrees"
          value={draft ?? String(value)}
          inputMode="decimal"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
        />
      )}
    </div>
  );
}

export function RoomPanel({
  design,
  apply,
  flash,
  selectedRun,
  onSelectWall,
}: {
  design: DesignData;
  apply: (fn: (d: DesignData) => DesignData) => void;
  flash: (m: string) => void;
  selectedRun: string;
  onSelectWall: (id: string) => void;
}) {
  const room = design.room;
  const shape = roomShape(room);
  const N = room.walls.length;

  const setRoom = (fn: (r: Room) => Room) => apply((d) => ({ ...d, room: fn(d.room) }));
  // before walls are added or removed, keep the closing wall and its corners as they are drawn now
  const bake = (r: Room): Room => {
    const g = roomShape(r).walls;
    return { ...r, walls: r.walls.map((w, i) => ({ ...w, length: Math.round(g[i].length * 8) / 8, corner: g[i].corner })) };
  };
  const setWall = (id: string, patch: Partial<Wall>) => setRoom((r) => ({ ...r, walls: r.walls.map((w) => (w.id === id ? { ...w, ...patch } : w)) }));

  const used = (id: string) => design.items.filter((i) => i.run === id).length + design.openings.filter((o) => o.wall === id).length;

  const addAfter = (index: number) => {
    if (N >= MAX_WALLS) {
      flash(`A room can have up to ${MAX_WALLS} walls.`);
      return;
    }
    // a straight-on corner keeps every other wall where it was; set the real length and corner next
    const wall: Wall = { id: newId(), length: 24, corner: 180 };
    const at = Math.min(index + 1, N - 1);
    setRoom((r) => {
      const b = bake(r);
      return { ...b, walls: [...b.walls.slice(0, at), wall, ...b.walls.slice(at)] };
    });
    onSelectWall(wall.id);
  };

  const remove = (w: Wall, index: number) => {
    if (N <= 3) {
      flash("A room needs at least 3 walls.");
      return;
    }
    const n = used(w.id);
    if (n > 0) {
      flash(`Wall ${wallLetter(index)} still has ${n} ${n === 1 ? "piece" : "pieces"} on it. Move or delete them first.`);
      return;
    }
    setRoom((r) => {
      const b = bake(r);
      return { ...b, walls: b.walls.filter((x) => x.id !== w.id) };
    });
  };

  const startFrom = (kind: "rect" | "L") => {
    const W = Math.round(shape.bounds.x1 - shape.bounds.x0 - 2 * room.wallThickness);
    const D = Math.round(shape.bounds.y1 - shape.bounds.y0 - 2 * room.wallThickness);
    const specs: [number, number][] =
      kind === "rect"
        ? [
            [W, 90],
            [D, 90],
            [W, 90],
            [D, 90],
          ]
        : [
            [W, 90],
            [Math.round(D / 2), 90],
            [Math.round(W / 2), 270],
            [Math.round(D / 2), 90],
            [W - Math.round(W / 2), 90],
            [D, 90],
          ];
    const dropped = room.walls.slice(specs.length).filter((w) => used(w.id) > 0);
    if (dropped.length) {
      flash(`Move or delete the pieces on ${dropped.map((w) => `Wall ${wallLetter(room.walls.indexOf(w))}`).join(", ")} first.`);
      return;
    }
    setRoom((r) => ({
      ...r,
      walls: specs.map(([length, corner], i) => ({ id: r.walls[i]?.id ?? newId(), length, corner })),
    }));
  };

  return (
    <div className="stack">
      <div className="grid2">
        <LengthInput id="room-h" label="Ceiling height" value={room.ceiling} min={72} max={240} onChange={(v) => setRoom((r) => ({ ...r, ceiling: v }))} />
        <LengthInput id="room-t" label="Wall thickness" value={room.wallThickness} min={2} max={16} onChange={(v) => setRoom((r) => ({ ...r, wallThickness: v }))} />
      </div>

      <h3 className="cat-title">Walls</h3>
      <p className="muted">
        Go clockwise around the room starting with Wall A, the top wall in the top view. For each wall type its length and the corner at its end, measured inside
        the room: 90° for a normal corner, 270° where an L turns in, 135° for a cut corner. The last wall closes the room by itself.
      </p>
      <div className="chips">
        <span className="field-label">Start from</span>
        <button className="chip" onClick={() => startFrom("rect")}>
          Rectangle
        </button>
        <button className="chip" onClick={() => startFrom("L")}>
          L-shape
        </button>
      </div>

      {shape.issue && <p className="room-issue">{shape.issue}</p>}

      <ol className="wall-list">
        {shape.walls.map((g, i) => {
          const w = room.walls[i];
          const on = selectedRun === w.id;
          return (
            <li key={w.id} className={`wall-row ${on ? "wall-row-on" : ""}`}>
              <button className={`wall-badge ${w.open ? "wall-badge-open" : ""}`} onClick={() => onSelectWall(w.id)} title={`Select Wall ${g.letter}`}>
                {g.letter}
              </button>
              <div className="wall-fields">
                {g.computed.length ? (
                  <div className="field">
                    <span className="field-label">Length</span>
                    <div className="wall-computed tabular">
                      {fmtIn(g.length)} <span className="muted">({fmtFtIn(g.length)}), closes the room</span>
                    </div>
                  </div>
                ) : (
                  <LengthInput id={`wall-len-${w.id}`} label="Length" value={w.length} min={1} max={1200} onChange={(v) => setWall(w.id, { length: v })} />
                )}
                <div className="field">
                  <span className="field-label">Corner at end (to Wall {wallLetter((i + 1) % N)})</span>
                  {g.computed.corner ? (
                    <div className="wall-computed tabular">
                      {fmtAngle(g.corner)} <span className="muted">works out from the others</span>
                    </div>
                  ) : (
                    <CornerInput id={`wall-corner-${w.id}`} value={w.corner} onChange={(v) => setWall(w.id, { corner: v })} />
                  )}
                </div>
                <div className="wall-actions">
                  <label className="check">
                    <input type="checkbox" checked={!!w.open} onChange={(e) => setWall(w.id, { open: e.target.checked || undefined })} />
                    Open, no wall
                  </label>
                  {i < N - 1 && (
                    <button className="btn btn-ghost btn-small" onClick={() => addAfter(i)} title="Add a wall after this one">
                      Add wall after
                    </button>
                  )}
                  <button className="btn btn-ghost btn-small" onClick={() => remove(w, i)} title={`Remove Wall ${g.letter}`}>
                    Remove
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
