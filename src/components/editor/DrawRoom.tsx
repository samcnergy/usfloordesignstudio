"use client";

// Draw the room with the mouse, like a drawing program. Click the first corner,
// pull out a wall and click again, or type its length (and corner angle) and
// press Enter. Click the first corner, or press Enter, to close the room.

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { DimAligned } from "@/components/drawing/dims";
import { ANGLE_STEP, MIN_WALL, nextPoint, roomFromPoints } from "@/lib/draw";
import { roomShape, type Vec } from "@/lib/geometry";
import type { Room } from "@/lib/types";
import { fmtFtIn, fmtIn, parseLength } from "@/lib/units";

interface View {
  x: number;
  y: number;
  w: number; // inches across
}

const SNAP_PX = 12;
const MIN_VIEW = 60;
const MAX_VIEW = 2400;

function newId(): string {
  return `w${Math.random().toString(36).slice(2, 9)}`;
}

function fmtAngle(v: number): string {
  return `${Math.round(v * 10) / 10}°`;
}

export function DrawRoom({
  room,
  minWalls,
  onFinish,
  onCancel,
  flash,
}: {
  room: Room;
  minWalls: number; // pieces sit on walls up to this one, so the new room needs at least this many
  onFinish: (room: Room) => void;
  onCancel: () => void;
  flash: (m: string) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const lenRef = useRef<HTMLInputElement>(null);
  const [size, setSize] = useState({ w: 900, h: 560 });
  const [view, setView] = useState<View>({ x: -48, y: -48, w: 420 });
  const [points, setPoints] = useState<Vec[]>([]);
  const [cursor, setCursor] = useState<{ fx: number; fy: number } | null>(null);
  const [free, setFree] = useState(false);
  const [lenText, setLenText] = useState("");
  const [angText, setAngText] = useState("");

  const viewH = (view.w * size.h) / size.w;
  const scale = size.w / view.w; // pixels per inch
  const tol = SNAP_PX / scale;
  const fs = 13 / scale;
  const toRoom = (c: { fx: number; fy: number }): Vec => ({ x: view.x + c.fx * view.w, y: view.y + c.fy * viewH });
  const mouse = cursor ? toRoom(cursor) : null;

  const n = points.length;
  const typedLen = (() => {
    const v = lenText.trim() ? parseLength(lenText) : null;
    return v !== null && v >= MIN_WALL && v <= 2400 ? v : null;
  })();
  const typedAng = (() => {
    if (!angText.trim()) return null;
    const v = Number(angText.replace("°", "").trim());
    if (!Number.isFinite(v)) return null;
    return n < 2 ? (v >= 0 && v <= 180 ? v : null) : v > 0 && v < 360 ? v : null;
  })();
  const previewAt = (m: Vec | null) => (n && m ? nextPoint({ points, mouse: m, length: typedLen, angle: typedAng, free, tol }) : null);
  const preview = previewAt(mouse);
  const firstCorner = mouse && !n ? { x: Math.round(mouse.x), y: Math.round(mouse.y) } : null;

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ w: width, h: height });
    });
    ro.observe(el);
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const fx = (e.clientX - r.left) / r.width;
      const fy = (e.clientY - r.top) / r.height;
      const k = Math.exp(e.deltaY * 0.0015);
      setView((v) => {
        const w = Math.max(MIN_VIEW, Math.min(MAX_VIEW, v.w * k));
        const h0 = (v.w * r.height) / r.width;
        const h1 = (w * r.height) / r.width;
        return { w, x: v.x + fx * (v.w - w), y: v.y + fy * (h0 - h1) };
      });
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      ro.disconnect();
      el.removeEventListener("wheel", wheel);
    };
  }, []);

  /** Keeps every corner on screen after one is added off to the side. */
  const fit = (pts: Vec[]) => {
    setView((v) => {
      const h = (v.w * size.h) / size.w;
      const m = v.w * 0.08;
      const last = pts[pts.length - 1];
      if (last.x > v.x + m && last.x < v.x + v.w - m && last.y > v.y + m && last.y < v.y + h - m) return v;
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      const x0 = Math.min(...xs);
      const x1 = Math.max(...xs);
      const y0 = Math.min(...ys);
      const y1 = Math.max(...ys);
      const w = Math.min(MAX_VIEW, Math.max(v.w, (x1 - x0) * 1.5, ((y1 - y0) * 1.5 * size.w) / size.h));
      const wh = (w * size.h) / size.w;
      return { w, x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - wh / 2 };
    });
  };

  // after each corner the next thing typed is a length
  const clearTyped = () => {
    setLenText("");
    setAngText("");
    lenRef.current?.focus();
  };

  const finish = (pts: Vec[]) => {
    if (pts.length < 3) {
      flash("A room needs at least 3 walls.");
      return;
    }
    if (pts.length < minWalls) {
      flash(`There are pieces on the first ${minWalls} walls. Draw at least ${minWalls} walls, or move those pieces first.`);
      return;
    }
    const next = roomFromPoints(pts, room, newId);
    const issue = roomShape(next).issue;
    if (issue) {
      flash(issue);
      return;
    }
    onFinish(next);
  };

  const place = (m: Vec | null = mouse) => {
    if (!m) return;
    if (!n) {
      setPoints([{ x: Math.round(m.x), y: Math.round(m.y) }]);
      clearTyped();
      return;
    }
    const p = previewAt(m);
    if (!p) return;
    if (p.closes) {
      finish(points);
      return;
    }
    if (p.length < MIN_WALL) return;
    const pts = [...points, p.end];
    setPoints(pts);
    clearTyped();
    fit(pts);
  };

  const undoPoint = () => {
    setPoints((p) => p.slice(0, -1));
    clearTyped();
  };

  // keyboard: typing goes to the length box wherever the focus is
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "Shift") setFree(true);
      const el = e.target as HTMLElement;
      const inBox = el === lenRef.current || el?.dataset?.draw === "angle";
      if (el && !inBox && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT")) return;
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === "Escape") {
        e.preventDefault();
        if (lenText || angText) clearTyped();
        else onCancel();
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (n && (typedLen !== null || typedAng !== null)) place();
        else if (n >= 3) finish(points);
      } else if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undoPoint();
      } else if ((e.key === "Backspace" || e.key === "Delete") && !lenText && !angText) {
        e.preventDefault();
        undoPoint();
      } else if (!inBox && !mod && /^[0-9.'"/ ]$/.test(e.key)) {
        lenRef.current?.focus();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Shift") setFree(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  });

  const move = (e: ReactPointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const c = { fx: (e.clientX - r.left) / r.width, fy: (e.clientY - r.top) / r.height };
    setCursor(c);
    if (e.shiftKey !== free) setFree(e.shiftKey);
    return c;
  };

  const hint = !n
    ? "Click where the first wall starts."
    : n === 1
      ? "Pull out the first wall and click, or type its length and press Enter."
      : n === 2
        ? "Next wall: click, or type the length and the corner (90° square, 135° cut corner) and press Enter."
        : "Keep going, or click the first corner (or press Enter) to close the room.";

  const lineW = 3 / scale;
  // the corner angle sits inside the corner, between the last wall and the new one
  const anglePos = (() => {
    if (!preview || n < 2 || preview.length < MIN_WALL) return null;
    const a = points[n - 2];
    const b = points[n - 1];
    const back = { x: a.x - b.x, y: a.y - b.y };
    const bl = Math.hypot(back.x, back.y);
    const fwd = { x: preview.end.x - b.x, y: preview.end.y - b.y };
    const fl = Math.hypot(fwd.x, fwd.y);
    let m = { x: back.x / bl + fwd.x / fl, y: back.y / bl + fwd.y / fl };
    const ml = Math.hypot(m.x, m.y);
    m = ml < 1e-6 ? { x: -back.y / bl, y: back.x / bl } : { x: m.x / ml, y: m.y / ml };
    return { x: b.x + m.x * fs * 2.4, y: b.y + m.y * fs * 2.4 };
  })();
  const startHot = preview?.closes;

  return (
    <div className="draw">
      <div className="draw-bar">
        <p className="draw-hint">{hint}</p>
        <div className="draw-fields">
          <label className="draw-field">
            <span className="field-label">Length</span>
            <input
              ref={lenRef}
              autoFocus
              className="input tabular"
              value={lenText}
              placeholder={preview ? fmtIn(preview.length, false) : ""}
              inputMode="decimal"
              onChange={(e) => setLenText(e.target.value)}
              aria-label="Wall length in inches"
            />
          </label>
          <label className="draw-field">
            <span className="field-label">{n < 2 ? "Tilt" : "Corner"}</span>
            <input
              data-draw="angle"
              className="input tabular"
              value={angText}
              placeholder={preview ? String(Math.round(preview.angle * 10) / 10) : ""}
              inputMode="decimal"
              onChange={(e) => setAngText(e.target.value)}
              aria-label={n < 2 ? "Tilt from level in degrees" : "Corner angle in degrees"}
            />
          </label>
          <button className="btn btn-ghost btn-small" onClick={undoPoint} disabled={!n} title="Remove the last corner (Backspace)">
            Undo last
          </button>
          <button className="btn btn-primary btn-small" onClick={() => finish(points)} disabled={n < 3} title="Close the room back to the first corner (Enter)">
            Close room
          </button>
          <button className="btn btn-ghost btn-small" onClick={onCancel} title="Keep the room as it was (Esc)">
            Cancel
          </button>
        </div>
      </div>

      <svg
        ref={svgRef}
        className="draw-svg"
        viewBox={`${view.x} ${view.y} ${view.w} ${viewH}`}
        xmlns="http://www.w3.org/2000/svg"
        fontFamily="'Source Sans 3', Helvetica, Arial, sans-serif"
        onPointerMove={move}
        onMouseDown={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          place(toRoom(move(e)));
        }}
        style={{ touchAction: "none", userSelect: "none", cursor: "crosshair" }}
      >
        <defs>
          <pattern id="draw-grid" patternUnits="userSpaceOnUse" width={12} height={12}>
            <path d="M 12 0 L 0 0 0 12" fill="none" stroke="#E4E2DC" strokeWidth={0.6 / scale} />
          </pattern>
          <pattern id="draw-grid-4" patternUnits="userSpaceOnUse" width={48} height={48}>
            <path d="M 48 0 L 0 0 0 48" fill="none" stroke="#CFCCC4" strokeWidth={1 / scale} />
          </pattern>
        </defs>
        <rect x={view.x} y={view.y} width={view.w} height={viewH} fill="#FFFFFF" />
        {scale > 0.6 && <rect x={view.x} y={view.y} width={view.w} height={viewH} fill="url(#draw-grid)" />}
        {scale > 0.25 && <rect x={view.x} y={view.y} width={view.w} height={viewH} fill="url(#draw-grid-4)" />}

        {points.slice(1).map((p, i) => {
          const a = points[i];
          const len = Math.hypot(p.x - a.x, p.y - a.y);
          const u = { x: (p.x - a.x) / len, y: (p.y - a.y) / len };
          return (
            <g key={i}>
              <line x1={a.x} y1={a.y} x2={p.x} y2={p.y} stroke="#33363A" strokeWidth={lineW * 1.6} strokeLinecap="round" />
              <DimAligned p0={a} p1={p} o={{ x: u.y, y: -u.x }} d={fs * 1.3} fs={fs} label={`${fmtIn(len)}  (${fmtFtIn(len)})`} />
            </g>
          );
        })}

        {preview && n >= 2 && !preview.closes && (
          // where the closing wall would go
          <line x1={preview.end.x} y1={preview.end.y} x2={points[0].x} y2={points[0].y} stroke="#8A8D90" strokeWidth={lineW * 0.6} strokeDasharray={`${6 / scale} ${4 / scale}`} />
        )}

        {preview && (
          <g>
            {preview.guide && (
              <line
                x1={preview.end.x}
                y1={preview.end.y}
                x2={preview.guide === "x" ? points[0].x : preview.end.x}
                y2={preview.guide === "y" ? points[0].y : preview.end.y}
                stroke="#2F6FB0"
                strokeWidth={lineW * 0.6}
                strokeDasharray={`${3 / scale} ${3 / scale}`}
              />
            )}
            <line x1={points[n - 1].x} y1={points[n - 1].y} x2={preview.end.x} y2={preview.end.y} stroke="#D03238" strokeWidth={lineW * 1.6} strokeLinecap="round" />
            <circle cx={preview.end.x} cy={preview.end.y} r={4 / scale} fill="#D03238" />
            {preview.length >= MIN_WALL && (
              <text
                x={(points[n - 1].x + preview.end.x) / 2}
                y={(points[n - 1].y + preview.end.y) / 2 - fs * 0.9}
                fontSize={fs * 1.25}
                fontWeight={700}
                textAnchor="middle"
                fill="#D03238"
                stroke="#FFFFFF"
                strokeWidth={fs * 0.3}
                paintOrder="stroke"
                style={{ fontVariantNumeric: "tabular-nums", pointerEvents: "none" }}
              >
                {fmtIn(preview.length)}
              </text>
            )}
            {n >= 2 && anglePos && (
              <text
                x={anglePos.x}
                y={anglePos.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={fs}
                fontWeight={600}
                fill="#2F6FB0"
                stroke="#FFFFFF"
                strokeWidth={fs * 0.3}
                paintOrder="stroke"
                style={{ pointerEvents: "none" }}
              >
                {fmtAngle(preview.angle)}
              </text>
            )}
          </g>
        )}

        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={(i === 0 && n >= 3 ? (startHot ? 9 : 6) : 4) / scale}
            fill={i === 0 && startHot ? "#D03238" : "#FFFFFF"}
            stroke="#1A1D1F"
            strokeWidth={1.2 / scale}
          />
        ))}
        {startHot && (
          <text x={points[0].x} y={points[0].y - fs * 1.2} fontSize={fs} fontWeight={700} textAnchor="middle" fill="#D03238" stroke="#FFFFFF" strokeWidth={fs * 0.3} paintOrder="stroke">
            Close room
          </text>
        )}

        {firstCorner && <circle cx={firstCorner.x} cy={firstCorner.y} r={4 / scale} fill="#D03238" />}
      </svg>

      <p className="draw-help muted">
        Walls snap to {ANGLE_STEP}° steps. Hold Shift for any angle. Scroll to zoom. Backspace removes the last corner, Esc cancels. The grid is 1 ft, darker lines every 4 ft.
      </p>
    </div>
  );
}
