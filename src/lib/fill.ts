// "Fill this wall" (owner, 2026-11-21: the Studio must be easy for someone with
// minimal computer skills). Fills the free stretches of a wall with standard
// cabinets from the design's line, the base row under the counter and the wall
// row above it, and plans fillers where a cabinet meets a wall, a corner or a
// door, so doors and drawers open clear (K&B drawing standards, Ch. 5: fillers
// at perpendicular walls and obstacles; the 10' wall example, 27+30+30+27 with
// fillers, instead of four 30s). The owner's filler widths are 3/4", 1",
// 1-1/2" and 2".
//
// Pure functions: the editor and the kitchen wizard use the same engine.

import { isWall, roomShape, runFrame, verticalSpan, openingSpan } from "./geometry";
import { cabinetTop } from "./place";
import type { Catalog, DesignData, PlacedItem, Product, ProductLine } from "./types";
import { liveOpenings } from "./types";
import { fmtIn as fmt } from "./units";

export const FILLER_WIDTHS = [0.75, 1, 1.5, 2];
/** Wall cabinets hang no lower than this, 18" over a 36" counter. */
const WALL_BOTTOM_MIN = 54;
const BASE_HEIGHT = 34.5;
/** Quarter inches: cabinet widths are whole inches and fillers come in quarters. */
const Q = 4;

const overlap = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 - 0.01 && b0 < a1 - 0.01;

/** A product in the design as a placed piece. */
export function itemFromProduct(catalog: Catalog, p: Product, run: string, offset: number, mountHeight: number, id: string, size?: { width?: number; height?: number }): PlacedItem {
  const line = catalog.lines.find((l) => l.id === p.line_id);
  return {
    id, productId: p.id, code: p.sku, name: p.name, lineName: lineName(catalog, line),
    category: p.category, style: p.style, run, offset,
    width: size?.width ?? p.width ?? 0, height: size?.height ?? p.height ?? 0, depth: p.depth ?? 0,
    mountHeight, doors: p.doors, drawers: p.drawers, splitHeight: p.split_height, finishId: null, hinge: "left",
  };
}

function lineName(catalog: Catalog, line: ProductLine | undefined): string {
  if (!line) return "";
  const maker = catalog.manufacturers.find((m) => m.id === line.manufacturer_id);
  return maker && maker.name !== "Generic" ? `${maker.name} ${line.name}` : line.name;
}

/** The line to fill from: the design's, else the first line that has plain base cabinets. */
export function fillLine(catalog: Catalog, design: DesignData): string | null {
  if (design.lineId && catalog.products.some((p) => p.line_id === design.lineId && p.style === "base")) return design.lineId;
  return catalog.lines.find((l) => catalog.products.some((p) => p.line_id === l.id && p.style === "base" && p.active !== false))?.id ?? null;
}

interface Row {
  kind: "base" | "wall";
  bottom: number;
  height: number;
  depth: number;
  cabinets: Map<number, Product>;
  filler: Product | null;
}

function rows(catalog: Catalog, design: DesignData, lineId: string): Row[] {
  const mine = catalog.products.filter((p) => p.line_id === lineId && p.placeable && p.active !== false && p.width && p.height && p.depth);
  const byWidth = (list: Product[]) => {
    const m = new Map<number, Product>();
    for (const p of list.sort((a, b) => a.sku.length - b.sku.length)) if (!m.has(p.width!) && Number.isInteger(p.width)) m.set(p.width!, p);
    return m;
  };
  const out: Row[] = [];
  const base = mine.filter((p) => p.category === "base" && p.style === "base" && Math.abs(p.height! - BASE_HEIGHT) < 0.01);
  if (base.length) {
    out.push({ kind: "base", bottom: 0, height: BASE_HEIGHT, depth: Math.max(...base.map((p) => p.depth!)), cabinets: byWidth(base),
      filler: mine.find((p) => p.category === "filler" && Math.abs(p.height! - BASE_HEIGHT) < 0.01) ?? null });
  }
  // Wall cabinets run to the top (ceiling or crown); the tallest that still hangs 18" over the counter.
  const top = cabinetTop(design);
  const walls = mine.filter((p) => p.category === "wall" && p.style === "wall" && (p.mount_height ?? 0) > 0);
  const heights = [...new Set(walls.map((p) => p.height!))].sort((a, b) => b - a);
  const h = heights.find((x) => top - x >= WALL_BOTTOM_MIN) ?? heights[heights.length - 1];
  if (h) {
    const list = walls.filter((p) => p.height === h);
    out.push({ kind: "wall", bottom: top - h, height: h, depth: Math.max(...list.map((p) => p.depth!)), cabinets: byWidth(list),
      filler: mine.find((p) => p.category === "filler" && (p.mount_height ?? 0) > 0) ?? null });
  }
  return out;
}

/**
 * The cabinet widths that cover a length best: the most of it covered, then the
 * fewest pieces, then the widest; returned in quarter inches. Fillers take what is
 * left at the ends that need one.
 */
export function planStretch(length: number, widths: number[], fillerEnds: number): { cabinets: number[]; fillers: number[]; left: number } {
  const S = Math.floor(length * Q + 1e-6);
  const W = [...new Set(widths.map((w) => Math.round(w * Q)))].filter((w) => w > 0).sort((a, b) => b - a);
  // count[t]: the best way to add up to exactly t: fewest pieces, and narrow ones (under 15") only when needed
  const cost = (w: number) => 1 + (w < 15 * Q ? 0.6 : 0);
  const count = new Array<number>(S + 1).fill(Infinity);
  const pick = new Array<number>(S + 1).fill(0);
  count[0] = 0;
  for (let t = 1; t <= S; t++) {
    for (const w of W) {
      if (w <= t && count[t - w] + cost(w) < count[t] - 1e-9) { count[t] = count[t - w] + cost(w); pick[t] = w; }
    }
  }
  const F = FILLER_WIDTHS.map((f) => Math.round(f * Q));
  const fillerSets = (n: number): number[][] => (n === 0 ? [[]] : n === 1 ? F.map((f) => [f]) : F.flatMap((a) => F.filter((b) => b >= a).map((b) => [a, b])));
  for (let t = S; t >= 0; t--) {
    if (count[t] === Infinity) continue;
    const rem = S - t;
    let fillers: number[] | null = null;
    if (fillerEnds === 0) fillers = rem <= 1 ? [] : null;
    else {
      // one filler at each end that meets a wall or a door, exactly or within a quarter inch (scribed on site)
      const fit = fillerSets(fillerEnds).map((set) => ({ set, gap: rem - set.reduce((a, b) => a + b, 0) })).filter((x) => x.gap >= 0 && x.gap <= 1)
        .sort((a, b) => a.gap - b.gap || b.set[0] - a.set[0])[0];
      if (fit) fillers = fit.set;
    }
    if (!fillers) continue;
    const cabinets: number[] = [];
    for (let x = t; x > 0; x -= pick[x]) cabinets.push(pick[x]);
    cabinets.sort((a, b) => b - a);
    const used = cabinets.reduce((a, b) => a + b, 0) + fillers.reduce((a, b) => a + b, 0);
    return { cabinets: cabinets.map((c) => c / Q), fillers: fillers.map((f) => f / Q), left: (S - used) / Q + (length - S / Q) };
  }
  // No exact fit: cover as much as possible, the widest fillers at the ends, and say what is left.
  const big = F[F.length - 1];
  for (let t = S; t >= 0; t--) {
    if (count[t] === Infinity || S - t < fillerEnds * F[0]) continue;
    const cabinets: number[] = [];
    for (let x = t; x > 0; x -= pick[x]) cabinets.push(pick[x]);
    cabinets.sort((a, b) => b - a);
    const each = Math.min(big, Math.floor((S - t) / Math.max(1, fillerEnds)));
    const size = [...F].reverse().find((f) => f <= each) ?? F[0];
    const fillers = new Array<number>(fillerEnds).fill(size);
    const used = t + fillers.reduce((a, b) => a + b, 0);
    return { cabinets: cabinets.map((c) => c / Q), fillers: fillers.map((f) => f / Q), left: (S - used) / Q + (length - S / Q) };
  }
  return { cabinets: [], fillers: [], left: length };
}

export interface FillResult {
  items: PlacedItem[];
  /** One line per stretch, in plain words, for the designer. */
  notes: string[];
}

/** Fills the free stretches of one wall, base row and wall row. Nothing already there moves. */
export function fillWall(design: DesignData, catalog: Catalog, wallId: string, makeId: () => string, only?: "base" | "wall"): FillResult {
  const notes: string[] = [];
  const items: PlacedItem[] = [];
  const frame = runFrame(design, wallId);
  if (!frame || !isWall(design.room, wallId)) return { items, notes: ["Pick a wall to fill."] };
  if (frame.open) return { items, notes: [`${frame.label} is open: there is no wall to put cabinets on.`] };
  const lineId = fillLine(catalog, design);
  if (!lineId) return { items, notes: ["Choose a cabinet line first."] };
  const walls = roomShape(design.room).walls;
  const i = walls.findIndex((w) => w.id === wallId);
  const prev = walls[(i - 1 + walls.length) % walls.length];
  const next = walls[(i + 1) % walls.length];
  const L = frame.length;

  for (const row of rows(catalog, design, lineId)) {
    if (only && row.kind !== only) continue;
    const top = row.bottom + row.height;
    const blocked: [number, number, "cabinet" | "door" | "appliance"][] = [];
    for (const it of design.items) {
      if (it.run !== wallId) continue;
      const [v0, v1] = verticalSpan(it);
      if (overlap(v0, v1, row.bottom, top)) blocked.push([it.offset, it.offset + it.width, it.category === "appliance" ? "appliance" : "cabinet"]);
      // the space over a range is the hood's
      if (row.kind === "wall" && it.style === "range") blocked.push([it.offset, it.offset + it.width, "appliance"]);
    }
    for (const op of liveOpenings(design).filter((o) => o.wall === wallId)) {
      const [o0, o1] = openingSpan(op);
      // a window sits behind the counter, so it only stops the wall row and anything taller than the counter
      if (overlap(o0, o1, row.bottom, top) && !(op.type === "window" && row.kind === "base" && o0 >= top - 0.01)) {
        blocked.push([op.offset - (op.type === "door" ? 2.5 : 0), op.offset + op.width + (op.type === "door" ? 2.5 : 0), "door"]);
      }
    }
    // Corners: pieces on the walls either side that reach the corner take its space.
    const reach = (w: typeof prev, atEnd: boolean) => {
      if (w.open || w.id === wallId) return 0;
      let d = 0;
      for (const it of design.items) {
        if (it.run !== w.id) continue;
        const [v0, v1] = verticalSpan(it);
        if (!overlap(v0, v1, row.bottom, top)) continue;
        const nearCorner = atEnd ? it.offset + it.width > w.length - row.depth - 0.01 : it.offset < row.depth + 0.01;
        if (nearCorner) d = Math.max(d, it.depth);
      }
      return d;
    };
    const start = reach(prev, true);
    const end = L - reach(next, false);
    blocked.sort((a, b) => a[0] - b[0]);
    // the free stretches, with what each end touches
    const stretches: { a: number; b: number; fa: boolean; fb: boolean }[] = [];
    let cursor = start;
    let cursorFiller = !prev.open; // a wall corner, or the side of the cabinets around it
    for (const [b0, b1, kind] of blocked) {
      if (b0 > cursor + 0.01) stretches.push({ a: cursor, b: Math.min(b0, end), fa: cursorFiller, fb: kind === "door" });
      if (b1 > cursor) { cursor = b1; cursorFiller = kind === "door"; }
    }
    if (end > cursor + 0.01) stretches.push({ a: cursor, b: end, fa: cursorFiller, fb: !next.open });

    const widths = [...row.cabinets.keys()];
    const minWidth = Math.min(...widths);
    for (const s of stretches) {
      const len = s.b - s.a;
      const ends = (s.fa ? 1 : 0) + (s.fb ? 1 : 0);
      if (len < minWidth) {
        // too short for a cabinet: a filler closes it if it is small enough
        const plan = planStretch(len, [], ends);
        if (plan.fillers.length && row.filler) {
          let x = s.a;
          for (const f of plan.fillers) { items.push(itemFromProduct(catalog, row.filler, wallId, x, row.bottom, makeId(), { width: f, height: row.height })); x += f; }
          notes.push(`${frame.label} ${row.kind} row: a ${plan.fillers.map((x) => fmt(x)).join(" + ")} filler closes the ${fmt(len)} gap.`);
        } else if (len > 0.3) notes.push(`${frame.label} ${row.kind} row: ${fmt(len)} at ${fmt(s.a)} is too narrow for a cabinet; leave it open or fill it on site.`);
        continue;
      }
      const plan = planStretch(len, widths, row.filler ? ends : 0);
      let x = s.a;
      const fillerA = s.fa && plan.fillers.length ? plan.fillers[0] : 0;
      const fillerB = plan.fillers.length > (fillerA ? 1 : 0) ? plan.fillers[plan.fillers.length - 1] : 0;
      if (fillerA && row.filler) { items.push(itemFromProduct(catalog, row.filler, wallId, x, row.bottom, makeId(), { width: fillerA, height: row.height })); x += fillerA; }
      for (const w of plan.cabinets) {
        const p = row.cabinets.get(w)!;
        items.push(itemFromProduct(catalog, p, wallId, x, row.kind === "wall" ? row.bottom : 0, makeId()));
        x += w;
      }
      if (fillerB && row.filler) { items.push(itemFromProduct(catalog, row.filler, wallId, x, row.bottom, makeId(), { width: fillerB, height: row.height })); }
      const codes = plan.cabinets.map((w) => row.cabinets.get(w)!.sku);
      notes.push(`${frame.label} ${row.kind === "base" ? "base" : "wall"} cabinets: ${codes.join(", ")}${plan.fillers.length ? `, with ${plan.fillers.map((x) => fmt(x)).join(" and ")} filler${plan.fillers.length > 1 ? "s" : ""}` : ""}${plan.left > 0.12 ? `; ${fmt(plan.left)} left to scribe` : ""}.`);
    }
  }
  if (!items.length && !notes.length) notes.push(`${frame.label} is already full.`);
  return { items, notes };
}

