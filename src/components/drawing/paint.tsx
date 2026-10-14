// Fill colors and image patterns shared by the top view and the front views.

import type { Catalog, DesignData, DoorStyle, Finish, PlacedItem } from "@/lib/types";

export const STAINLESS = "#C9CCCE";
export const LINE = "#1A1D1F";
export const SELECT = "#B8912F";
export const PROBLEM = "#D03238";

export function luminance(hex: string): number {
  const m = hex.replace("#", "");
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return 1;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Line color that stays readable on top of a fill. */
export function inkOn(hex: string): string {
  return luminance(hex) < 0.35 ? "#ECEAE4" : LINE;
}

export interface Paint {
  color: string; // solid color, always present
  fill: string; // pattern url when the finish has a photo, otherwise the color
  ink: string;
  doorStyle: DoorStyle;
}

const isAppliance = (it: Pick<PlacedItem, "category">) => it.category === "appliance";

/** The color a piece is drawn in: its own, else the design's, else the first color of its line. */
export function finishFor(catalog: Catalog, design: DesignData, item: Pick<PlacedItem, "finishId" | "productId">): Finish | undefined {
  const own = catalog.finishes.find((f) => f.id === item.finishId);
  if (own) return own;
  const designFinish = catalog.finishes.find((f) => f.id === design.finishId);
  if (designFinish) return designFinish;
  const product = catalog.products.find((p) => p.id === item.productId);
  const lineId = product?.line_id ?? design.lineId;
  return catalog.finishes.find((f) => f.line_id === lineId) ?? catalog.finishes[0];
}

export function finishPaint(catalog: Catalog, design: DesignData, item: PlacedItem): Paint {
  if (isAppliance(item)) return { color: STAINLESS, fill: STAINLESS, ink: LINE, doorStyle: "slab" };
  const finish = finishFor(catalog, design, item);
  if (!finish) return { color: "#E8E6E0", fill: "#E8E6E0", ink: LINE, doorStyle: "shaker" };
  return {
    color: finish.color_hex,
    fill: finish.image_url && finish.fill_mode === "photo" ? `url(#fin-${finish.id})` : finish.color_hex,
    ink: inkOn(finish.color_hex),
    doorStyle: finish.door_style,
  };
}

export function counterPaint(catalog: Catalog, design: DesignData): Paint {
  const top = catalog.countertops.find((c) => c.id === design.countertopId) ?? catalog.countertops[0];
  if (!top) return { color: "#EEEDEA", fill: "#EEEDEA", ink: LINE, doorStyle: "slab" };
  return {
    color: top.color_hex,
    fill: top.image_url ? `url(#ctr-${top.id})` : top.color_hex,
    ink: inkOn(top.color_hex),
    doorStyle: "slab",
  };
}

/** <defs> with one image pattern per finish or countertop that has a photo. Tiles are in inches. */
export function PaintDefs({ catalog }: { catalog: Catalog }) {
  return (
    <defs>
      {catalog.finishes
        .filter((f) => f.image_url && f.fill_mode === "photo")
        .map((f) => (
          <pattern key={f.id} id={`fin-${f.id}`} patternUnits="userSpaceOnUse" width={24} height={24}>
            <rect width={24} height={24} fill={f.color_hex} />
            <image href={f.image_url!} width={24} height={24} preserveAspectRatio="xMidYMid slice" />
          </pattern>
        ))}
      {catalog.countertops
        .filter((c) => c.image_url)
        .map((c) => (
          <pattern key={c.id} id={`ctr-${c.id}`} patternUnits="userSpaceOnUse" width={48} height={48}>
            <rect width={48} height={48} fill={c.color_hex} />
            <image href={c.image_url!} width={48} height={48} preserveAspectRatio="xMidYMid slice" />
          </pattern>
        ))}
    </defs>
  );
}
