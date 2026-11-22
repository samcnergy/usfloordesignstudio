// The kitchen wizard (owner, 2026-11-21: "the system has to be easy to use so a
// person with minimal computer skills can navigate and make elegant kitchen
// designs"). The designer answers a few plain questions: the shape, the sizes,
// the window and door, where the sink, range and fridge go, and the look; the
// kitchen is built from the answers and every cabinet wall is filled with
// standard cabinets and fillers (fill.ts). Everything can be changed after.

import { fillLine, fillWall, itemFromProduct, planStretch } from "./fill";
import { roomShape } from "./geometry";
import type { Catalog, DesignData, Island, Opening, PlacedItem, Product } from "./types";
import { rectangleRoom } from "./types";

export type Shape = "one" | "galley" | "L" | "U";

/** The walls that get cabinets, for each shape. Wall A is the top of the top view; walls go clockwise. */
export const CABINET_WALLS: Record<Shape, string[]> = { one: ["A"], galley: ["A", "C"], L: ["A", "B"], U: ["D", "A", "B"] };

export const SHAPE_LABEL: Record<Shape, string> = { one: "One wall", galley: "Galley (two facing walls)", L: "L-shape", U: "U-shape" };

export interface WizardSpec {
  shape: Shape;
  width: number; // Wall A
  depth: number; // Wall B
  ceiling: number;
  island: boolean;
  window: { width: number } | null; // over the sink
  door: { wall: string; at: "left" | "center" | "right"; width: number } | null;
  sinkWall: string;
  rangeWall: string;
  rangeWidth: number;
  fridge: { wall: string; end: "left" | "right"; width: number };
  dishwasher: boolean;
  lineId: string | null;
  finishId: string | null;
  countertopId: string | null;
}

/** The ends of a cabinet wall that are free for a fridge: not at a corner shared with another cabinet wall. */
export function freeEnds(shape: Shape, wall: string): ("left" | "right")[] {
  const order = ["A", "B", "C", "D"];
  const i = order.indexOf(wall);
  const prev = order[(i + 3) % 4];
  const next = order[(i + 1) % 4];
  const walls = CABINET_WALLS[shape];
  return [...(walls.includes(prev) ? [] : ["left" as const]), ...(walls.includes(next) ? [] : ["right" as const])];
}

/** Sensible first answers for a shape. */
export function defaultSpec(shape: Shape, keep?: Partial<WizardSpec>): WizardSpec {
  const walls = CABINET_WALLS[shape];
  const sinkWall = walls.includes("A") ? "A" : walls[0];
  const rangeWall = shape === "L" || shape === "U" ? "B" : shape === "galley" ? "C" : "A";
  const fridgeWall = shape === "U" ? "B" : shape === "L" ? "A" : "A";
  const ends = freeEnds(shape, fridgeWall);
  return {
    width: 144, depth: 120, ceiling: 96, island: false, window: { width: 36 }, rangeWidth: 30, dishwasher: true,
    lineId: null, finishId: null, countertopId: null,
    ...keep,
    shape, sinkWall, rangeWall,
    door: { wall: walls.includes("C") ? (walls.includes("D") ? "B" : "D") : "C", at: "center", width: 32 },
    fridge: { wall: fridgeWall, end: ends.includes("left") && shape === "L" ? "left" : (ends[ends.length - 1] ?? "right"), width: 36 },
  };
}

const pickAppliance = (catalog: Catalog, style: string, width: number) =>
  catalog.products.filter((p) => p.style === style && p.placeable && p.width).sort((a, b) => Math.abs(a.width! - width) - Math.abs(b.width! - width))[0] ?? null;

/** Open stretches of a wall at floor level, given what is already on it. */
function freeAt(items: PlacedItem[], wall: string, length: number): [number, number][] {
  const taken = items.filter((i) => i.run === wall && i.mountHeight === 0).map((i) => [i.offset, i.offset + i.width] as [number, number]).sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  let x = 0;
  for (const [a, b] of taken) {
    if (a > x) out.push([x, a]);
    x = Math.max(x, b);
  }
  if (length > x) out.push([x, length]);
  return out;
}

/** Builds the kitchen. Returns the design and what could not be done, in plain words. */
export function buildKitchen(base: DesignData, catalog: Catalog, spec: WizardSpec, makeId: () => string): { design: DesignData; notes: string[] } {
  const notes: string[] = [];
  const lineId = spec.lineId ?? fillLine(catalog, base);
  const lineCatalog = lineId;
  let d: DesignData = {
    ...base,
    room: { ...rectangleRoom(spec.width, spec.depth, spec.ceiling, base.room.wallThickness ?? 4.5) },
    islands: [], openings: [], items: [], extras: [],
    lineId, finishId: spec.finishId ?? catalog.finishes.find((f) => f.line_id === lineId)?.id ?? base.finishId,
    countertopId: spec.countertopId ?? base.countertopId ?? catalog.countertops[0]?.id ?? null,
    northWall: base.northWall ?? null,
  };
  const len = (w: string) => (w === "A" || w === "C" ? spec.width : spec.depth);
  const items: PlacedItem[] = [];
  const openings: Opening[] = [];
  const cabinetWalls = CABINET_WALLS[spec.shape];
  const reserve = (w: string, end: "left" | "right") => {
    // the run on the neighbouring cabinet wall takes the corner
    const order = ["A", "B", "C", "D"];
    const i = order.indexOf(w);
    const other = end === "left" ? order[(i + 3) % 4] : order[(i + 1) % 4];
    return cabinetWalls.includes(other) ? 24 : 0;
  };

  // Fridge, at the end of its wall.
  const fridge = pickAppliance(catalog, "refrigerator", spec.fridge.width);
  if (fridge) {
    const L = len(spec.fridge.wall);
    const offset = spec.fridge.end === "left" ? reserve(spec.fridge.wall, "left") : L - fridge.width! - reserve(spec.fridge.wall, "right");
    items.push({ ...itemFromProduct(catalog, fridge, spec.fridge.wall, offset, 0, makeId()), hinge: spec.fridge.end === "left" ? "left" : "right" });
  } else notes.push("No refrigerator in the catalog; add one from the Generic appliances.");

  // Sink base in the middle of its wall, the window centered over it.
  const sink = catalog.products.filter((p) => p.line_id === lineCatalog && p.style === "sink_base" && p.placeable && p.width)
    .sort((a, b) => Math.abs(a.width! - 36) - Math.abs(b.width! - 36))[0];
  let sinkAt: number | null = null;
  if (sink) {
    const L = len(spec.sinkWall);
    const free = freeAt(items, spec.sinkWall, L).map(([a, b]) => [Math.max(a, reserve(spec.sinkWall, "left")), Math.min(b, L - reserve(spec.sinkWall, "right"))] as [number, number])
      .filter(([a, b]) => b - a >= sink.width!).sort((x, y) => y[1] - y[0] - (x[1] - x[0]))[0];
    if (free) {
      sinkAt = Math.round((free[0] + free[1]) / 2 - sink.width! / 2);
      items.push(itemFromProduct(catalog, sink, spec.sinkWall, sinkAt, 0, makeId()));
      if (spec.window) {
        const w = Math.min(spec.window.width, L - 12);
        openings.push({ id: makeId(), wall: spec.sinkWall, type: "window", offset: Math.round(sinkAt + sink.width! / 2 - w / 2), width: w, height: 42, sill: 42, hinge: "left" });
      }
      if (spec.dishwasher) {
        const dw = pickAppliance(catalog, "dishwasher", 24);
        if (dw) {
          const right = sinkAt + sink.width!;
          const fitsRight = right + dw.width! <= free[1];
          const at = fitsRight ? right : sinkAt - dw.width!;
          if (fitsRight || at >= free[0]) items.push(itemFromProduct(catalog, dw, spec.sinkWall, at, 0, makeId()));
          else notes.push("No room for the dishwasher next to the sink.");
        }
      }
    } else notes.push("The sink wall is too short for a sink base.");
  } else notes.push("This cabinet line has no sink base.");

  // Range, in the middle of the longest open stretch of its wall, with its hood.
  const range = pickAppliance(catalog, "range", spec.rangeWidth);
  if (range) {
    const L = len(spec.rangeWall);
    const free = freeAt(items, spec.rangeWall, L).map(([a, b]) => [Math.max(a, reserve(spec.rangeWall, "left")), Math.min(b, L - reserve(spec.rangeWall, "right"))] as [number, number])
      .filter(([a, b]) => b - a >= range.width!).sort((x, y) => y[1] - y[0] - (x[1] - x[0]))[0];
    if (free) {
      const at = Math.round((free[0] + free[1]) / 2 - range.width! / 2);
      items.push(itemFromProduct(catalog, range, spec.rangeWall, at, 0, makeId()));
      const hood = pickAppliance(catalog, "hood", range.width!);
      if (hood) {
        const mount = Math.min(hood.mount_height ?? 66, spec.ceiling - hood.height!);
        items.push(itemFromProduct(catalog, hood, spec.rangeWall, at + (range.width! - hood.width!) / 2, mount, makeId()));
      }
    } else notes.push("No room left for the range on that wall.");
  }

  // The entry door.
  if (spec.door) {
    const L = len(spec.door.wall);
    const w = Math.min(spec.door.width, L - 8);
    const offset = spec.door.at === "left" ? 4 : spec.door.at === "right" ? L - w - 4 : Math.round(L / 2 - w / 2);
    if (cabinetWalls.includes(spec.door.wall) && items.some((i) => i.run === spec.door!.wall && i.offset < offset + w && offset < i.offset + i.width)) {
      notes.push("The door would hit the cabinets on that wall, so it was left out. Add it on the Doors & Windows tab.");
    } else openings.push({ id: makeId(), wall: spec.door.wall, type: "door", offset, width: w, height: 80, sill: 0, hinge: "left" });
  }

  d = { ...d, items, openings };

  // Fill every cabinet wall: the walls around corners first, so the corners are shared properly.
  for (const wall of cabinetWalls) {
    const r = fillWall(d, catalog, wall, makeId);
    d = { ...d, items: [...d.items, ...r.items] };
  }

  // An island, when the room leaves 42" walkways around it.
  if (spec.island) {
    const walls = roomShape(d.room).walls;
    const deepA = cabinetWalls.includes("A") ? 24 : 0;
    const deepC = cabinetWalls.includes("C") ? 24 : 0;
    const deepD = cabinetWalls.includes("D") ? 24 : 0;
    const deepB = cabinetWalls.includes("B") ? 24 : 0;
    const islandDepth = 24;
    const roomForDepth = spec.depth - deepA - deepC - islandDepth - 42 * 2;
    const roomForLength = spec.width - deepD - deepB - 42 * 2;
    const widths = [...new Set(catalog.products.filter((p) => p.line_id === lineId && p.style === "base" && p.width && p.placeable).map((p) => p.width!))];
    if (roomForDepth < 0 || roomForLength < 36 || !walls.length) {
      notes.push(`No island: the room needs 42" walkways around it (about ${Math.ceil(-Math.min(roomForDepth, roomForLength - 36))}" more).`);
    } else {
      const plan = planStretch(Math.min(roomForLength, 96), widths, 0);
      const islandLen = plan.cabinets.reduce((a, b) => a + b, 0);
      const isl: Island = {
        id: makeId(), name: "Island",
        x: Math.round(deepD + 42 + (roomForLength - islandLen) / 2),
        y: Math.round(deepA + 42 + roomForDepth / 2),
        rotation: 0,
      };
      let x = 0;
      const placed: PlacedItem[] = [];
      for (const w of plan.cabinets) {
        const p = catalog.products.find((q: Product) => q.line_id === lineId && q.style === "base" && q.width === w && q.placeable)!;
        placed.push(itemFromProduct(catalog, p, isl.id, x, 0, makeId()));
        x += w;
      }
      d = { ...d, islands: [isl], items: [...d.items, ...placed] };
    }
  }
  return { design: d, notes };
}
