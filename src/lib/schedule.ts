// Cabinet schedule: every placed piece grouped by label, finish and location.

import { itemLabel, runLabel } from "./geometry";
import type { Catalog, DesignData } from "./types";
import { fmtIn } from "./units";

export interface ScheduleRow {
  label: string;
  description: string;
  size: string;
  finish: string;
  locations: string;
  qty: number;
}

export function finishName(catalog: Catalog, design: DesignData, finishId: string | null, category: string): string {
  if (category === "appliance") return "Appliance";
  const f = catalog.finishes.find((x) => x.id === finishId) ?? catalog.finishes.find((x) => x.id === design.finishId) ?? catalog.finishes[0];
  return f?.name ?? "";
}

export function buildSchedule(catalog: Catalog, design: DesignData): ScheduleRow[] {
  const rows = new Map<string, ScheduleRow & { locs: Set<string> }>();
  const order = ["base", "wall", "tall", "appliance", "filler"];
  const sorted = [...design.items].sort(
    (a, b) => order.indexOf(a.category) - order.indexOf(b.category) || a.code.localeCompare(b.code) || a.width - b.width || a.height - b.height,
  );
  for (const it of sorted) {
    const label = itemLabel(it);
    const finish = finishName(catalog, design, it.finishId, it.category);
    const key = `${label}|${finish}|${it.depth}`;
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
        finish,
        locations: "",
        qty: 1,
        locs: new Set([loc]),
      });
    }
  }
  return [...rows.values()].map(({ locs, ...r }) => ({ ...r, locations: [...locs].join(", ") }));
}
