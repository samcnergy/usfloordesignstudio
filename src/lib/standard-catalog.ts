// Industry-standard starting catalog. The same rows are seeded into Supabase by
// supabase/migrations/0002_seed_standard_catalog.sql (generated from this file
// with `node scripts/generate-seed.mjs`). Real product lines, colors and photos
// are added on the Catalog page.

import type { Catalog, CatalogCabinet, Countertop, Finish } from "./types";

const range = (from: number, to: number, step: number) => {
  const out: number[] = [];
  for (let v = from; v <= to; v += step) out.push(v);
  return out;
};

type CabinetSeed = Omit<CatalogCabinet, "image_url" | "active" | "sort">;

const cabinetSeeds: CabinetSeed[] = [
  // Base cabinets: 34 1/2" tall with toe kick, 24" deep. Counter brings them to 36".
  { id: "0a000000-0000-4000-8000-000000000001", code: "B", name: "Base cabinet", category: "base", style: "base", widths: [...range(9, 36, 3), 42, 48], heights: [34.5], default_height: 34.5, depth: 24, mount_height: null },
  { id: "0a000000-0000-4000-8000-000000000002", code: "DB", name: "Drawer base, 3 drawers", category: "base", style: "drawer_base", widths: [12, 15, 18, 21, 24, 30, 36], heights: [34.5], default_height: 34.5, depth: 24, mount_height: null },
  { id: "0a000000-0000-4000-8000-000000000003", code: "SB", name: "Sink base", category: "base", style: "sink_base", widths: [24, 27, 30, 33, 36, 42], heights: [34.5], default_height: 34.5, depth: 24, mount_height: null },
  { id: "0a000000-0000-4000-8000-000000000004", code: "BBC", name: "Blind corner base", category: "base", style: "blind_corner_base", widths: [36, 39, 42, 45, 48], heights: [34.5], default_height: 34.5, depth: 24, mount_height: null },

  // Wall cabinets: 12" deep, hung with the bottom at 54" (18" above the counter).
  { id: "0a000000-0000-4000-8000-000000000011", code: "W", name: "Wall cabinet", category: "wall", style: "wall", widths: [...range(9, 36, 3), 42], heights: [12, 15, 18, 24, 30, 36, 42], default_height: 30, depth: 12, mount_height: 54 },
  { id: "0a000000-0000-4000-8000-000000000012", code: "WBC", name: "Wall blind corner", category: "wall", style: "wall_blind_corner", widths: [24, 27, 30, 36], heights: [30, 36, 42], default_height: 30, depth: 12, mount_height: 54 },

  // Tall cabinets.
  { id: "0a000000-0000-4000-8000-000000000021", code: "P", name: "Pantry cabinet", category: "tall", style: "tall_pantry", widths: [18, 24, 30, 36], heights: [84, 90, 96], default_height: 84, depth: 24, mount_height: null },
  { id: "0a000000-0000-4000-8000-000000000022", code: "OV", name: "Oven cabinet", category: "tall", style: "tall_oven", widths: [30, 33], heights: [84, 90, 96], default_height: 84, depth: 24, mount_height: null },

  // Appliances, drawn so the layout reads correctly.
  { id: "0a000000-0000-4000-8000-000000000031", code: "RNG", name: "Range", category: "appliance", style: "range", widths: [30, 36, 48], heights: [36], default_height: 36, depth: 26, mount_height: null },
  { id: "0a000000-0000-4000-8000-000000000032", code: "REF", name: "Refrigerator", category: "appliance", style: "refrigerator", widths: [30, 33, 36, 42], heights: [70, 72, 84], default_height: 70, depth: 30, mount_height: null },
  { id: "0a000000-0000-4000-8000-000000000033", code: "DW", name: "Dishwasher", category: "appliance", style: "dishwasher", widths: [18, 24], heights: [34.5], default_height: 34.5, depth: 24, mount_height: null },
  { id: "0a000000-0000-4000-8000-000000000034", code: "HD", name: "Range hood", category: "appliance", style: "hood", widths: [30, 36, 48], heights: [24, 30, 36], default_height: 30, depth: 20, mount_height: 66 },

  // Fillers and panels.
  { id: "0a000000-0000-4000-8000-000000000041", code: "BF", name: "Base filler", category: "filler", style: "filler", widths: [1.5, 3, 6], heights: [34.5], default_height: 34.5, depth: 24, mount_height: null },
  { id: "0a000000-0000-4000-8000-000000000042", code: "WF", name: "Wall filler", category: "filler", style: "filler", widths: [1.5, 3, 6], heights: [30, 36, 42], default_height: 30, depth: 12, mount_height: 54 },
  { id: "0a000000-0000-4000-8000-000000000043", code: "PNL", name: "End panel", category: "filler", style: "panel", widths: [0.75], heights: [34.5, 84, 90, 96], default_height: 34.5, depth: 24, mount_height: null },
];

const finishSeeds: Omit<Finish, "image_url" | "active" | "sort">[] = [
  { id: "0b000000-0000-4000-8000-000000000001", name: "White Shaker", vendor: null, color_hex: "#F3F1EA" },
  { id: "0b000000-0000-4000-8000-000000000002", name: "Dove Gray", vendor: null, color_hex: "#B9B6AE" },
  { id: "0b000000-0000-4000-8000-000000000003", name: "Navy", vendor: null, color_hex: "#2D3B52" },
  { id: "0b000000-0000-4000-8000-000000000004", name: "Sage Green", vendor: null, color_hex: "#8C9A7E" },
  { id: "0b000000-0000-4000-8000-000000000005", name: "Natural Oak", vendor: null, color_hex: "#C59D6E" },
  { id: "0b000000-0000-4000-8000-000000000006", name: "Espresso", vendor: null, color_hex: "#3C2B22" },
];

const countertopSeeds: Omit<Countertop, "image_url" | "active" | "sort">[] = [
  { id: "0c000000-0000-4000-8000-000000000001", name: "White Quartz", color_hex: "#EFEEEA", thickness: 1.5 },
  { id: "0c000000-0000-4000-8000-000000000002", name: "Calacatta Quartz", color_hex: "#F4F2EE", thickness: 1.5 },
  { id: "0c000000-0000-4000-8000-000000000003", name: "Gray Quartz", color_hex: "#9C9B98", thickness: 1.5 },
  { id: "0c000000-0000-4000-8000-000000000004", name: "Absolute Black Granite", color_hex: "#1F1F1F", thickness: 1.5 },
  { id: "0c000000-0000-4000-8000-000000000005", name: "Butcher Block", color_hex: "#B5824F", thickness: 1.5 },
];

export const STANDARD_CATALOG: Catalog = {
  cabinets: cabinetSeeds.map((c, i) => ({ ...c, image_url: null, active: true, sort: (i + 1) * 10 })),
  finishes: finishSeeds.map((f, i) => ({ ...f, image_url: null, active: true, sort: (i + 1) * 10 })),
  countertops: countertopSeeds.map((c, i) => ({ ...c, image_url: null, active: true, sort: (i + 1) * 10 })),
};
