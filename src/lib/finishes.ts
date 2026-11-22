// The finish plan and finish schedule (owner, 2026-11-21: the new drawings,
// K&B drawing standards Chapter 10). The designer picks a finish for the floor,
// the walls, the backsplash, the ceiling and the base, plus the countertop's
// edge and sink mounting; each gets a key (T-01 tile, P-01 paint...) that the
// finish symbol on the plan and the schedule share. Quantities are worked out
// from the room, so the schedule can be checked against the order.

import { roomShape } from "./geometry";
import { BASE_TOP, COUNTER_STYLES } from "./plan";
import type { DesignData } from "./types";
import { liveOpenings } from "./types";

export type FinishUse = "floor" | "walls" | "backsplash" | "ceiling" | "base";
export const FINISH_USES: FinishUse[] = ["floor", "walls", "backsplash", "ceiling", "base"];
export const USE_NAME: Record<FinishUse, string> = { floor: "Floor", walls: "Walls", backsplash: "Backsplash", ceiling: "Ceiling", base: "Base (baseboard)" };

export type Material = "tile" | "stone" | "wood" | "vinyl" | "laminate" | "carpet" | "paint" | "other";
export const MATERIAL_NAME: Record<Material, string> = {
  tile: "Tile", stone: "Stone", wood: "Wood", vinyl: "Vinyl plank", laminate: "Laminate", carpet: "Carpet", paint: "Paint", other: "Other",
};
const PREFIX: Record<Material, string> = { tile: "T", stone: "S", wood: "W", vinyl: "V", laminate: "L", carpet: "C", paint: "P", other: "X" };
export const MATERIALS_FOR: Record<FinishUse, Material[]> = {
  floor: ["tile", "wood", "vinyl", "laminate", "stone", "carpet", "other"],
  walls: ["paint", "tile", "other"],
  backsplash: ["tile", "stone", "paint", "other"],
  ceiling: ["paint", "other"],
  base: ["wood", "tile", "paint", "other"],
};

export interface FinishEntry {
  material: Material;
  description?: string;
  manufacturer?: string;
  product?: string;
  color?: string;
  /** Installation remarks: grout and trims for tile, sheen for paint. */
  notes?: string;
  suppliedBy?: string;
  installedBy?: string;
  /** Floor and backsplash tile or plank size, W x L inches, for the pattern drawn on the plan. */
  size?: { w: number; l: number };
}

/** The sink and faucet as the fabricator needs them for the countertop plan (sizes from the spec sheets). */
export interface SinkSpec {
  model?: string;
  /** The cutout, W x D inches, from the sink's template or spec sheet. */
  cutout?: { w: number; d: number };
  /** Undermount: how the counter edge meets the bowl. */
  reveal?: "positive" | "negative" | "flush";
  faucetHoles?: number;
  /** Hole diameter, inches. */
  holeSize?: number;
  /** Center to center of the outer holes on a widespread faucet, inches. */
  spread?: number;
}

export interface FinishData {
  uses: Partial<Record<FinishUse, FinishEntry>>;
  counterEdge?: string;
  sinkMount?: string;
  sink?: SinkSpec;
}

export const finishesOf = (d: DesignData): FinishData => ({ uses: {}, ...(d.finishes ?? {}) });
export const hasFinishes = (d: DesignData) => Object.keys(finishesOf(d).uses).length > 0;

/** Keys in the book's style: T-01, T-02, P-01... numbered by material in the order floor, walls, backsplash, ceiling, base. */
export function finishKeys(f: FinishData): Partial<Record<FinishUse, string>> {
  const count: Partial<Record<string, number>> = {};
  const out: Partial<Record<FinishUse, string>> = {};
  const same = new Map<string, string>();
  for (const u of FINISH_USES) {
    const e = f.uses[u];
    if (!e) continue;
    // the same product used twice (paint on the walls and ceiling) keeps one key
    const sig = JSON.stringify([e.material, e.manufacturer ?? "", e.product ?? "", e.color ?? "", e.description ?? ""]);
    const hasDetail = !!(e.manufacturer || e.product || e.color || e.description);
    if (hasDetail && same.has(sig)) { out[u] = same.get(sig)!; continue; }
    const p = PREFIX[e.material];
    count[p] = (count[p] ?? 0) + 1;
    out[u] = `${p}-${String(count[p]).padStart(2, "0")}`;
    if (hasDetail) same.set(sig, out[u]!);
  }
  return out;
}

/** Area of the floor inside the walls, in square feet. */
export function floorArea(d: DesignData): number {
  const pts = roomShape(d.room).inner;
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2 / 144;
}

/** The backsplash on each wall: counter spans, from the counter to the wall cabinets (or 18" where there are none). */
export function backsplashAreas(d: DesignData, counterThick: number): { wall: string; s0: number; s1: number; height: number }[] {
  const out: { wall: string; s0: number; s1: number; height: number }[] = [];
  for (const w of roomShape(d.room).walls) {
    if (w.open) continue;
    const counters = d.items.filter((i) => i.run === w.id && i.mountHeight === 0 && COUNTER_STYLES.has(i.style) && Math.abs(i.height - BASE_TOP) < 0.01)
      .map((i) => [i.offset, i.offset + i.width] as [number, number]).sort((a, b) => a[0] - b[0]);
    const spans: [number, number][] = [];
    for (const c of counters) {
      const last = spans[spans.length - 1];
      if (last && c[0] <= last[1] + 0.1) last[1] = Math.max(last[1], c[1]);
      else spans.push([...c]);
    }
    for (const [s0, s1] of spans) {
      const above = d.items.filter((i) => i.run === w.id && i.mountHeight > 0 && i.offset < s1 && s0 < i.offset + i.width).map((i) => i.mountHeight);
      const top = above.length ? Math.min(...above) : BASE_TOP + counterThick + 18;
      out.push({ wall: w.id, s0, s1, height: Math.max(0, top - BASE_TOP - counterThick) });
    }
  }
  return out;
}

/** Quantity for each finish, with its unit; flooring and tile add nothing for waste (the installer orders the overage). */
export function finishQuantity(d: DesignData, use: FinishUse, counterThick: number): string {
  const shape = roomShape(d.room);
  const walls = shape.walls.filter((w) => !w.open);
  const sq = (v: number) => `${Math.ceil(v)} sq ft`;
  if (use === "floor" || use === "ceiling") return sq(floorArea(d));
  if (use === "backsplash") return sq(backsplashAreas(d, counterThick).reduce((n, b) => n + ((b.s1 - b.s0) * b.height) / 144, 0));
  if (use === "base") {
    // along the walls, less the doors and the stretches behind floor cabinets and appliances
    let len = 0;
    for (const w of walls) {
      const blocked = [
        ...d.items.filter((i) => i.run === w.id && i.mountHeight === 0).map((i) => [i.offset, i.offset + i.width] as [number, number]),
        ...liveOpenings(d).filter((o) => o.wall === w.id && o.type === "door").map((o) => [o.offset, o.offset + o.width] as [number, number]),
      ].sort((a, b) => a[0] - b[0]);
      let x = 0, free = 0;
      for (const [a, b] of blocked) { if (a > x) free += a - x; x = Math.max(x, b); }
      free += Math.max(0, w.length - x);
      len += free;
    }
    return `${Math.ceil(len / 12)} lin ft`;
  }
  // walls: the wall area less doors and windows, less the backsplash
  let area = walls.reduce((n, w) => n + w.length * d.room.ceiling, 0);
  for (const o of liveOpenings(d)) area -= o.width * o.height;
  // and the wall the cabinets and appliances hide
  for (const i of d.items) if (walls.some((w) => w.id === i.run) && i.style !== "hood") area -= i.width * i.height;
  area -= backsplashAreas(d, counterThick).reduce((n, b) => n + (b.s1 - b.s0) * b.height, 0);
  return sq(Math.max(0, area) / 144);
}
