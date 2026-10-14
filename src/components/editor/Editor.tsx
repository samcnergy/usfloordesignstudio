"use client";

// The kitchen designer. Left: room, cabinets, doors and windows, photos.
// Center: top view or a front view. Right: the selected piece.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Brand } from "@/components/Brand";
import { ElevationView, type DrawTarget } from "@/components/drawing/ElevationView";
import { PlanView } from "@/components/drawing/PlanView";
import { PrintSheet } from "@/components/print/PrintSheet";
import { findProblems, firstFreeOffset, isWall, itemLabel, itemRect, runFrame, runLabel, wallLength } from "@/lib/geometry";
import type { Catalog, CatalogCabinet, Category, DesignData, DesignRecord, Island, Opening, OpeningType, PlacedItem } from "@/lib/types";
import { WALLS } from "@/lib/types";
import { useHistory } from "@/lib/useHistory";
import { fmtIn, snap } from "@/lib/units";
import { LengthInput } from "./LengthInput";

type Meta = Pick<DesignRecord, "name" | "customer_name" | "customer_phone" | "customer_address" | "designer_name" | "notes">;
type SaveState = "saved" | "unsaved" | "saving" | "error" | "local";
type Tab = "room" | "cabinets" | "openings" | "photos" | "details";

const CATEGORY_LABEL: Record<Category, string> = {
  base: "Base cabinets",
  wall: "Wall cabinets",
  tall: "Tall cabinets",
  appliance: "Appliances",
  filler: "Fillers and panels",
};

const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2));

export interface EditorProps {
  initial: DesignRecord;
  catalog: Catalog;
  persist?: (meta: Meta, data: DesignData) => Promise<void>;
  uploadPhoto?: (file: File) => Promise<string>;
  backHref: string;
}

export function Editor({ initial, catalog, persist, uploadPhoto, backHref }: EditorProps) {
  const history = useHistory<DesignData>(initial.data);
  const design = history.present;
  const { apply, begin, preview, commit, undo, redo } = history;
  const [meta, setMeta] = useState<Meta>({
    name: initial.name,
    customer_name: initial.customer_name,
    customer_phone: initial.customer_phone,
    customer_address: initial.customer_address,
    designer_name: initial.designer_name,
    notes: initial.notes,
  });
  const [tab, setTab] = useState<Tab>("cabinets");
  const [view, setView] = useState<string>("plan");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeRun, setActiveRun] = useState<string>("A");
  const [notice, setNotice] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);

  const activeCatalog = useMemo<Catalog>(
    () => ({
      cabinets: catalog.cabinets.filter((c) => c.active),
      finishes: catalog.finishes.filter((f) => f.active),
      countertops: catalog.countertops.filter((c) => c.active),
    }),
    [catalog],
  );

  const problems = useMemo(() => findProblems(design), [design]);
  const problemIds = useMemo(() => new Set(problems.flatMap((p) => p.ids)), [problems]);

  const selectedItem = design.items.find((i) => i.id === selectedId) ?? null;
  const selectedOpening = design.openings.find((o) => o.id === selectedId) ?? null;
  const selectedIsland = design.islands.find((i) => i.id === selectedId) ?? null;

  // keep the active run valid if an island is removed
  const activeRunValid = isWall(activeRun) || design.islands.some((i) => i.id === activeRun) ? activeRun : "A";
  const viewValid = view === "plan" || isWall(view) || design.islands.some((i) => i.id === view) ? view : "plan";

  // ---------- saving ----------
  const [saved, setSaved] = useState<{ design: DesignData; meta: Meta }>({ design: initial.data, meta });
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const dirty = saved.design !== design || saved.meta !== meta;
  useEffect(() => {
    if (!persist || !dirty) return;
    const handle = window.setTimeout(async () => {
      setSaving(true);
      try {
        await persist(meta, design);
        setSaved({ design, meta });
        setSaveFailed(false);
      } catch {
        setSaveFailed(true);
      } finally {
        setSaving(false);
      }
    }, 1200);
    return () => window.clearTimeout(handle);
  }, [design, meta, persist, dirty, retry]);
  const save: SaveState = !persist ? "local" : saveFailed ? "error" : saving ? "saving" : dirty ? "unsaved" : "saved";

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (save === "unsaved" || save === "saving") e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [save]);

  const flash = useCallback((msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice((n) => (n === msg ? null : n)), 3500);
  }, []);

  // ---------- edits ----------
  const updateItem = useCallback(
    (id: string, patch: Partial<PlacedItem>) => apply((d) => ({ ...d, items: d.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) })),
    [apply],
  );
  const updateOpening = useCallback(
    (id: string, patch: Partial<Opening>) => apply((d) => ({ ...d, openings: d.openings.map((o) => (o.id === id ? { ...o, ...patch } : o)) })),
    [apply],
  );
  const updateIsland = useCallback(
    (id: string, patch: Partial<Island>) => apply((d) => ({ ...d, islands: d.islands.map((o) => (o.id === id ? { ...o, ...patch } : o)) })),
    [apply],
  );

  const removeSelected = useCallback(() => {
    if (!selectedId) return;
    apply((d) => ({
      ...d,
      items: d.items.filter((i) => i.id !== selectedId && i.run !== selectedId),
      openings: d.openings.filter((o) => o.id !== selectedId),
      islands: d.islands.filter((i) => i.id !== selectedId),
    }));
    setSelectedId(null);
  }, [apply, selectedId]);

  const addCabinet = (cab: CatalogCabinet, width: number) => {
    const run = activeRunValid;
    if (!isWall(run) && (cab.category === "wall" || cab.style === "hood" || (cab.mount_height ?? 0) > 0)) {
      flash("Wall-hung pieces go on a wall. Pick Wall A to D first.");
      return;
    }
    const height = cab.default_height;
    const mount = cab.mount_height ?? 0;
    let offset = firstFreeOffset(design, run, width, [mount, mount + height]);
    if (cab.style === "hood") {
      // center a new hood over the first range on this run that has no hood yet
      const hoods = design.items.filter((i) => i.run === run && i.style === "hood");
      const range = design.items
        .filter((i) => i.run === run && i.style === "range")
        .sort((a, b) => a.offset - b.offset)
        .find((r) => !hoods.some((h) => h.offset < r.offset + r.width && r.offset < h.offset + h.width));
      if (range) offset = range.offset + (range.width - width) / 2;
    }
    const item: PlacedItem = {
      id: uid(),
      cabinetId: cab.id,
      code: cab.code,
      name: cab.name,
      category: cab.category,
      style: cab.style,
      run,
      offset,
      width,
      height,
      depth: cab.depth,
      mountHeight: mount,
      finishId: null,
      hinge: "left",
    };
    apply((d) => ({ ...d, items: [...d.items, item] }));
    setSelectedId(item.id);
    if (isWall(run) && offset + width > wallLength(design.room, run)) flash(`No room left on Wall ${run}. The piece is placed past the end; move or resize it.`);
  };

  const addOpening = (type: OpeningType) => {
    const wall = isWall(activeRunValid) ? activeRunValid : "A";
    const width = type === "door" ? 32 : 36;
    const op: Opening = {
      id: uid(),
      wall,
      type,
      width,
      offset: Math.max(0, Math.min(wallLength(design.room, wall) - width, wallLength(design.room, wall) / 2 - width / 2)),
      height: type === "window" ? 42 : 80,
      sill: type === "window" ? 42 : 0,
      hinge: "left",
    };
    apply((d) => ({ ...d, openings: [...d.openings, op] }));
    setSelectedId(op.id);
  };

  const addIsland = () => {
    const n = design.islands.length + 1;
    const isl: Island = {
      id: uid(),
      name: `Island ${n}`,
      x: Math.round(design.room.width / 2 - 36),
      y: Math.round(design.room.depth / 2 - 12),
      rotation: 0,
    };
    apply((d) => ({ ...d, islands: [...d.islands, isl] }));
    setActiveRun(isl.id);
    setSelectedId(isl.id);
    setTab("cabinets");
  };

  // ---------- dragging ----------
  const drag = useRef<{
    target: DrawTarget;
    svg: SVGSVGElement;
    viewKind: "plan" | "elev";
    start: { x: number; y: number };
    startOffset: number;
    startXY: { x: number; y: number };
    moved: boolean;
    cycleTo: string | null;
  } | null>(null);

  const svgPoint = (svg: SVGSVGElement, clientX: number, clientY: number) => {
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };

  const handleTargetDown = (viewKind: "plan" | "elev", e: ReactPointerEvent<SVGElement>, target: DrawTarget) => {
    if (target.kind === "wall") {
      setActiveRun(target.id);
      setSelectedId(null);
      return;
    }
    const svgEl = (e.currentTarget as SVGElement).ownerSVGElement;
    let cycleTo: string | null = null;
    if (viewKind === "plan" && target.kind === "item" && svgEl) {
      // In the top view wall cabinets sit over base cabinets. Clicking the same spot
      // again steps down through every piece stacked there.
      const p = svgPoint(svgEl, e.clientX, e.clientY);
      const stack = [...design.items]
        .sort((a, b) => b.mountHeight - a.mountHeight)
        .filter((it) => {
          const f = runFrame(design, it.run);
          if (!f) return false;
          const r = itemRect(it, f);
          return p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1;
        });
      if (stack.length > 1) {
        const idx = stack.findIndex((it) => it.id === selectedId);
        // keep the current piece so it can be dragged; a click without dragging steps to the next one
        target = { kind: "item", id: stack[idx === -1 ? 0 : idx].id };
        if (idx !== -1) cycleTo = stack[(idx + 1) % stack.length].id;
      }
    }
    setSelectedId(target.id);
    if (target.kind === "item") {
      const it = design.items.find((i) => i.id === target.id);
      if (it) setActiveRun(it.run);
    }
    if (target.kind === "island") setActiveRun(target.id);
    if (target.kind === "opening") {
      const op = design.openings.find((o) => o.id === target.id);
      if (op) setActiveRun(op.wall);
    }
    const svg = svgEl;
    if (!svg || e.button !== 0) return;
    const start = svgPoint(svg, e.clientX, e.clientY);
    const it = design.items.find((i) => i.id === target.id);
    const op = design.openings.find((o) => o.id === target.id);
    const isl = design.islands.find((i) => i.id === target.id);
    drag.current = {
      target,
      svg,
      viewKind,
      start,
      startOffset: it?.offset ?? op?.offset ?? 0,
      startXY: isl ? { x: isl.x, y: isl.y } : { x: 0, y: 0 },
      moved: false,
      cycleTo,
    };
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const dr = drag.current;
      if (!dr) return;
      const p = svgPoint(dr.svg, e.clientX, e.clientY);
      const dx = p.x - dr.start.x;
      const dy = p.y - dr.start.y;
      if (!dr.moved) {
        if (Math.hypot(dx, dy) < 1.5) return;
        dr.moved = true;
        begin();
      }
      const { target } = dr;
      if (target.kind === "island") {
        preview((d) => ({
          ...d,
          islands: d.islands.map((i) => (i.id === target.id ? { ...i, x: snap(dr.startXY.x + dx, 1), y: snap(dr.startXY.y + dy, 1) } : i)),
        }));
        return;
      }
      preview((d) => {
        if (target.kind === "item") {
          const it = d.items.find((i) => i.id === target.id);
          if (!it) return d;
          const frame = runFrame(d, it.run);
          if (!frame) return d;
          const delta = dr.viewKind === "plan" ? dx * frame.u.x + dy * frame.u.y : dx;
          let next = snap(dr.startOffset + delta, 0.5);
          // magnetic snap to the wall ends and to neighboring pieces at the same height
          const cands = [0];
          if (isWall(it.run)) cands.push(frame.length - it.width);
          for (const o of d.items) {
            if (o.run !== it.run || o.id === it.id) continue;
            const overlapV = o.mountHeight < it.mountHeight + it.height && it.mountHeight < o.mountHeight + o.height;
            if (!overlapV) continue;
            cands.push(o.offset + o.width, o.offset - it.width);
          }
          for (const c of cands) if (Math.abs(next - c) < 2) next = c;
          return { ...d, items: d.items.map((i) => (i.id === it.id ? { ...i, offset: next } : i)) };
        }
        if (target.kind === "opening") {
          const op = d.openings.find((o) => o.id === target.id);
          if (!op) return d;
          const frame = runFrame(d, op.wall);
          if (!frame) return d;
          const delta = dr.viewKind === "plan" ? dx * frame.u.x + dy * frame.u.y : dx;
          const next = Math.max(0, Math.min(frame.length - op.width, snap(dr.startOffset + delta, 0.5)));
          return { ...d, openings: d.openings.map((o) => (o.id === op.id ? { ...o, offset: next } : o)) };
        }
        return d;
      });
    };
    const up = () => {
      const dr = drag.current;
      if (dr?.moved) commit();
      else if (dr?.cycleTo) setSelectedId(dr.cycleTo);
      drag.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [begin, preview, commit]);

  // ---------- keyboard ----------
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        removeSelected();
        return;
      }
      if (e.key === "Escape") {
        setSelectedId(null);
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") {
        if (!selectedId) return;
        e.preventDefault();
        const step = e.shiftKey ? 3 : 0.5;
        const sign = e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1;
        if (selectedIsland) {
          const horiz = e.key === "ArrowLeft" || e.key === "ArrowRight";
          updateIsland(selectedIsland.id, horiz ? { x: selectedIsland.x + sign * (e.shiftKey ? 6 : 1) } : { y: selectedIsland.y + sign * (e.shiftKey ? 6 : 1) });
        } else if (selectedItem) updateItem(selectedItem.id, { offset: selectedItem.offset + sign * step });
        else if (selectedOpening) updateOpening(selectedOpening.id, { offset: selectedOpening.offset + sign * step });
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [undo, redo, removeSelected, selectedId, selectedIsland, selectedItem, selectedOpening, updateIsland, updateItem, updateOpening]);

  // ---------- printing ----------
  useEffect(() => {
    if (!printing) return;
    const done = () => setPrinting(false);
    window.addEventListener("afterprint", done);
    const t = window.setTimeout(() => window.print(), 150);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("afterprint", done);
    };
  }, [printing]);

  const record: DesignRecord = { ...initial, ...meta, data: design, updated_at: new Date().toISOString() };

  const runs = [...WALLS.map((w) => ({ id: w as string, label: `Wall ${w}` })), ...design.islands.map((i) => ({ id: i.id, label: i.name }))];

  // ---------- render ----------
  return (
    <div className="editor">
      <header className="topbar no-print">
        <Link href={backHref} className="topbar-back" aria-label="Back to designs">
          <Brand size={22} />
        </Link>
        <input
          className="topbar-name"
          value={meta.name}
          onChange={(e) => setMeta((m) => ({ ...m, name: e.target.value }))}
          aria-label="Design name"
        />
        <span className={`save-pill save-${save}`} onClick={() => save === "error" && setRetry((n) => n + 1)} role={save === "error" ? "button" : undefined}>
          {save === "saved" && "Saved"}
          {save === "unsaved" && "Unsaved changes"}
          {save === "saving" && "Saving..."}
          {save === "error" && "Not saved. Click to retry."}
          {save === "local" && "Sandbox. Not saved."}
        </span>
        <div className="topbar-actions">
          <button className="btn btn-ghost" onClick={undo} disabled={!history.canUndo} title="Undo (Ctrl/Cmd+Z)">
            Undo
          </button>
          <button className="btn btn-ghost" onClick={redo} disabled={!history.canRedo} title="Redo (Ctrl/Cmd+Shift+Z)">
            Redo
          </button>
          <button className="btn btn-primary" onClick={() => setPrinting(true)}>
            Print / PDF
          </button>
        </div>
      </header>

      <div className="editor-body no-print">
        {/* ---------- left panel ---------- */}
        <aside className="panel panel-left">
          <nav className="tabs" role="tablist">
            {(
              [
                ["cabinets", "Cabinets"],
                ["openings", "Doors & Windows"],
                ["room", "Room"],
                ["details", "Customer"],
                ...(uploadPhoto ? ([["photos", "Photos"]] as const) : []),
              ] as [Tab, string][]
            ).map(([t, label]) => (
              <button key={t} role="tab" aria-selected={tab === t} className={`tab ${tab === t ? "tab-on" : ""}`} onClick={() => setTab(t)}>
                {label}
              </button>
            ))}
          </nav>

          {(tab === "cabinets" || tab === "openings") && (
            <div className="run-picker">
              <span className="field-label">{tab === "cabinets" ? "Add to" : "Add on"}</span>
              <div className="chips">
                {runs
                  .filter((r) => tab === "cabinets" || isWall(r.id))
                  .map((r) => (
                    <button
                      key={r.id}
                      className={`chip ${activeRunValid === r.id ? "chip-on" : ""}`}
                      onClick={() => {
                        setActiveRun(r.id);
                        if (viewValid !== "plan") setView(r.id);
                      }}
                    >
                      {r.label}
                    </button>
                  ))}
              </div>
            </div>
          )}

          {tab === "cabinets" && (
            <div className="panel-scroll">
              {(Object.keys(CATEGORY_LABEL) as Category[]).map((cat) => {
                const cabs = activeCatalog.cabinets.filter((c) => c.category === cat).sort((a, b) => a.sort - b.sort);
                if (!cabs.length) return null;
                return (
                  <section key={cat} className="cat-group">
                    <h3 className="cat-title">{CATEGORY_LABEL[cat]}</h3>
                    {cabs.map((c) => (
                      <div key={c.id} className="cat-card">
                        <div className="cat-head">
                          {c.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={c.image_url} alt="" className="cat-thumb" />
                          ) : (
                            <span className="cat-code">{c.code}</span>
                          )}
                          <div>
                            <div className="cat-name">{c.name}</div>
                            <div className="cat-sub">
                              {fmtIn(c.depth)} deep{c.mount_height ? ` · hung at ${fmtIn(c.mount_height)}` : ""}
                            </div>
                          </div>
                        </div>
                        <div className="chips chips-sizes">
                          {c.widths.map((w) => (
                            <button key={w} className="chip chip-size" onClick={() => addCabinet(c, w)} title={`Add ${c.code}${w} to ${runLabel(design, activeRunValid)}`}>
                              {fmtIn(w, false)}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </section>
                );
              })}
              {!activeCatalog.cabinets.length && <p className="muted">The catalog is empty. Add cabinets on the Catalog page.</p>}
            </div>
          )}

          {tab === "openings" && (
            <div className="panel-scroll">
              <p className="muted">Adds to {runLabel(design, isWall(activeRunValid) ? activeRunValid : "A")}. Drag it into place or type the exact position.</p>
              <div className="stack">
                <button className="btn btn-secondary" onClick={() => addOpening("door")}>
                  Add door
                </button>
                <button className="btn btn-secondary" onClick={() => addOpening("window")}>
                  Add window
                </button>
                <button className="btn btn-secondary" onClick={() => addOpening("opening")}>
                  Add open doorway
                </button>
              </div>
              <h3 className="cat-title">On the walls</h3>
              <ul className="list">
                {design.openings.map((o) => (
                  <li key={o.id}>
                    <button className={`list-btn ${selectedId === o.id ? "list-on" : ""}`} onClick={() => setSelectedId(o.id)}>
                      {o.type === "door" ? "Door" : o.type === "window" ? "Window" : "Doorway"} · Wall {o.wall} · {fmtIn(o.width)}
                    </button>
                  </li>
                ))}
                {!design.openings.length && <li className="muted">None yet.</li>}
              </ul>
            </div>
          )}

          {tab === "room" && (
            <div className="panel-scroll">
              <div className="grid2">
                <LengthInput id="room-w" label="Width (Walls A, C)" value={design.room.width} min={36} max={1200} onChange={(v) => apply((d) => ({ ...d, room: { ...d.room, width: v } }))} />
                <LengthInput id="room-d" label="Depth (Walls B, D)" value={design.room.depth} min={36} max={1200} onChange={(v) => apply((d) => ({ ...d, room: { ...d.room, depth: v } }))} />
                <LengthInput id="room-h" label="Ceiling height" value={design.room.ceiling} min={72} max={240} onChange={(v) => apply((d) => ({ ...d, room: { ...d.room, ceiling: v } }))} />
                <LengthInput id="room-t" label="Wall thickness" value={design.room.wallThickness} min={2} max={16} onChange={(v) => apply((d) => ({ ...d, room: { ...d.room, wallThickness: v } }))} />
              </div>
              <p className="muted">Walls are lettered clockwise from the top of the top view. Each front view is drawn as if you stand in the room facing that wall.</p>
              <h3 className="cat-title">Islands</h3>
              <ul className="list">
                {design.islands.map((i) => (
                  <li key={i.id}>
                    <button className={`list-btn ${selectedId === i.id ? "list-on" : ""}`} onClick={() => setSelectedId(i.id)}>
                      {i.name}
                    </button>
                  </li>
                ))}
              </ul>
              <button className="btn btn-secondary" onClick={addIsland}>
                Add island
              </button>
            </div>
          )}

          {tab === "details" && (
            <div className="panel-scroll stack">
              {(
                [
                  ["customer_name", "Customer name"],
                  ["customer_phone", "Phone"],
                  ["customer_address", "Job address"],
                  ["designer_name", "Designer"],
                ] as [keyof Meta, string][]
              ).map(([k, label]) => (
                <label key={k} className="field">
                  <span className="field-label">{label}</span>
                  <input className="input" value={meta[k] ?? ""} onChange={(e) => setMeta((m) => ({ ...m, [k]: e.target.value || null }))} />
                </label>
              ))}
              <label className="field">
                <span className="field-label">Notes for the print sheet</span>
                <textarea className="input" rows={5} value={meta.notes ?? ""} onChange={(e) => setMeta((m) => ({ ...m, notes: e.target.value || null }))} />
              </label>
            </div>
          )}

          {tab === "photos" && uploadPhoto && <PhotosPanel design={design} apply={apply} uploadPhoto={uploadPhoto} flash={flash} />}
        </aside>

        {/* ---------- canvas ---------- */}
        <main className="canvas">
          <div className="view-tabs">
            <button className={`chip ${viewValid === "plan" ? "chip-on" : ""}`} onClick={() => setView("plan")}>
              Top view
            </button>
            {runs.map((r) => (
              <button
                key={r.id}
                className={`chip ${viewValid === r.id ? "chip-on" : ""}`}
                onClick={() => {
                  setView(r.id);
                  setActiveRun(r.id);
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="canvas-stage">
            {viewValid === "plan" ? (
              <PlanView
                design={design}
                catalog={catalog}
                selectedId={selectedId}
                problemIds={problemIds}
                selectedRun={activeRunValid}
                onTargetDown={(e, t) => handleTargetDown("plan", e, t)}
                onBackgroundDown={() => setSelectedId(null)}
                className="stage-svg"
              />
            ) : (
              <ElevationView
                design={design}
                catalog={catalog}
                run={viewValid}
                selectedId={selectedId}
                problemIds={problemIds}
                onTargetDown={(e, t) => handleTargetDown("elev", e, t)}
                onBackgroundDown={() => setSelectedId(null)}
                className="stage-svg"
              />
            )}
          </div>
          <div className="canvas-foot">
            {notice && <div className="notice">{notice}</div>}
            {problems.length > 0 ? (
              <ul className="problems">
                {problems.slice(0, 6).map((p, i) => (
                  <li key={i}>
                    <button className="problem-btn" onClick={() => setSelectedId(p.ids[0])}>
                      {p.message}
                    </button>
                  </li>
                ))}
                {problems.length > 6 && <li className="muted">and {problems.length - 6} more</li>}
              </ul>
            ) : (
              <span className="muted">
                Drag pieces to move them. Arrow keys nudge 1/2&quot; (Shift for 3&quot;). Delete removes the selected piece.
              </span>
            )}
          </div>
        </main>

        {/* ---------- inspector ---------- */}
        <aside className="panel panel-right">
          {selectedItem ? (
            <ItemInspector
              key={selectedItem.id}
              item={selectedItem}
              design={design}
              catalog={activeCatalog}
              runs={runs}
              update={(patch) => updateItem(selectedItem.id, patch)}
              remove={removeSelected}
              duplicate={() => {
                const copy: PlacedItem = { ...selectedItem, id: uid() };
                copy.offset = firstFreeOffset(design, copy.run, copy.width, [copy.mountHeight, copy.mountHeight + copy.height]);
                apply((d) => ({ ...d, items: [...d.items, copy] }));
                setSelectedId(copy.id);
              }}
            />
          ) : selectedOpening ? (
            <OpeningInspector key={selectedOpening.id} op={selectedOpening} design={design} update={(patch) => updateOpening(selectedOpening.id, patch)} remove={removeSelected} />
          ) : selectedIsland ? (
            <IslandInspector key={selectedIsland.id} island={selectedIsland} update={(patch) => updateIsland(selectedIsland.id, patch)} remove={removeSelected} />
          ) : (
            <DesignInspector design={design} catalog={activeCatalog} apply={apply} />
          )}
        </aside>
      </div>

      {printing && (
        <div className="print-only">
          <PrintSheet record={record} catalog={catalog} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Swatch({ color, image, size = 22 }: { color: string; image: string | null; size?: number }) {
  return <span className="swatch" style={{ width: size, height: size, background: image ? `center / cover url(${image})` : color }} />;
}

function ItemInspector({
  item,
  design,
  catalog,
  runs,
  update,
  remove,
  duplicate,
}: {
  item: PlacedItem;
  design: DesignData;
  catalog: Catalog;
  runs: { id: string; label: string }[];
  update: (p: Partial<PlacedItem>) => void;
  remove: () => void;
  duplicate: () => void;
}) {
  const cab = catalog.cabinets.find((c) => c.id === item.cabinetId);
  const widths = cab?.widths ?? [item.width];
  const heights = cab?.heights ?? [item.height];
  const frame = runFrame(design, item.run);
  const wallHung = item.mountHeight > 0;
  const hasDoors = !["drawer_base", "range", "dishwasher", "hood", "filler", "panel"].includes(item.style);
  const isBlind = item.style === "blind_corner_base" || item.style === "wall_blind_corner";
  const rightGap = frame && isWall(item.run) ? frame.length - item.offset - item.width : null;

  return (
    <div className="inspector">
      <div className="insp-head">
        <div className="insp-label">{itemLabel(item)}</div>
        <div className="muted">{item.name}</div>
      </div>

      <label className="field">
        <span className="field-label">Location</span>
        <select
          className="input"
          value={item.run}
          onChange={(e) => {
            const run = e.target.value;
            const offset = firstFreeOffset({ ...design, items: design.items.filter((i) => i.id !== item.id) }, run, item.width, [item.mountHeight, item.mountHeight + item.height]);
            update({ run, offset });
          }}
        >
          {runs
            .filter((r) => isWall(r.id) || !wallHung)
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
        </select>
      </label>

      <div className="field">
        <span className="field-label">Width</span>
        <div className="chips">
          {widths.map((w) => (
            <button key={w} className={`chip chip-size ${item.width === w ? "chip-on" : ""}`} onClick={() => update({ width: w })}>
              {fmtIn(w, false)}
            </button>
          ))}
        </div>
      </div>
      {heights.length > 1 && (
        <div className="field">
          <span className="field-label">Height</span>
          <div className="chips">
            {heights.map((h) => (
              <button key={h} className={`chip chip-size ${item.height === h ? "chip-on" : ""}`} onClick={() => update({ height: h })}>
                {fmtIn(h, false)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid2">
        <LengthInput id="it-off" label="From left end" value={item.offset} onChange={(v) => update({ offset: v })} hint={rightGap !== null ? `${fmtIn(rightGap)} to right end` : undefined} />
        <LengthInput id="it-w" label="Exact width" value={item.width} min={0.5} max={120} onChange={(v) => update({ width: v })} />
        <LengthInput id="it-d" label="Depth" value={item.depth} min={0.5} max={48} onChange={(v) => update({ depth: v })} />
        {wallHung ? (
          <LengthInput id="it-m" label="Floor to bottom" value={item.mountHeight} min={1} max={design.room.ceiling} onChange={(v) => update({ mountHeight: v })} />
        ) : (
          <LengthInput id="it-h" label="Height" value={item.height} min={1} max={design.room.ceiling} onChange={(v) => update({ height: v })} />
        )}
      </div>

      {(hasDoors || isBlind) && (
        <div className="field">
          <span className="field-label">{isBlind ? "Blind side" : "Hinge side (single door)"}</span>
          <div className="chips">
            {(["left", "right"] as const).map((h) => (
              <button key={h} className={`chip ${item.hinge === h ? "chip-on" : ""}`} onClick={() => update({ hinge: h })}>
                {h === "left" ? "Left" : "Right"}
              </button>
            ))}
          </div>
        </div>
      )}

      {item.category !== "appliance" && (
        <div className="field">
          <span className="field-label">Color</span>
          <div className="swatch-grid">
            <button className={`swatch-btn ${item.finishId === null ? "swatch-on" : ""}`} onClick={() => update({ finishId: null })}>
              <span className="swatch swatch-default">All</span>
              <span>Same as design</span>
            </button>
            {catalog.finishes.map((f) => (
              <button key={f.id} className={`swatch-btn ${item.finishId === f.id ? "swatch-on" : ""}`} onClick={() => update({ finishId: f.id })}>
                <Swatch color={f.color_hex} image={f.image_url} />
                <span>{f.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="insp-actions">
        <button className="btn btn-secondary" onClick={duplicate}>
          Duplicate
        </button>
        <button className="btn btn-danger" onClick={remove}>
          Remove
        </button>
      </div>
    </div>
  );
}

function OpeningInspector({ op, design, update, remove }: { op: Opening; design: DesignData; update: (p: Partial<Opening>) => void; remove: () => void }) {
  const len = wallLength(design.room, op.wall);
  return (
    <div className="inspector">
      <div className="insp-head">
        <div className="insp-label">{op.type === "door" ? "Door" : op.type === "window" ? "Window" : "Open doorway"}</div>
        <div className="muted">Wall {op.wall}</div>
      </div>
      <label className="field">
        <span className="field-label">Wall</span>
        <select className="input" value={op.wall} onChange={(e) => update({ wall: e.target.value as Opening["wall"], offset: 0 })}>
          {WALLS.map((w) => (
            <option key={w} value={w}>
              Wall {w}
            </option>
          ))}
        </select>
      </label>
      <div className="grid2">
        <LengthInput id="op-off" label="From left end" value={op.offset} min={0} max={len} onChange={(v) => update({ offset: v })} hint={`${fmtIn(len - op.offset - op.width)} to right end`} />
        <LengthInput id="op-w" label="Width" value={op.width} min={6} max={len} onChange={(v) => update({ width: v })} />
        <LengthInput id="op-h" label="Height" value={op.height} min={6} max={design.room.ceiling} onChange={(v) => update({ height: v })} />
        {op.type === "window" && <LengthInput id="op-s" label="Floor to sill" value={op.sill} min={0} max={design.room.ceiling} onChange={(v) => update({ sill: v })} />}
      </div>
      {op.type === "door" && (
        <div className="field">
          <span className="field-label">Hinge side (facing the wall)</span>
          <div className="chips">
            {(["left", "right"] as const).map((h) => (
              <button key={h} className={`chip ${op.hinge === h ? "chip-on" : ""}`} onClick={() => update({ hinge: h })}>
                {h === "left" ? "Left" : "Right"}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="insp-actions">
        <button className="btn btn-danger" onClick={remove}>
          Remove
        </button>
      </div>
    </div>
  );
}

function IslandInspector({ island, update, remove }: { island: Island; update: (p: Partial<Island>) => void; remove: () => void }) {
  return (
    <div className="inspector">
      <div className="insp-head">
        <div className="insp-label">{island.name}</div>
        <div className="muted">Drag it in the top view, or type its position.</div>
      </div>
      <label className="field">
        <span className="field-label">Name</span>
        <input className="input" value={island.name} onChange={(e) => update({ name: e.target.value || "Island" })} />
      </label>
      <div className="grid2">
        <LengthInput id="is-x" label="From Wall D" value={island.x} onChange={(v) => update({ x: v })} hint="Back left corner" />
        <LengthInput id="is-y" label="From Wall A" value={island.y} onChange={(v) => update({ y: v })} />
      </div>
      <div className="field">
        <span className="field-label">Cabinet fronts face</span>
        <div className="chips">
          {(
            [
              [0, "Wall C"],
              [90, "Wall D"],
              [180, "Wall A"],
              [270, "Wall B"],
            ] as [Island["rotation"], string][]
          ).map(([r, label]) => (
            <button key={r} className={`chip ${island.rotation === r ? "chip-on" : ""}`} onClick={() => update({ rotation: r })}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="insp-actions">
        <button className="btn btn-danger" onClick={remove}>
          Remove island
        </button>
      </div>
    </div>
  );
}

function DesignInspector({ design, catalog, apply }: { design: DesignData; catalog: Catalog; apply: (fn: (d: DesignData) => DesignData) => void }) {
  const finishId = design.finishId ?? catalog.finishes[0]?.id ?? null;
  const counterId = design.countertopId ?? catalog.countertops[0]?.id ?? null;
  return (
    <div className="inspector">
      <div className="insp-head">
        <div className="insp-label">Design</div>
        <div className="muted">Click a piece to edit it. Click a wall letter to choose where new pieces go.</div>
      </div>
      <div className="field">
        <span className="field-label">Cabinet color</span>
        <div className="swatch-grid">
          {catalog.finishes.map((f) => (
            <button key={f.id} className={`swatch-btn ${finishId === f.id ? "swatch-on" : ""}`} onClick={() => apply((d) => ({ ...d, finishId: f.id }))}>
              <Swatch color={f.color_hex} image={f.image_url} />
              <span>{f.name}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span className="field-label">Countertop</span>
        <div className="swatch-grid">
          {catalog.countertops.map((c) => (
            <button key={c.id} className={`swatch-btn ${counterId === c.id ? "swatch-on" : ""}`} onClick={() => apply((d) => ({ ...d, countertopId: c.id }))}>
              <Swatch color={c.color_hex} image={c.image_url} />
              <span>{c.name}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="insp-stats">
        <div>
          <b className="tabular">{design.items.filter((i) => i.category !== "appliance").length}</b> cabinets and fillers
        </div>
        <div>
          <b className="tabular">{design.items.filter((i) => i.category === "appliance").length}</b> appliances
        </div>
      </div>
    </div>
  );
}

function PhotosPanel({
  design,
  apply,
  uploadPhoto,
  flash,
}: {
  design: DesignData;
  apply: (fn: (d: DesignData) => DesignData) => void;
  uploadPhoto: (file: File) => Promise<string>;
  flash: (m: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="panel-scroll stack">
      <p className="muted">Photos of the existing kitchen. They print on the last page.</p>
      <label className="btn btn-secondary">
        {busy ? "Uploading..." : "Add photos"}
        <input
          type="file"
          accept="image/*"
          multiple
          hidden
          disabled={busy}
          onChange={async (e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            if (!files.length) return;
            setBusy(true);
            try {
              for (const f of files) {
                const url = await uploadPhoto(f);
                apply((d) => ({ ...d, photos: [...d.photos, { id: uid(), url, caption: "" }] }));
              }
            } catch {
              flash("A photo did not upload. Try again.");
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      <div className="photo-list">
        {design.photos.map((p) => (
          <div key={p.id} className="photo-card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt={p.caption || "Site photo"} />
            <input
              className="input"
              placeholder="Caption"
              value={p.caption}
              onChange={(e) => apply((d) => ({ ...d, photos: d.photos.map((x) => (x.id === p.id ? { ...x, caption: e.target.value } : x)) }))}
            />
            <button className="btn btn-ghost" onClick={() => apply((d) => ({ ...d, photos: d.photos.filter((x) => x.id !== p.id) }))}>
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
