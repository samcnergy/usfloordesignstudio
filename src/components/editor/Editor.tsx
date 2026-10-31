"use client";

// The kitchen designer. Left: room, cabinets, doors and windows, photos.
// Center: top view or a front view. Right: the selected piece.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Brand } from "@/components/Brand";
import { ElevationView, type DrawTarget } from "@/components/drawing/ElevationView";
import { PlanView } from "@/components/drawing/PlanView";
import { PrintSheet } from "@/components/print/PrintSheet";
import {
  angleGap,
  findProblems,
  firstFreeOffset,
  isWall,
  itemLabel,
  itemQuad,
  roomCenter,
  roomShape,
  runFrame,
  runLabel,
  wallLabel,
  wallLength,
  wrapAngle,
  type Vec,
} from "@/lib/geometry";
import { cabinetTop, dragInPlan, dropEmptyRuns, floorSpotFor, itemRun, levelWallCabinets, moveRun, putOnFloor, setCrown, slideAlongRun, standsAlone, turnPivot, turnRun } from "@/lib/place";
import type { Catalog, Category, DesignData, DesignRecord, ExtraItem, Island, Opening, OpeningType, PlacedItem, Product, ProductLine, Room } from "@/lib/types";
import { useHistory } from "@/lib/useHistory";
import { fmtIn, snap } from "@/lib/units";
import { DrawRoom } from "./DrawRoom";
import { LengthInput } from "./LengthInput";
import { RoomPanel } from "./RoomPanel";

type Meta = Pick<DesignRecord, "name" | "customer_name" | "customer_phone" | "customer_address" | "designer_name" | "notes">;
type SaveState = "saved" | "unsaved" | "saving" | "error" | "local";
type Tab = "room" | "cabinets" | "openings" | "photos" | "details";

const CATEGORY_LABEL: Record<Category, string> = {
  base: "Base cabinets",
  wall: "Wall cabinets",
  tall: "Tall cabinets",
  vanity: "Vanities",
  filler: "Fillers",
  panel: "Panels",
  appliance: "Appliances",
  accessory: "Order items (not drawn)",
};
const CATEGORY_ORDER: Category[] = ["base", "wall", "tall", "vanity", "filler", "panel", "appliance", "accessory"];

/** "Top King American Style", or just the line name for the generic appliance line. */
export function lineTitle(catalog: Catalog, line: ProductLine | undefined): string {
  if (!line) return "";
  const maker = catalog.manufacturers.find((m) => m.id === line.manufacturer_id);
  return maker && maker.name !== "Generic" ? `${maker.name} ${line.name}` : line.name;
}

function dims(p: Pick<Product, "width" | "height" | "depth">): string {
  if (p.width === null) return "";
  return [p.width, p.height, p.depth].map((v) => (v === null ? "?" : fmtIn(v, false))).join(" x ");
}

/** Crown, light rail and other molding that sits on top of the wall cabinets. */
function isCrown(p: Pick<Product, "sku" | "name" | "description">): boolean {
  return /crown|cornice/i.test(`${p.sku} ${p.name} ${p.description ?? ""}`);
}

/**
 * How tall the molding stands on the cabinet. Molding is listed by its profile size
 * in the SKU (CM4 is a 4" crown) and its catalog sizes are the stick, so the SKU wins,
 * then a width or height that reads like a profile, then a standard 3 1/2".
 */
function crownHeight(p: Pick<Product, "sku" | "width" | "height">): number {
  const fromSku = Number(p.sku.match(/(\d+(?:\.\d+)?)/)?.[1]);
  for (const v of [fromSku, p.width, p.height]) if (v !== null && Number.isFinite(v) && v >= 1 && v <= 9) return v;
  return 3.5;
}

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
  const [previewing, setPreviewing] = useState(false);
  const [drawing, setDrawing] = useState(false);

  const activeCatalog = useMemo<Catalog>(
    () => ({
      manufacturers: catalog.manufacturers.filter((m) => m.active),
      lines: catalog.lines.filter((l) => l.active),
      products: catalog.products.filter((p) => p.active),
      finishes: catalog.finishes.filter((f) => f.active),
      countertops: catalog.countertops.filter((c) => c.active),
    }),
    [catalog],
  );

  // cabinet lines are the lines with something other than appliances in them
  const cabinetLines = useMemo(
    () => activeCatalog.lines.filter((l) => activeCatalog.products.some((p) => p.line_id === l.id && p.category !== "appliance")),
    [activeCatalog],
  );
  const designLineId = design.lineId && cabinetLines.some((l) => l.id === design.lineId) ? design.lineId : (cabinetLines[0]?.id ?? null);
  const [pickerLine, setPickerLine] = useState<string | null>(null);
  const pickerLineId = pickerLine && activeCatalog.lines.some((l) => l.id === pickerLine) ? pickerLine : designLineId;
  const [search, setSearch] = useState("");

  const problems = useMemo(() => findProblems(design), [design]);
  const problemIds = useMemo(() => new Set(problems.flatMap((p) => p.ids)), [problems]);

  const selectedItem = design.items.find((i) => i.id === selectedId) ?? null;
  const selectedOpening = design.openings.find((o) => o.id === selectedId) ?? null;
  const selectedIsland = design.islands.find((i) => i.id === selectedId) ?? null;

  // keep the active run valid if an island is removed
  const firstWall = design.room.walls[0].id;
  const activeRunValid = isWall(design.room, activeRun) || design.islands.some((i) => i.id === activeRun) ? activeRun : firstWall;
  const viewValid = view === "plan" || isWall(design.room, view) || design.islands.some((i) => i.id === view) ? view : "plan";

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
    (id: string, patch: Partial<PlacedItem>) => apply((d) => dropEmptyRuns({ ...d, items: d.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) })),
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
    apply((d) =>
      dropEmptyRuns({
        ...d,
        items: d.items.filter((i) => i.id !== selectedId && i.run !== selectedId),
        openings: d.openings.filter((o) => o.id !== selectedId),
        islands: d.islands.filter((i) => i.id !== selectedId),
      }),
    );
    setSelectedId(null);
  }, [apply, selectedId]);

  /** Lifts a piece off its wall onto a floor run of its own, out in front of where it stood. */
  const liftOntoFloor = useCallback(
    (item: PlacedItem) => {
      if (item.mountHeight > 0) {
        flash("Wall cabinets and hoods hang on a wall, so they stay on one.");
        return;
      }
      const runId = uid();
      apply((d) => {
        const it = d.items.find((i) => i.id === item.id);
        return it ? putOnFloor(d, it.id, floorSpotFor(d, it), runId) : d;
      });
      setActiveRun(runId);
    },
    [apply, flash],
  );

  const addProduct = (p: Product) => {
    if (!p.placeable || p.width === null || p.height === null || p.depth === null) {
      addExtra(p);
      return;
    }
    const run = activeRunValid;
    const mount = p.mount_height ?? 0;
    if (!isWall(design.room, run) && (p.category === "wall" || p.style === "hood" || mount > 0)) {
      flash("Wall-hung pieces go on a wall. Pick a wall first.");
      return;
    }
    if (roomShape(design.room).walls.some((w) => w.id === run && w.open) && (p.category === "wall" || p.style === "hood" || mount > 0)) {
      flash(`${wallLabel(design.room, run)} is open, so there is nothing to hang this on. Pick another wall.`);
      return;
    }
    const width = p.width;
    const height = p.height;
    let offset = firstFreeOffset(design, run, width, [mount, mount + height]);
    if (p.style === "hood") {
      // center a new hood over the first range on this run that has no hood yet
      const hoods = design.items.filter((i) => i.run === run && i.style === "hood");
      const range = design.items
        .filter((i) => i.run === run && i.style === "range")
        .sort((a, b) => a.offset - b.offset)
        .find((r) => !hoods.some((h) => h.offset < r.offset + r.width && r.offset < h.offset + h.width));
      if (range) offset = range.offset + (range.width - width) / 2;
    }
    // Wall cabinets, bridges included, run to the top: flush with the ceiling, or just
    // under the crown molding when the design has some. Anything else hangs where the
    // catalog says, but never through the ceiling.
    let mountHeight = mount;
    if (mountHeight > 0) {
      mountHeight = p.category === "wall" ? Math.max(0, cabinetTop(design) - height) : Math.min(mountHeight, Math.max(0, design.room.ceiling - height));
    }
    const line = activeCatalog.lines.find((l) => l.id === p.line_id);
    const item: PlacedItem = {
      id: uid(),
      productId: p.id,
      code: p.sku,
      name: p.name,
      lineName: lineTitle(activeCatalog, line),
      category: p.category,
      style: p.style,
      run,
      offset,
      width,
      height,
      depth: p.depth,
      mountHeight,
      doors: p.doors,
      drawers: p.drawers,
      splitHeight: p.split_height,
      finishId: null,
      hinge: "left",
    };
    apply((d) => ({
      ...d,
      items: [...d.items, item],
      // the first cabinet sets the design's line if none was chosen yet
      lineId: d.lineId ?? (p.category !== "appliance" ? p.line_id : d.lineId),
    }));
    setSelectedId(item.id);
    if (isWall(design.room, run) && offset + width > wallLength(design.room, run)) flash(`No room left on ${wallLabel(design.room, run)}. The piece is placed past the end; move or resize it.`);
  };

  /** Change the design's cabinet line and move every placed cabinet to the same SKU in that line where it exists. */
  const switchLine = (lineId: string) => {
    const line = activeCatalog.lines.find((l) => l.id === lineId);
    const first = activeCatalog.finishes.find((f) => f.line_id === lineId);
    const missing: string[] = [];
    let moved = 0;
    const items = design.items.map((it) => {
      const prod = activeCatalog.products.find((p) => p.id === it.productId);
      if (!prod || prod.category === "appliance" || prod.line_id === lineId) return it;
      const match = activeCatalog.products.find((p) => p.line_id === lineId && p.placeable && p.sku.toUpperCase() === prod.sku.toUpperCase());
      if (!match || match.width === null || match.height === null || match.depth === null) {
        missing.push(prod.sku);
        return it;
      }
      moved++;
      return {
        ...it,
        productId: match.id,
        code: match.sku,
        name: match.name,
        lineName: lineTitle(activeCatalog, line),
        category: match.category,
        style: match.style,
        width: match.width,
        height: match.height,
        depth: match.depth,
        doors: match.doors,
        drawers: match.drawers,
        splitHeight: match.split_height,
        finishId: null,
      };
    });
    apply((d) => ({ ...d, lineId, finishId: first?.id ?? d.finishId, items }));
    setPickerLine(lineId);
    if (moved || missing.length) {
      const uniq = [...new Set(missing)];
      flash(
        `${moved} piece${moved === 1 ? "" : "s"} moved to ${line?.name ?? "the new line"}.` +
          (uniq.length ? ` No match for ${uniq.slice(0, 6).join(", ")}${uniq.length > 6 ? "..." : ""}; those stay as they were. Pick replacements from Other sizes.` : ""),
      );
    }
  };

  const addExtra = (p: Product) => {
    const line = activeCatalog.lines.find((l) => l.id === p.line_id);
    // Crown molding sits on top of the wall cabinets, so the first piece of it
    // drops them far enough to leave room for it.
    const crown = isCrown(p) && !design.crown ? crownHeight(p) : 0;
    apply((d) => {
      const withCrown = crown ? setCrown(d, crown) : d;
      const existing = withCrown.extras.find((x) => x.productId === p.id && x.finishId === null);
      if (existing) return { ...withCrown, extras: withCrown.extras.map((x) => (x === existing ? { ...x, qty: x.qty + 1 } : x)) };
      const extra: ExtraItem = { id: uid(), productId: p.id, code: p.sku, name: p.name, lineName: lineTitle(activeCatalog, line), qty: 1, finishId: null };
      return { ...withCrown, extras: [...withCrown.extras, extra] };
    });
    flash(
      crown
        ? `${p.sku} added to the order list. The wall cabinets dropped to ${fmtIn(design.room.ceiling - crown)} so the ${fmtIn(crown)} crown fits above them.`
        : `${p.sku} added to the order list. It prints with the cabinet list but is not drawn.`,
    );
  };

  /** Swap a placed piece for another catalog product, keeping its place in the run. */
  const swapProduct = (item: PlacedItem, p: Product) => {
    if (p.width === null || p.height === null || p.depth === null) return;
    updateItem(item.id, {
      productId: p.id,
      code: p.sku,
      name: p.name,
      category: p.category,
      style: p.style,
      width: p.width,
      height: p.height,
      depth: p.depth,
      doors: p.doors,
      drawers: p.drawers,
      splitHeight: p.split_height,
      mountHeight: p.mount_height ?? (item.mountHeight > 0 && p.category === "wall" ? item.mountHeight : 0),
    });
  };

  const addOpening = (type: OpeningType) => {
    const solid = roomShape(design.room).walls.filter((w) => !w.open);
    const wall = solid.some((w) => w.id === activeRunValid) ? activeRunValid : solid[0]?.id;
    if (!wall) {
      flash("Every wall is open. Turn one back into a wall in the Room tab first.");
      return;
    }
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
      x: Math.round(roomCenter(design.room).x - 36),
      y: Math.round(roomCenter(design.room).y - 12),
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
    startAngle: number; // turning a run: the run's angle when the drag started
    pivot: Vec | null; // turning a run: the point it swings around
    grabAngle: number; // turning a run: where the pointer was, around the pivot
    newRunId: string; // used if the piece comes off its wall onto the floor
    landedOn: string | null; // the run the piece ended up on, so new pieces follow it there
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
    if (target.kind === "turn") {
      // the grip turns the run; whatever is selected stays selected
      const svg = (e.currentTarget as SVGElement).ownerSVGElement;
      const pivot = turnPivot(design, target.id);
      const run = design.islands.find((i) => i.id === target.id);
      if (!svg || !pivot || !run || e.button !== 0) return;
      const start = svgPoint(svg, e.clientX, e.clientY);
      drag.current = {
        target,
        svg,
        viewKind,
        start,
        startOffset: 0,
        startXY: { x: run.x, y: run.y },
        startAngle: run.rotation,
        pivot,
        grabAngle: (Math.atan2(start.y - pivot.y, start.x - pivot.x) * 180) / Math.PI,
        newRunId: uid(),
        landedOn: null,
        moved: false,
        cycleTo: null,
      };
      return;
    }
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
          return insideQuad(p, itemQuad(it, f));
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
      startAngle: 0,
      pivot: null,
      grabAngle: 0,
      newRunId: uid(),
      landedOn: null,
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
        preview((d) => moveRun(d, target.id, dr.startXY.x + dx, dr.startXY.y + dy));
        return;
      }
      if (target.kind === "turn") {
        const pivot = dr.pivot;
        if (!pivot) return;
        const now = (Math.atan2(p.y - pivot.y, p.x - pivot.x) * 180) / Math.PI;
        const raw = dr.startAngle + now - dr.grabAngle;
        // free turning with Shift or Alt held, otherwise every 15 degrees
        const angle = e.shiftKey || e.altKey ? wrapAngle(raw) : wrapAngle(snap(raw, 15));
        preview((d) => turnRun(d, target.id, angle));
        return;
      }
      preview((d) => {
        if (target.kind === "item") {
          const next = dr.viewKind === "plan" ? dragInPlan(d, target.id, dx, dy, dr.newRunId) : slideAlongRun(d, target.id, dx);
          // note where it landed: a piece dragged onto the floor takes the "add here" target with it
          dr.landedOn = next.items.find((i) => i.id === target.id)?.run ?? null;
          return next;
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
      if (dr?.moved) {
        commit();
        if (dr.landedOn) setActiveRun(dr.landedOn);
      } else if (dr?.cycleTo) setSelectedId(dr.cycleTo);
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

  // ---------- drawing the room ----------
  // pieces stay on the wall with the same letter, so a redrawn room needs at least that many walls
  const minWalls = Math.max(
    3,
    ...design.room.walls.map((w, i) => (design.items.some((it) => it.run === w.id) || design.openings.some((o) => o.wall === w.id) ? i + 1 : 0)),
  );
  const startDrawing = () => {
    setSelectedId(null);
    setView("plan");
    setDrawing(true);
  };
  const finishDrawing = (room: Room) => {
    apply((d) => ({ ...d, room }));
    setDrawing(false);
    setActiveRun(room.walls[0].id);
  };

  // ---------- keyboard ----------
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (drawing) return; // the drawing tool has its own keys
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
        if (previewing) setPreviewing(false);
        else setSelectedId(null);
        return;
      }
      // R turns a free standing piece or island; the arrows move or slide the selection
      if (e.key.toLowerCase() === "r" && !mod) {
        const run = selectedIsland ?? (selectedItem ? itemRun(design, selectedItem) : null);
        if (!run) return;
        e.preventDefault();
        const step = e.shiftKey ? -15 : 15;
        // read the angle inside the edit, so holding R keeps turning
        apply((d) => {
          const now = d.islands.find((i) => i.id === run.id);
          return now ? turnRun(d, now.id, now.rotation + step) : d;
        });
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") {
        if (!selectedId) return;
        e.preventDefault();
        const step = e.shiftKey ? 3 : 0.5;
        const sign = e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1;
        const horiz = e.key === "ArrowLeft" || e.key === "ArrowRight";
        // a piece standing on its own floor run moves across the floor, not along a run
        const own = selectedItem && standsAlone(design, selectedItem) ? itemRun(design, selectedItem) : null;
        const run = selectedIsland ?? own;
        if (run) {
          updateIsland(run.id, horiz ? { x: run.x + sign * step } : { y: run.y + sign * step });
        } else if (selectedItem) updateItem(selectedItem.id, { offset: selectedItem.offset + sign * step });
        else if (selectedOpening) updateOpening(selectedOpening.id, { offset: selectedOpening.offset + sign * step });
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [apply, design, drawing, previewing, undo, redo, removeSelected, selectedId, selectedIsland, selectedItem, selectedOpening, updateIsland, updateItem, updateOpening]);

  // ---------- preview ----------
  // The package is drawn at its real paper size, so it is scaled down to fit the window.
  const previewBody = useRef<HTMLDivElement | null>(null);
  const previewSheet = useRef<HTMLDivElement | null>(null);
  const [previewFit, setPreviewFit] = useState({ k: 1, w: 0, h: 0 });
  useEffect(() => {
    if (!previewing) return;
    const body = previewBody.current;
    const sheet = previewSheet.current;
    if (!body || !sheet) return;
    const fit = () => {
      const w = sheet.offsetWidth;
      const h = sheet.offsetHeight;
      if (!w || !h) return;
      const k = Math.min(1, Math.max(0.25, (body.clientWidth - 32) / w));
      setPreviewFit({ k, w, h });
    };
    const ro = new ResizeObserver(fit);
    ro.observe(body);
    ro.observe(sheet);
    return () => ro.disconnect();
  }, [previewing]);

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

  const runs = [
    ...roomShape(design.room).walls.map((w) => ({ id: w.id, label: w.label, wall: true, open: !!w.open })),
    ...design.islands.map((i) => ({ id: i.id, label: i.name, wall: false, open: false })),
  ];

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
          <button className="btn btn-secondary" onClick={() => setPreviewing(true)} title="See the whole package before printing">
            Preview
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
                  .filter((r) => tab === "cabinets" || (r.wall && !r.open))
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
            <ProductPicker
              catalog={activeCatalog}
              lines={cabinetLines}
              lineId={pickerLineId}
              onLine={setPickerLine}
              search={search}
              onSearch={setSearch}
              onAdd={addProduct}
              target={runLabel(design, activeRunValid)}
            />
          )}

          {tab === "openings" && (
            <div className="panel-scroll">
              <p className="muted">Adds to {runLabel(design, isWall(design.room, activeRunValid) ? activeRunValid : firstWall)}. Drag it into place or type the exact position.</p>
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
                      {o.type === "door" ? "Door" : o.type === "window" ? "Window" : "Doorway"} · {wallLabel(design.room, o.wall)} · {fmtIn(o.width)}
                    </button>
                  </li>
                ))}
                {!design.openings.length && <li className="muted">None yet.</li>}
              </ul>
            </div>
          )}

          {tab === "room" && (
            <div className="panel-scroll">
              <RoomPanel design={design} apply={apply} flash={flash} selectedRun={activeRunValid} onSelectWall={(id) => setActiveRun(id)} onDraw={startDrawing} drawing={drawing} />
              <h3 className="cat-title">Islands and floor runs</h3>
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
            {drawing ? (
              <span className="view-tabs-title">Drawing the walls</span>
            ) : (
              <>
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
                <button className="btn btn-secondary btn-small view-tabs-draw" onClick={startDrawing} title="Draw the room's walls with the mouse">
                  Draw walls
                </button>
              </>
            )}
          </div>
          <div className="canvas-stage">
            {drawing ? (
              <DrawRoom room={design.room} minWalls={minWalls} onFinish={finishDrawing} onCancel={() => setDrawing(false)} flash={flash} />
            ) : viewValid === "plan" ? (
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
                Drag pieces to move them. Drag one a foot off its wall to stand it anywhere on the floor, then turn it with the grip behind it or press R. Arrow keys nudge 1/2&quot;
                (Shift for 3&quot;). Delete removes the selected piece.
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
              swap={(p) => swapProduct(selectedItem, p)}
              remove={removeSelected}
              lift={() => liftOntoFloor(selectedItem)}
              turn={(angle) => {
                const run = itemRun(design, selectedItem);
                if (run) apply((d) => turnRun(d, run.id, angle));
              }}
              place={(patch) => {
                const run = itemRun(design, selectedItem);
                if (run) updateIsland(run.id, patch);
              }}
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
            <IslandInspector
              key={selectedIsland.id}
              island={selectedIsland}
              update={(patch) => updateIsland(selectedIsland.id, patch)}
              turn={(angle) => apply((d) => turnRun(d, selectedIsland.id, angle))}
              remove={removeSelected}
            />
          ) : (
            <DesignInspector design={design} catalog={activeCatalog} cabinetLines={cabinetLines} lineId={designLineId} apply={apply} onLine={switchLine} />
          )}
        </aside>
      </div>

      {previewing && (
        <div className="preview-back no-print" role="dialog" aria-modal="true" aria-label="Design package preview">
          <div className="preview-bar">
            <div>
              <div className="preview-title">Design package</div>
              <div className="muted">US Letter landscape. This is exactly what prints.</div>
            </div>
            <div className="preview-actions">
              <button className="btn btn-secondary" onClick={() => setPreviewing(false)}>
                Close
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setPreviewing(false);
                  setPrinting(true);
                }}
              >
                Print / PDF
              </button>
            </div>
          </div>
          <div className="preview-scroll" ref={previewBody}>
            <div className="preview-stage" style={previewFit.w ? { width: previewFit.w * previewFit.k, height: previewFit.h * previewFit.k } : undefined}>
              <div className="preview-sheet" ref={previewSheet} style={{ transform: `scale(${previewFit.k})` }}>
                <PrintSheet record={record} catalog={catalog} />
              </div>
            </div>
          </div>
        </div>
      )}

      {printing && (
        <div className="print-only">
          <PrintSheet record={record} catalog={catalog} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function ProductPicker({
  catalog,
  lines,
  lineId,
  onLine,
  search,
  onSearch,
  onAdd,
  target,
}: {
  catalog: Catalog;
  lines: ProductLine[];
  lineId: string | null;
  onLine: (id: string) => void;
  search: string;
  onSearch: (s: string) => void;
  onAdd: (p: Product) => void;
  target: string;
}) {
  const [open, setOpen] = useState<Set<Category>>(new Set(["base"]));
  const q = search.trim().toLowerCase();
  const inLine = catalog.products.filter((p) => p.line_id === lineId || (p.category === "appliance" && catalog.lines.find((l) => l.id === p.line_id)?.id !== lineId));
  const matches = q
    ? inLine.filter((p) => p.sku.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q))
    : inLine;
  const sorted = [...matches].sort((a, b) => a.sort - b.sort || a.sku.localeCompare(b.sku, undefined, { numeric: true }));
  const line = catalog.lines.find((l) => l.id === lineId);

  return (
    <div className="panel-scroll">
      <label className="field">
        <span className="field-label">Cabinet line</span>
        <select className="input" value={lineId ?? ""} onChange={(e) => onLine(e.target.value)}>
          {lines.map((l) => (
            <option key={l.id} value={l.id}>
              {lineTitle(catalog, l)}
            </option>
          ))}
        </select>
      </label>
      <input className="input" type="search" placeholder="Search SKU or name, e.g. W3036" value={search} onChange={(e) => onSearch(e.target.value)} aria-label="Search products" />
      {!lines.length && <p className="muted">No cabinets in the catalog yet. An admin can add them under Catalog &gt; Import.</p>}
      {CATEGORY_ORDER.map((cat) => {
        const list = sorted.filter((p) => p.category === cat);
        if (!list.length) return null;
        const isOpen = q !== "" || open.has(cat);
        return (
          <section key={cat} className="cat-group">
            <button
              className="cat-title cat-toggle"
              aria-expanded={isOpen}
              onClick={() =>
                setOpen((s) => {
                  const n = new Set(s);
                  if (n.has(cat)) n.delete(cat);
                  else n.add(cat);
                  return n;
                })
              }
            >
              <span>{CATEGORY_LABEL[cat]}</span>
              <span className="muted">
                {list.length} {isOpen ? "\u2212" : "+"}
              </span>
            </button>
            {isOpen && (
              <div className="prod-list">
                {list.map((p) => (
                  <button key={p.id} className="prod-row" onClick={() => onAdd(p)} title={`${p.description ?? p.name}\n${p.placeable ? `Click to add to ${target}` : "Click to add to the order list"}`}>
                    {p.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.image_url} alt="" className="prod-thumb" loading="lazy" />
                    ) : (
                      <span className="prod-thumb prod-thumb-empty">{p.sku.slice(0, 3)}</span>
                    )}
                    <span className="prod-text">
                      <span className="prod-sku">{p.sku}</span>
                      <span className="prod-name">{p.name}</span>
                    </span>
                    <span className="prod-dims tabular">{dims(p)}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        );
      })}
      {q && !sorted.length && <p className="muted">Nothing in {lineTitle(catalog, line)} matches &quot;{search}&quot;.</p>}
    </div>
  );
}

function Swatch({ color, image, size = 22 }: { color: string; image: string | null; size?: number }) {
  return <span className="swatch" style={{ width: size, height: size, background: image ? `center / cover url(${image})` : color }} />;
}

function ItemInspector({
  item,
  design,
  catalog,
  runs,
  update,
  swap,
  remove,
  duplicate,
  lift,
  turn,
  place,
}: {
  item: PlacedItem;
  design: DesignData;
  catalog: Catalog;
  runs: { id: string; label: string; wall: boolean; open: boolean }[];
  update: (p: Partial<PlacedItem>) => void;
  swap: (p: Product) => void;
  remove: () => void;
  duplicate: () => void;
  lift: () => void;
  turn: (angle: number) => void;
  place: (p: { x?: number; y?: number }) => void;
}) {
  const product = catalog.products.find((p) => p.id === item.productId);
  const line = catalog.lines.find((l) => l.id === product?.line_id);
  // other sizes of the same kind of piece in the same line, for a one-click swap
  const siblings = product
    ? catalog.products
        .filter((p) => p.line_id === product.line_id && p.style === product.style && p.category === product.category && p.placeable && p.width !== null)
        .sort((a, b) => (a.height ?? 0) - (b.height ?? 0) || (a.width ?? 0) - (b.width ?? 0) || a.sku.localeCompare(b.sku))
    : [];
  const frame = runFrame(design, item.run);
  const wallHung = item.mountHeight > 0;
  const onFloorRun = itemRun(design, item);
  const alone = standsAlone(design, item);
  const top = cabinetTop(design);
  const atTheTop = Math.abs(item.mountHeight + item.height - top) < 0.01;
  // the top the other wall cabinets on this run line up at, if they agree on one
  const otherTops = design.items.filter((i) => i.id !== item.id && i.run === item.run && i.category === "wall" && i.mountHeight > 0).map((i) => i.mountHeight + i.height);
  const neighborTop = otherTops.length ? Math.max(...otherTops) : null;
  const hasDoors = !["drawer_base", "range", "dishwasher", "hood", "filler", "panel", "open_shelf", "wine_rack", "plate_rack"].includes(item.style);
  const isSided = ["blind_corner_base", "wall_blind_corner", "lazy_susan", "vanity_combo"].includes(item.style);
  const rightGap = frame && frame.kind === "wall" ? frame.length - item.offset - item.width : null;
  const lineFinishes = catalog.finishes.filter((f) => f.line_id === product?.line_id);
  const otherFinishes = catalog.finishes.filter((f) => f.line_id !== product?.line_id);

  return (
    <div className="inspector">
      <div className="insp-head">
        <div className="insp-label">{itemLabel(item)}</div>
        <div className="muted">
          {item.name}
          {line ? ` · ${lineTitle(catalog, line)}` : item.lineName ? ` · ${item.lineName}` : ""}
        </div>
        {product?.description && <div className="insp-desc">{product.description}</div>}
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
            .filter((r) => r.id === item.run || (r.wall && !r.open) || !wallHung)
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
        </select>
      </label>

      {onFloorRun ? (
        <div className="field">
          <span className="field-label">{alone ? "Angle on the floor" : `Angle (turns all of ${onFloorRun.name})`}</span>
          <AngleInput id="it-ang" value={onFloorRun.rotation} onChange={turn} />
          <p className="muted">Drag it anywhere in the top view. The grip behind it turns it, or press R.</p>
        </div>
      ) : (
        !wallHung && (
          <div className="field">
            <button className="btn btn-secondary" onClick={lift}>
              Put on the open floor
            </button>
            <p className="muted">Stands clear of the wall, free to move anywhere and turn to any angle. Dragging it a foot off the wall does the same.</p>
          </div>
        )
      )}

      {siblings.length > 1 && (
        <div className="field">
          <span className="field-label">Other sizes</span>
          <div className="chips">
            {siblings.map((p) => (
              <button
                key={p.id}
                className={`chip chip-size ${p.id === item.productId ? "chip-on" : ""}`}
                onClick={() => swap(p)}
                title={`${p.name}: ${dims(p)}`}
              >
                {p.sku}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid2">
        {onFloorRun && alone ? (
          <>
            <LengthInput id="it-x" label="Across from corner A" value={onFloorRun.x} onChange={(v) => place({ x: v })} hint="Back left corner of the piece" />
            <LengthInput id="it-y" label="Down from Wall A" value={onFloorRun.y} onChange={(v) => place({ y: v })} />
          </>
        ) : (
          <LengthInput id="it-off" label="From left end" value={item.offset} onChange={(v) => update({ offset: v })} hint={rightGap !== null ? `${fmtIn(rightGap)} to right end` : undefined} />
        )}
        <LengthInput id="it-w" label="Exact width" value={item.width} min={0.5} max={120} onChange={(v) => update({ width: v })} />
        <LengthInput id="it-d" label="Depth" value={item.depth} min={0.5} max={48} onChange={(v) => update({ depth: v })} />
        {wallHung ? (
          <LengthInput id="it-m" label="Floor to bottom" value={item.mountHeight} min={1} max={design.room.ceiling} onChange={(v) => update({ mountHeight: v })} />
        ) : (
          <LengthInput id="it-h" label="Height" value={item.height} min={1} max={design.room.ceiling} onChange={(v) => update({ height: v })} />
        )}
      </div>

      {wallHung && (
        <div className="field">
          <span className="field-label">Top of the piece</span>
          <div className="chips">
            <button className={`chip ${atTheTop ? "chip-on" : ""}`} onClick={() => update({ mountHeight: Math.max(0, top - item.height) })}>
              {design.crown ? "Up under the crown" : "Flush with ceiling"}
            </button>
            {neighborTop !== null && (
              <button className={`chip ${Math.abs(item.mountHeight + item.height - neighborTop) < 0.01 ? "chip-on" : ""}`} onClick={() => update({ mountHeight: Math.max(0, neighborTop - item.height) })}>
                Line up with the others
              </button>
            )}
          </div>
          <p className="muted">
            Top is {fmtIn(item.mountHeight + item.height)} off the floor. Ceiling is {fmtIn(design.room.ceiling)}
            {design.crown ? `, less ${fmtIn(design.crown)} of crown` : ""}.
          </p>
        </div>
      )}

      {(hasDoors || isSided) && (
        <div className="field">
          <span className="field-label">
            {item.style === "vanity_combo" ? "Drawer side" : isSided ? "Corner (blind) side" : "Hinge side (single door)"}
          </span>
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
            {(lineFinishes.length ? lineFinishes : otherFinishes).map((f) => (
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
        <div className="muted">{wallLabel(design.room, op.wall)}</div>
      </div>
      <label className="field">
        <span className="field-label">Wall</span>
        <select className="input" value={op.wall} onChange={(e) => update({ wall: e.target.value, offset: 0 })}>
          {roomShape(design.room)
            .walls.filter((w) => !w.open || w.id === op.wall)
            .map((w) => (
              <option key={w.id} value={w.id}>
                {w.label}
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

/** Which way the fronts of a run at this angle look, in plain words. */
function facing(rotation: number): string {
  const a = wrapAngle(rotation + 90); // fronts face a quarter turn clockwise from the run
  const names = ["right", "down", "left", "up"];
  const near = Math.round(a / 90) % 4;
  const exact = Math.abs(angleGap(a, near * 90)) < 1;
  return exact ? names[near] : `between ${names[Math.floor(a / 90) % 4]} and ${names[(Math.floor(a / 90) + 1) % 4]}`;
}

/** Any angle in degrees, with the four square angles and 15 degree steps one click away. */
function AngleInput({ id, value, onChange }: { id: string; value: number; onChange: (angle: number) => void }) {
  const [text, setText] = useState("");
  const shown = text === "" ? String(Math.round(wrapAngle(value) * 10) / 10) : text;
  return (
    <div className="angle-row">
      <input
        id={id}
        className="input angle-input"
        inputMode="decimal"
        value={shown}
        onChange={(e) => {
          setText(e.target.value);
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
        onBlur={() => setText("")}
        aria-label="Angle in degrees"
      />
      <span className="angle-deg">{"°"}</span>
      <div className="chips">
        <button className="chip" onClick={() => onChange(value - 15)} title="Turn 15 degrees counter-clockwise">
          {"↺ 15"}
        </button>
        <button className="chip" onClick={() => onChange(value + 15)} title="Turn 15 degrees clockwise">
          {"↻ 15"}
        </button>
        {[0, 90, 180, 270].map((a) => (
          <button key={a} className={`chip ${Math.abs(angleGap(value, a)) < 0.5 ? "chip-on" : ""}`} onClick={() => onChange(a)}>
            {a}
            {"°"}
          </button>
        ))}
      </div>
    </div>
  );
}

function IslandInspector({ island, update, turn, remove }: { island: Island; update: (p: Partial<Island>) => void; turn: (angle: number) => void; remove: () => void }) {
  return (
    <div className="inspector">
      <div className="insp-head">
        <div className="insp-label">{island.name}</div>
        <div className="muted">Drag it in the top view, or type its position. The grip behind it turns it, or press R.</div>
      </div>
      <label className="field">
        <span className="field-label">Name</span>
        <input className="input" value={island.name} onChange={(e) => update({ name: e.target.value || "Island" })} />
      </label>
      <div className="grid2">
        <LengthInput id="is-x" label="Across from corner A" value={island.x} onChange={(v) => update({ x: v })} hint="Back left corner, measured from the left end of Wall A" />
        <LengthInput id="is-y" label="Down from Wall A" value={island.y} onChange={(v) => update({ y: v })} />
      </div>
      <div className="field">
        <span className="field-label">Angle</span>
        <AngleInput id="is-ang" value={island.rotation} onChange={turn} />
        <p className="muted">
          The run points this way in the top view, and the fronts face a quarter turn clockwise from it. At {Math.round(wrapAngle(island.rotation))}
          {"°"} the fronts face {facing(island.rotation)}.
        </p>
      </div>
      <div className="insp-actions">
        <button className="btn btn-danger" onClick={remove}>
          Remove {island.name}
        </button>
      </div>
    </div>
  );
}

function DesignInspector({
  design,
  catalog,
  cabinetLines,
  lineId,
  apply,
  onLine,
}: {
  design: DesignData;
  catalog: Catalog;
  cabinetLines: ProductLine[];
  lineId: string | null;
  apply: (fn: (d: DesignData) => DesignData) => void;
  onLine: (id: string) => void;
}) {
  const lineFinishes = catalog.finishes.filter((f) => f.line_id === lineId);
  const finishes = lineFinishes.length ? lineFinishes : catalog.finishes;
  const finishId = design.finishId && finishes.some((f) => f.id === design.finishId) ? design.finishId : (finishes[0]?.id ?? null);
  const counterId = design.countertopId ?? catalog.countertops[0]?.id ?? null;
  return (
    <div className="inspector">
      <div className="insp-head">
        <div className="insp-label">Design</div>
        <div className="muted">Click a piece to edit it. Click a wall letter to choose where new pieces go.</div>
      </div>
      {cabinetLines.length > 0 && (
        <label className="field">
          <span className="field-label">Cabinet line</span>
          <select
            className="input"
            value={lineId ?? ""}
            onChange={(e) => onLine(e.target.value)}
          >
            {cabinetLines.map((l) => (
              <option key={l.id} value={l.id}>
                {lineTitle(catalog, l)}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="field">
        <span className="field-label">Cabinet color</span>
        <div className="swatch-grid">
          {finishes.map((f) => (
            <button key={f.id} className={`swatch-btn ${finishId === f.id ? "swatch-on" : ""}`} onClick={() => apply((d) => ({ ...d, finishId: f.id, lineId: d.lineId ?? f.line_id }))}>
              <Swatch color={f.color_hex} image={f.image_url} />
              <span>{f.name}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span className="field-label">Crown molding on the wall cabinets</span>
        <LengthInput
          id="d-crown"
          label="Crown height (0 for none)"
          value={design.crown ?? 0}
          min={0}
          max={12}
          onChange={(v) => apply((d) => setCrown(d, v))}
          hint={
            design.crown
              ? `Wall cabinets stop at ${fmtIn(design.room.ceiling - design.crown)}, leaving room for the crown.`
              : `Wall cabinets run flush with the ${fmtIn(design.room.ceiling)} ceiling.`
          }
        />
        {design.items.some((i) => i.category === "wall" && i.mountHeight > 0 && Math.abs(i.mountHeight + i.height - (design.room.ceiling - (design.crown ?? 0))) > 0.01) && (
          <button className="btn btn-secondary" onClick={() => apply((d) => levelWallCabinets(d, d.room.ceiling - (d.crown ?? 0)))}>
            Take every wall cabinet to the top
          </button>
        )}
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
      {design.extras.length > 0 && (
        <div className="field">
          <span className="field-label">Order items (not drawn)</span>
          <ul className="extras">
            {design.extras.map((x) => (
              <li key={x.id}>
                <span className="extras-name">
                  <b>{x.code}</b> {x.name}
                </span>
                <span className="extras-qty">
                  <button className="chip" aria-label={`One less ${x.code}`} onClick={() => apply((d) => ({ ...d, extras: d.extras.map((e) => (e.id === x.id ? { ...e, qty: Math.max(1, e.qty - 1) } : e)) }))}>
                    {"\u2212"}
                  </button>
                  <span className="tabular">{x.qty}</span>
                  <button className="chip" aria-label={`One more ${x.code}`} onClick={() => apply((d) => ({ ...d, extras: d.extras.map((e) => (e.id === x.id ? { ...e, qty: e.qty + 1 } : e)) }))}>
                    +
                  </button>
                  <button className="chip" aria-label={`Remove ${x.code}`} onClick={() => apply((d) => ({ ...d, extras: d.extras.filter((e) => e.id !== x.id) }))}>
                    Remove
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="insp-stats">
        <div>
          <b className="tabular">{design.items.filter((i) => i.category !== "appliance").length}</b> cabinets, fillers and panels
        </div>
        <div>
          <b className="tabular">{design.items.filter((i) => i.category === "appliance").length}</b> appliances
        </div>
        <div>
          <b className="tabular">{design.extras.reduce((n, x) => n + x.qty, 0)}</b> order items
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

function insideQuad(p: Vec, q: Vec[]): boolean {
  let sign = 0;
  for (let i = 0; i < q.length; i++) {
    const a = q[i];
    const b = q[(i + 1) % q.length];
    const c = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (Math.abs(c) < 1e-9) continue;
    const s = Math.sign(c);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}
