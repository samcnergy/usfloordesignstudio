// Cabinet schedule: every placed piece and every order-only accessory, grouped by SKU, line, color,
// size and changes. Numbered the K&B way (owner, 2026-11-21): from the top-left corner, clockwise,
// base and vanity cabinets first, then wall, then tall, then fillers and panels, then appliances;
// moldings, toe kicks and other order items at the end. Changes from the catalog size and the
// hinge side of single-door pieces are listed, so the order can be checked line by line.

import { itemLabel, runLabel } from "./geometry";
import { planOrder } from "./plan";
import { roomName } from "./sheets";
import type { Catalog, DesignData } from "./types";
import { fmtIn } from "./units";

export interface ScheduleRow {
  no: number;
  room: string;
  /** Changes from the catalog piece: a cut width or height, the hinge side of a single door. */
  notes: string;
  label: string;
  description: string;
  size: string;
  line: string;
  finish: string;
  locations: string;
  qty: number;
}

export function finishName(catalog: Catalog, design: DesignData, finishId: string | null, category: string, productId?: string): string {
  if (category === "appliance") return "Appliance";
  const own = catalog.finishes.find((x) => x.id === finishId) ?? catalog.finishes.find((x) => x.id === design.finishId);
  if (own) return own.name;
  const lineId = catalog.products.find((p) => p.id === productId)?.line_id ?? design.lineId;
  return catalog.finishes.find((f) => f.line_id === lineId)?.name ?? "";
}

function lineLabel(catalog: Catalog, productId: string | undefined, fallback: string | undefined): string {
  const product = catalog.products.find((p) => p.id === productId);
  const line = catalog.lines.find((l) => l.id === product?.line_id);
  if (!line) return fallback ?? "";
  const maker = catalog.manufacturers.find((m) => m.id === line.manufacturer_id);
  return maker && maker.name !== "Generic" ? `${maker.name} ${line.name}` : line.name;
}

const GROUP: Record<string, number> = { base: 0, vanity: 0, wall: 1, tall: 2, filler: 3, panel: 3, accessory: 3, appliance: 4 };

function changes(catalog: Catalog, it: DesignData["items"][number]): string {
  const p = catalog.products.find((x) => x.id === it.productId);
  const out: string[] = [];
  if (p) {
    if (p.width !== null && Math.abs(p.width - it.width) > 0.01) out.push(`Width ${fmtIn(it.width)} (catalog ${fmtIn(p.width)})`);
    if (p.height !== null && Math.abs(p.height - it.height) > 0.01) out.push(`Height ${fmtIn(it.height)} (catalog ${fmtIn(p.height)})`);
    if (p.depth !== null && Math.abs(p.depth - it.depth) > 0.01) out.push(`Depth ${fmtIn(it.depth)} (catalog ${fmtIn(p.depth)})`);
  }
  if ((it.doors ?? 0) === 1 && it.category !== "appliance" && it.category !== "filler" && it.category !== "panel") out.push(`Hinge ${it.hinge}`);
  return out.join("; ");
}

export function buildSchedule(catalog: Catalog, design: DesignData): ScheduleRow[] {
  const rows = new Map<string, ScheduleRow & { locs: Set<string> }>();
  const order = planOrder(design);
  const room = roomName(design);
  const sorted = [...design.items].sort((a, b) => (GROUP[a.category] ?? 5) - (GROUP[b.category] ?? 5) || order(a) - order(b));
  for (const it of sorted) {
    const label = itemLabel(it);
    const finish = finishName(catalog, design, it.finishId, it.category, it.productId);
    const line = lineLabel(catalog, it.productId, it.lineName);
    const notes = changes(catalog, it);
    const key = `${label}|${line}|${finish}|${it.width}|${it.height}|${it.depth}|${notes}`;
    const existing = rows.get(key);
    const loc = runLabel(design, it.run);
    if (existing) {
      existing.qty += 1;
      existing.locs.add(loc);
    } else {
      rows.set(key, {
        no: 0,
        room,
        notes,
        label,
        description: it.name,
        size: `${fmtIn(it.width)} W x ${fmtIn(it.height)} H x ${fmtIn(it.depth)} D`,
        line,
        finish,
        locations: "",
        qty: 1,
        locs: new Set([loc]),
      });
    }
  }
  const placed = [...rows.values()].map(({ locs, ...r }) => ({ ...r, locations: [...locs].join(", ") }));
  const extras: ScheduleRow[] = (design.extras ?? []).map((x) => ({
    no: 0,
    room,
    notes: "",
    label: x.code,
    description: x.name,
    size: "",
    line: lineLabel(catalog, x.productId, x.lineName),
    finish: finishName(catalog, design, x.finishId, "accessory", x.productId),
    locations: "Order item",
    qty: x.qty,
  }));
  return [...placed, ...extras].map((r, i) => ({ ...r, no: i + 1 }));
}
