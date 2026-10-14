// Order list: every placed piece and every order-only accessory, grouped by SKU, line and color.

import { itemLabel, runLabel } from "./geometry";
import type { Catalog, DesignData } from "./types";
import { fmtIn } from "./units";

export interface ScheduleRow {
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

const ORDER = ["base", "wall", "tall", "vanity", "filler", "panel", "accessory", "appliance"];

export function buildSchedule(catalog: Catalog, design: DesignData): ScheduleRow[] {
  const rows = new Map<string, ScheduleRow & { locs: Set<string> }>();
  const sorted = [...design.items].sort(
    (a, b) => ORDER.indexOf(a.category) - ORDER.indexOf(b.category) || a.code.localeCompare(b.code) || a.width - b.width || a.height - b.height,
  );
  for (const it of sorted) {
    const label = itemLabel(it);
    const finish = finishName(catalog, design, it.finishId, it.category, it.productId);
    const line = lineLabel(catalog, it.productId, it.lineName);
    const key = `${label}|${line}|${finish}|${it.width}|${it.height}|${it.depth}`;
    const existing = rows.get(key);
    const loc = runLabel(design, it.run);
    if (existing) {
      existing.qty += 1;
      existing.locs.add(loc);
    } else {
      rows.set(key, {
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
    label: x.code,
    description: x.name,
    size: "",
    line: lineLabel(catalog, x.productId, x.lineName),
    finish: finishName(catalog, design, x.finishId, "accessory", x.productId),
    locations: "Order item",
    qty: x.qty,
  }));
  return [...placed, ...extras];
}
