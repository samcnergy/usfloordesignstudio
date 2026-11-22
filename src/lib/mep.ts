// The mechanical, electrical and plumbing (MEP) plan (owner, 2026-11-21: "start
// the new drawings"). Symbols follow the K&B drawing standards: wall-mounted
// symbols have a tail to the wall, floor-mounted ones are boxed, ceiling ones
// stand alone; every symbol on the plan is in the legend, grouped mechanical,
// electrical, lighting, plumbing; switching lines are long dash-dot arcs.
//
// "Lay out outlets, lights and plumbing" proposes a full plan from the kitchen:
// countertop receptacles so no point along the counter is more than 24" from
// one, the appliance outlets and hook-ups, recessed lights over the counters
// and the floor, pendants over the island, under-cabinet lights, and the
// switches by the entry door. Everything can be moved, added or deleted after.

import { islandRect, roomShape, runFrame, pointOn, insideRoom, type Vec } from "./geometry";
import { BASE_TOP, COUNTER_STYLES } from "./plan";
import type { DesignData, PlacedItem } from "./types";

export type MepGroup = "mechanical" | "electrical" | "lighting" | "plumbing";
export type Mount = "wall" | "ceiling" | "floor" | "cabinet";

export type MepKind =
  | "duplex" // 120V duplex receptacle
  | "duplex_switched" // 120V duplex, switched (garbage disposal)
  | "r240" // 208/240V receptacle
  | "hardwired" // 120V special hard-wired connection
  | "junction"
  | "data"
  | "switch"
  | "recessed"
  | "pendant"
  | "ceiling_light"
  | "sconce"
  | "undercabinet"
  | "disposal"
  | "supply_valve" // wall supply valve: ice maker, pot filler, sink stops
  | "gas_valve"
  | "exhaust" // hood exhaust duct, with its direction
  | "thermostat"
  | "register"
  | "smoke";

export interface MepKindInfo {
  name: string;
  group: MepGroup;
  mount: Mount;
  /** Goes in the lighting and switching schedule (lights and switches) or the MEP schedule. */
  schedule: "lighting" | "mep";
}

export const MEP_KINDS: Record<MepKind, MepKindInfo> = {
  exhaust: { name: "Exhaust duct", group: "mechanical", mount: "ceiling", schedule: "mep" },
  thermostat: { name: "Thermostat", group: "mechanical", mount: "wall", schedule: "mep" },
  register: { name: "Supply register", group: "mechanical", mount: "floor", schedule: "mep" },
  duplex: { name: "120V duplex receptacle", group: "electrical", mount: "wall", schedule: "mep" },
  duplex_switched: { name: "120V duplex receptacle, switched", group: "electrical", mount: "wall", schedule: "mep" },
  r240: { name: "208/240V receptacle", group: "electrical", mount: "wall", schedule: "mep" },
  hardwired: { name: "120V hard-wired connection", group: "electrical", mount: "wall", schedule: "mep" },
  junction: { name: "Junction box", group: "electrical", mount: "wall", schedule: "mep" },
  data: { name: "Data receptacle", group: "electrical", mount: "wall", schedule: "mep" },
  smoke: { name: "Smoke detector", group: "electrical", mount: "ceiling", schedule: "mep" },
  recessed: { name: "Recessed light", group: "lighting", mount: "ceiling", schedule: "lighting" },
  pendant: { name: "Pendant light", group: "lighting", mount: "ceiling", schedule: "lighting" },
  ceiling_light: { name: "Ceiling light", group: "lighting", mount: "ceiling", schedule: "lighting" },
  sconce: { name: "Wall light", group: "lighting", mount: "wall", schedule: "lighting" },
  undercabinet: { name: "Under-cabinet light", group: "lighting", mount: "wall", schedule: "lighting" },
  switch: { name: "Light switch", group: "lighting", mount: "wall", schedule: "lighting" },
  disposal: { name: "Garbage disposal", group: "plumbing", mount: "cabinet", schedule: "mep" },
  supply_valve: { name: "Water supply valve", group: "plumbing", mount: "wall", schedule: "mep" },
  gas_valve: { name: "Gas shut-off valve", group: "plumbing", mount: "wall", schedule: "mep" },
};

export const GROUP_ORDER: MepGroup[] = ["mechanical", "electrical", "lighting", "plumbing"];
export const GROUP_NAME: Record<MepGroup, string> = {
  mechanical: "Mechanical (HVAC)",
  electrical: "Electrical (power, data and communication)",
  lighting: "Lighting and switching",
  plumbing: "Plumbing and gas",
};

/** What the tags next to a symbol mean (the book's type designations). */
export const TAG_MEANING: Record<string, string> = {
  GFCI: "ground fault protected, at the counter",
  DW: "dishwasher",
  GD: "garbage disposal",
  R: "refrigerator",
  MW: "microwave",
  RA: "range",
  HV: "hood vent",
  DM: "dimmer",
  "3": "3-way",
};

export interface MepItem {
  id: string;
  kind: MepKind;
  /** Type designation shown beside the symbol (GFCI, DW, R1...). */
  tag: string;
  /** Wall-mounted pieces sit on a wall at an offset from its left end; the rest stand at x, y. */
  wall: string | null;
  offset: number;
  x: number;
  y: number;
  /** Height above the finished floor to the center of the box, or a plain-words place ("in sink base"). */
  aff: string;
  /** Under-cabinet lights: the length along the wall. */
  length?: number;
  /** Switches: the lights they control (drawn as switching lines). */
  controls?: string[];
  /** Exhaust: which way the duct runs, in plain words. */
  note?: string;
  auto?: boolean;
}

export interface MepSpec {
  description?: string;
  manufacturer?: string;
  product?: string;
  finish?: string;
  kelvin?: string;
  notes?: string;
  suppliedBy?: string;
  installedBy?: string;
}

export interface MepData {
  items: MepItem[];
  rangeFuel: "gas" | "electric" | null;
  disposal: boolean;
  /** Schedule entries by key (kind and tag), filled in by the designer. */
  specs: Record<string, MepSpec>;
}

export const emptyMep = (): MepData => ({ items: [], rangeFuel: null, disposal: true, specs: {} });
export const mepOf = (d: DesignData): MepData => ({ ...emptyMep(), ...(d.mep ?? {}) });

/** Key for the legend and schedules: one row per kind and tag. */
export const mepKey = (m: Pick<MepItem, "kind" | "tag">) => `${m.kind}${m.tag ? `:${m.tag}` : ""}`;

/** Where a piece is on the plan, and for wall pieces, which way the wall faces (into the room). */
export function mepPoint(design: DesignData, m: MepItem): { p: Vec; n: Vec | null; u: Vec | null } {
  if (m.wall) {
    const f = runFrame(design, m.wall);
    if (f) return { p: pointOn(f, m.offset, 0), n: f.n, u: f.u };
  }
  return { p: { x: m.x, y: m.y }, n: null, u: null };
}

function spansOf(items: PlacedItem[]): [number, number][] {
  const s = items.map((i) => [i.offset, i.offset + i.width] as [number, number]).sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const x of s) {
    const last = out[out.length - 1];
    if (last && x[0] <= last[1] + 0.1) last[1] = Math.max(last[1], x[1]);
    else out.push([...x]);
  }
  return out;
}

/** Countertop receptacles along a counter: no point more than 24" from one, none over the sink. */
export function counterOutlets(a: number, b: number, avoid: [number, number][]): number[] {
  const len = b - a;
  if (len < 12) return [];
  const n = Math.max(1, Math.ceil((len - 48) / 48) + 1);
  const raw = n === 1 ? [a + len / 2] : Array.from({ length: n }, (_, i) => a + Math.min(24, len / 2) + (i * (len - 2 * Math.min(24, len / 2))) / (n - 1));
  return raw.map((x) => {
    const hit = avoid.find(([s0, s1]) => x > s0 - 3 && x < s1 + 3);
    if (!hit) return x;
    // slide off the sink to whichever side is closer and still on the counter
    const left = hit[0] - 6;
    const right = hit[1] + 6;
    const ok = (v: number) => v >= a + 3 && v <= b - 3;
    if (ok(left) && (Math.abs(left - x) <= Math.abs(right - x) || !ok(right))) return left;
    return ok(right) ? right : x;
  });
}

/** Proposes the whole MEP plan for the kitchen as drawn. Replaces what was proposed before; keeps pieces added by hand. */
export function layoutMep(design: DesignData, makeId: () => string): { mep: MepData; notes: string[] } {
  const prev = mepOf(design);
  const keep = prev.items.filter((m) => !m.auto);
  const items: MepItem[] = [];
  const notes: string[] = [];
  const shape = roomShape(design.room);
  const add = (m: Omit<MepItem, "id" | "auto" | "x" | "y" | "offset" | "wall"> & Partial<MepItem>) => {
    const it: MepItem = { id: makeId(), wall: null, offset: 0, x: 0, y: 0, auto: true, ...m } as MepItem;
    items.push(it);
    return it;
  };
  const onWall = (wall: string, offset: number, kind: MepKind, tag: string, aff: string, extra: Partial<MepItem> = {}) =>
    add({ kind, tag, aff, wall, offset, ...extra });

  for (const w of shape.walls) {
    if (w.open) continue;
    const here = design.items.filter((i) => i.run === w.id);
    // countertop receptacles, one counter at a time (a range or fridge splits a counter)
    const counters = spansOf(here.filter((i) => i.mountHeight === 0 && COUNTER_STYLES.has(i.style) && Math.abs(i.height - BASE_TOP) < 0.01));
    const sinks = here.filter((i) => i.style === "sink_base").map((i) => [i.offset, i.offset + i.width] as [number, number]);
    for (const [a, b] of counters) {
      for (const x of counterOutlets(a, b, sinks)) onWall(w.id, x, "duplex", "GFCI", "In the backsplash");
    }
    for (const it of here) {
      const c = it.offset + it.width / 2;
      if (it.style === "sink_base") {
        const dw = here.find((d) => d.style === "dishwasher" && Math.abs(d.offset - (it.offset + it.width)) < 1 || d.style === "dishwasher" && Math.abs(d.offset + d.width - it.offset) < 1);
        if (dw) onWall(w.id, c + (dw.offset > it.offset ? it.width / 4 : -it.width / 4), "duplex", "DW", "In the sink base");
        if (prev.disposal) {
          const gd = onWall(w.id, c - (dw && dw.offset > it.offset ? it.width / 4 : -it.width / 4), "duplex_switched", "GD", "In the sink base");
          const g = pointOn(w, c, it.depth / 2);
          add({ kind: "disposal", tag: "", aff: "Under the sink", x: g.x, y: g.y });
          // the disposal switch beside the sink, in the backsplash
          const sw = onWall(w.id, it.offset - 3 > 0 ? it.offset - 3 : it.offset + it.width + 3, "switch", "GD", "In the backsplash");
          sw.controls = [gd.id];
        }
      }
      if (it.style === "refrigerator") {
        onWall(w.id, c - 6, "duplex", "R", "Behind the refrigerator");
        onWall(w.id, c + 6, "supply_valve", "R", "Behind the refrigerator (ice maker)");
      }
      if (it.style === "range") {
        if (prev.rangeFuel === "gas") {
          onWall(w.id, c - 10, "duplex", "RA", "Behind the range, near the floor");
          onWall(w.id, c + 10, "gas_valve", "RA", "Behind the range, near the floor");
        } else if (prev.rangeFuel === "electric") onWall(w.id, c, "r240", "RA", "Behind the range, near the floor");
        else notes.push("Pick gas or electric for the range, then lay out again to place its hook-up.");
      }
      if (it.style === "hood") {
        onWall(w.id, c, "hardwired", "HV", "Inside the hood");
        // the exhaust arrow starts in front of the hood and points through the wall, clear of the hood's connection
        const p = pointOn(w, c, it.depth + 2);
        add({ kind: "exhaust", tag: "HV", aff: "", x: p.x, y: p.y, note: "Duct to the exterior, rigid metal" });
      }
      if (it.style === "wall_microwave") onWall(w.id, c, "duplex", "MW", "Inside the cabinet above");
    }
    // under-cabinet lights, one under each run of wall cabinets
    for (const [a, b] of spansOf(here.filter((i) => i.mountHeight > 0 && i.category === "wall" && i.style !== "hood"))) {
      if (b - a >= 12) onWall(w.id, a + 1, "undercabinet", "U1", "Under the wall cabinets", { length: b - a - 2 });
    }
  }

  // islands: a receptacle on the island when the local code asks for one, noted
  if (design.items.some((i) => design.islands.some((s) => s.id === i.run))) notes.push("Check the island receptacle the local code asks for, and add it on the island side or end.");

  // recessed lights: a row over the front of each counter, then the open floor
  const lights: Vec[] = [];
  for (const w of shape.walls) {
    if (w.open) continue;
    const base = design.items.filter((i) => i.run === w.id && i.mountHeight === 0);
    for (const [a, b] of spansOf(base)) {
      const len = b - a;
      if (len < 24) continue;
      const n = Math.max(1, Math.round(len / 48));
      for (let i = 0; i < n; i++) {
        const s = a + (len * (i + 0.5)) / n;
        lights.push(pointOn(w, s, 27));
      }
    }
  }
  const tooClose = (p: Vec, d: number) => lights.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < d);
  const islandRects = design.islands.filter((s) => design.items.some((i) => i.run === s.id)).map((s) => islandRect(design, s));
  const B = shape.bounds;
  const t = design.room.wallThickness ?? 4.5;
  for (let y = B.y0 + t + 60; y < B.y1 - t - 36; y += 60) {
    for (let x = B.x0 + t + 60; x < B.x1 - t - 36; x += 60) {
      const p = { x, y };
      if (!insideRoom(design.room, p) || tooClose(p, 40)) continue;
      if (islandRects.some((r) => x > r.x0 - 12 && x < r.x1 + 12 && y > r.y0 - 12 && y < r.y1 + 12)) continue;
      lights.push(p);
    }
  }
  const cans = lights.map((p) => add({ kind: "recessed", tag: "R1", aff: "Ceiling", x: p.x, y: p.y }));

  // pendants over each island
  const pendants: MepItem[] = [];
  for (const r of islandRects) {
    const long = r.x1 - r.x0 >= r.y1 - r.y0;
    const len = long ? r.x1 - r.x0 : r.y1 - r.y0;
    const n = Math.min(3, Math.max(1, Math.round(len / 36)));
    for (let i = 0; i < n; i++) {
      const k = (i + 0.5) / n;
      const x = long ? r.x0 + len * k : (r.x0 + r.x1) / 2;
      const y = long ? (r.y0 + r.y1) / 2 : r.y0 + len * k;
      pendants.push(add({ kind: "pendant", tag: "P1", aff: "Ceiling, hung over the island", x, y }));
    }
  }
  const under = items.filter((m) => m.kind === "undercabinet");

  // switches: a gang by the entry door, on the latch side
  const door = design.openings.find((o) => o.type === "door");
  let at: { wall: string; s: number; step: number } | null = null;
  if (door) {
    const f = runFrame(design, door.wall);
    const latchRight = door.hinge === "left";
    const s = latchRight ? door.offset + door.width + 2.5 + 3 : door.offset - 2.5 - 3;
    if (f) at = { wall: door.wall, s: Math.max(2, Math.min(f.length - 2, s)), step: latchRight ? 4.5 : -4.5 };
  } else {
    const w = shape.walls.find((x) => !x.open && !design.items.some((i) => i.run === x.id)) ?? shape.walls.find((x) => !x.open);
    if (w) at = { wall: w.id, s: 6, step: 4.5 };
    notes.push("There is no door on the plan, so the switches were put at the end of a wall. Move them where they belong.");
  }
  if (at) {
    let k = 0;
    for (const [group, tag] of [[cans, "DM"], [pendants, "DM"], [under, ""]] as const) {
      if (!group.length) continue;
      const sw = onWall(at.wall, at.s + at.step * k++, "switch", tag, `48" AFF`);
      sw.controls = group.map((g) => g.id);
    }
  }

  notes.unshift(`Laid out ${items.filter((m) => MEP_KINDS[m.kind].group === "electrical").length} outlets and connections, ${cans.length + pendants.length + under.length} lights and ${items.filter((m) => m.kind === "switch").length} switches.`);
  return { mep: { ...prev, items: [...keep, ...items] }, notes };
}

/** A piece added by hand from the palette: on the chosen wall, or in the middle of the room. */
export function newMepItem(design: DesignData, kind: MepKind, wall: string | null, makeId: () => string): MepItem {
  const info = MEP_KINDS[kind];
  const shape = roomShape(design.room);
  const B = shape.bounds;
  const center = { x: (B.x0 + B.x1) / 2, y: (B.y0 + B.y1) / 2 };
  const w = shape.walls.find((x) => x.id === wall && !x.open) ?? shape.walls.find((x) => !x.open);
  const tag = kind === "duplex" ? "" : kind === "recessed" ? "R1" : kind === "pendant" ? "P1" : kind === "ceiling_light" ? "C1" : kind === "sconce" ? "S1" : kind === "undercabinet" ? "U1" : "";
  const aff = kind === "switch" || kind === "thermostat" ? `48" AFF` : info.mount === "ceiling" ? "Ceiling" : info.mount === "floor" ? "Floor" : "";
  if (info.mount === "wall" && w) {
    const taken = mepOf(design).items.filter((m) => m.wall === w.id).map((m) => m.offset);
    let s = w.length / 2;
    while (taken.some((o) => Math.abs(o - s) < 6) && s < w.length - 6) s += 8;
    return { id: makeId(), kind, tag, wall: w.id, offset: s, x: 0, y: 0, aff, length: kind === "undercabinet" ? 30 : undefined };
  }
  return { id: makeId(), kind, tag, wall: null, offset: 0, x: center.x, y: center.y, aff };
}

/** Moves a piece: wall pieces slide along (and can change to) the nearest wall; the rest move freely. */
export function moveMep(design: DesignData, m: MepItem, to: Vec): MepItem {
  if (MEP_KINDS[m.kind].mount !== "wall") return { ...m, x: to.x, y: to.y };
  let best: { wall: string; s: number; d: number } | null = null;
  for (const w of roomShape(design.room).walls) {
    if (w.open) continue;
    const dx = to.x - w.origin.x;
    const dy = to.y - w.origin.y;
    const s = Math.max(1, Math.min(w.length - 1, dx * w.u.x + dy * w.u.y));
    const p = pointOn(w, s, 0);
    const d = Math.hypot(p.x - to.x, p.y - to.y);
    if (!best || d < best.d) best = { wall: w.id, s, d };
  }
  return best ? { ...m, wall: best.wall, offset: Math.round(best.s * 2) / 2 } : m;
}
