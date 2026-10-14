// Sample catalog for the development sandbox (/sandbox), which runs without a database.
// It mirrors what is loaded in Supabase: the Generic appliances from migration 0003 and a
// slice of the Top King lines from migration 0004 plus Catalog > Import. The products are
// run through the same importer the app uses, so the sandbox exercises that code too.

import { inferProduct } from "./import/infer";
import type { Catalog, Finish, Product } from "./types";

const GENERIC = "0d000000-0000-4000-8000-000000000001";
const APPLIANCES = "0e000000-0000-4000-8000-000000000001";
const TOPKING = "0d000000-0000-4000-8000-000000000101";
const AMERICAN = "0e000000-0000-4000-8000-000000000101";
const EUROPEAN = "0e000000-0000-4000-8000-000000000102";

const appliances: [string, string, Product["style"], number, number, number, number | null][] = [
  ["RNG30", "Range", "range", 30, 36, 26, null],
  ["RNG36", "Range", "range", 36, 36, 26, null],
  ["REF30", "Refrigerator", "refrigerator", 30, 70, 30, null],
  ["REF36", "Refrigerator", "refrigerator", 36, 70, 30, null],
  ["DW24", "Dishwasher", "dishwasher", 24, 34.5, 24, null],
  ["HD30", "Range hood", "hood", 30, 30, 20, 66],
  ["HD36", "Range hood", "hood", 36, 30, 20, 66],
];

// [sku, vendor heading, vendor description], as published on topkingcabinets.com
const american: [string, string, string][] = [
  ["B09", "Base Cabinet", `Base Cabinet- 9"(W) x 34 1/2"(H) x 24"(D)1 Full Door -1 Shelf`],
  ["B12", "Base Cabinet", `Base Cabinet- 12"(W) x 34 1/2"(H) x 24"(D)1 Drawer -1 Door -1 Shelf`],
  ["B15", "Base Cabinet", `Base Cabinet- 15"(W) x 34 1/2"(H) x 24"(D) / Trash Can Accessories (Options)1 Drawer -1 Door -1 Shelf`],
  ["B18", "Base Cabinet", `Base Cabinet- 18"(W) x 34 1/2"(H) x 24"(D) / Trash Can Accessories (Options)1 Drawer -1 Door -1 Shelf`],
  ["B24", "Base Cabinet", `Base Cabinet- 24"(W) x 34 1/2"(H) x 24"(D)1 Drawer -2 Door -1 Shelf`],
  ["B30", "Base Cabinet", `Base Cabinet- 30"(W) x 34 1/2"(H) x 24"(D)1 Drawer -2Door -1 Shelf`],
  ["B36", "Base Cabinet", `Base Cabinet- 36"(W) x 34 1/2"(H) x 24"(D)1 Drawer -2 Door -1 Shelf`],
  ["DB18-3", "Drawer Base Cabinet", `Base Drawer Cabinet- 18"(W) x 34 1/2"(H) x 24"(D)3 Drawer`],
  ["DB30-2", "Drawer Base Cabinet", `Base Drawer Cabinet- 30"(W) x 34 1/2"(H) x 24"(D)2 Drawer`],
  ["SB33", "Base Cabinet", `Sink Base Cabinet- 33"(W) x 34 1/2"(H) x 24"(D)1 Drawer Panel -2 Door`],
  ["SB36", "Base Cabinet", `Sink Base Cabinet- 36"(W) x 34 1/2"(H) x 24"(D)1 Drawer Panel -2 Door`],
  ["BBC39/42", "Base Cabinet", `Blind Corner Cabinet 36''(W) x 34-1/2''(H) x 24''(D) - 1 ShelvesDoor Size 14.75"W x 34-1/2"H`],
  ["BLS36", "Base Cabinet", `Lazy Susan Corner Base Cabinet : 1 Box- 36''(W) x 34-1/2''(H) x 24''(D) With Wood Tray Set`],
  ["BES09", "Base Cabinet", `Base End Shelves: 09''(W) x 34-1/2''(H) x 24''(D) With Wood Tray Set`],
  ["UT188424", "Pantry Cabinet", `Pantry Cabinet : 18''(W) x 84''(H) x 24''(D)2 Box- 18''(W) x 54''(H) x 24''(D) (3 shelves) + 18''(W) x 30''(H) x 24''(D) (2 shelves)`],
  ["UT249024", "Pantry Cabinet", `Pantry Cabinet : 24''(W) x 90''(H) x 24''(D)2 Box- 24''(W) x 54''(H) x 24''(D) (3 shelves) + 24''(W) x 36''(H) x 24''(D) (2 shelves)`],
  ["OV3184", "Pantry Cabinet", `Oven Cabinet : 31''(W) x 84''(H) x 24''(D)`],
  ["W1530", 'Wall 30"H', `Wall Cabinet : 15''(W) x 30''(H) x 12''(D) 1 Door-2 Shelves`],
  ["W1830", 'Wall 30"H', `Wall Cabinet : 18''(W) x 30''(H) x 12''(D)1 Door-2 Shelves`],
  ["W2430", 'Wall 30"H', `Wall Cabinet : 24''(W) x 30''(H) x 12''(D)2 Door-2 Shelves`],
  ["W3030", 'Wall 30"H', `Wall Cabinet : 30''(W) x 30''(H) x 12''(D)2 Door-2 Shelves`],
  ["W3330", 'Wall 30"H', `Wall Cabinet : 33''(W) x 30''(H) x 12''(D)2 Door-2 Shelves`],
  ["W1536", 'Wall 36"H', `Wall Cabinet : 15''(W) x 36''(H) x 12''(D)1 Door-2 Shelves`],
  ["W2436", 'Wall 36"H', `Wall Cabinet : 24''(W) x 36''(H) x 12''(D)2 Door-2 Shelves`],
  ["W3036", 'Wall 36"H', `Wall Cabinet : 30''(W) x 36''(H) x 12''(D)2 Door-2 Shelves`],
  ["W3015", "Wall Bridge Cabinet", `Wall Bridge Cabinet : 30''(W) x 15''(H) x 12''(D)2 Door`],
  ["W361524", "Wall Bridge Cabinet", `Wall Bridge Cabinet : 36''(W) x 15''(H) x 24''(D)2 Door`],
  ["WDC2430", 'Wall 30"H', `Wall Diagonal Corner Cabinet : 24''(W) x 30''(H) x 12''(D)1 Door`],
  ["WM2730", 'Wall 30"H', `Wall Microwave Cabinet : 27''(W) x 30''(H) x 12''(D)2 Door`],
  ["WR3015", "Wall Bridge Cabinet", `Wine Rack: 30''(W) x 15''(H) x 12''(D)`],
  ["PR3015", "Wall Bridge Cabinet", `Wine Rack: 30''(W) x 15''(H) x 12''(D)`],
  ["VSB30", "Vanity Cabinet", `Vanity : 1 Box- 30''(W) x 34-1/2''(H) x 21''(D)2 Doors`],
  ["VC36L/R", "Vanity Cabinet", `Vanity : 1 Box- 36''(W) x 34-1/2''(H) x 21''(D)2 Doors - 2 DrawersTwo options: drawer left side or right side`],
  ["BF3", "Accessories", `Base Filler :3''(W) x 34-1/2''(H) x 1/2''(D)`],
  ["WF3", "Accessories", `Wall Filler :3''(W) x 42''(H) x 1/2''(D)`],
  ["PNL2496H", "Accessories", `Panel :24''(W) x 96''(H) x 1/2''(D)`],
  ["CM4", "Accessories", `Crown Molding: 4''(W)x 96''(L)`],
  ["TK8", "Accessories", `Toe Kick: 4''(W)x 96''(L)`],
  ["RD24", "Accessories", `Roll Out Tray: 24''(W)Wood Color`],
];

const european: [string, string, string][] = [
  ["B12-F", "European Base Cabinet- Full Door", `Base Cabinet- 12"(W) x 34 1/2"(H) x 24"(D)1 Full Door -1 Shelf`],
  ["B24-F", "European Base Cabinet- Full Door", `Base Cabinet- 24"(W) x 34 1/2"(H) x 24"(D)2 Full Door -1 Shelf`],
  ["DB30-2", "European Drawer Base Cabinet- 2 Drawers", `Base Drawer Cabinet- 30"(W) x 34 1/2"(H) x 24"(D)2 Drawer`],
  ["SB36", "European Base Cabinet", `Sink Base Cabinet- 36"(W) x 34 1/2"(H) x 24"(D)1 Drawer Panel -2 Door`],
  ["W2430", 'Wall 30"H', `Wall Cabinet : 24''(W) x 30''(H) x 12''(D)2 Door-2 Shelves`],
  ["W3040", 'Wall 40"H', `Wall Cabinet : 30''(W) x 40''(H) x 12''(D)2 Door-3 Shelves`],
];

function build(lineId: string, rows: [string, string, string][], start: number): Product[] {
  return rows.map(([sku, heading, description], i) => {
    const p = inferProduct({ sku, heading, description }, { line: null })!;
    return {
      id: `${lineId.slice(0, 24)}${String(start + i).padStart(12, "0")}`,
      line_id: lineId,
      sku: p.sku,
      name: p.name,
      description: p.description,
      category: p.category,
      style: p.style,
      width: p.width,
      height: p.height,
      depth: p.depth,
      mount_height: p.mount_height,
      doors: p.doors,
      drawers: p.drawers,
      shelves: p.shelves,
      split_height: p.split_height,
      placeable: p.placeable,
      image_url: null,
      source_url: null,
      sort: (i + 1) * 10,
      active: true,
    };
  });
}

const finish = (id: string, line: string, name: string, hex: string, door: Finish["door_style"], sort: number): Finish => ({
  id,
  line_id: line,
  name,
  vendor: "Top King",
  color_hex: hex,
  image_url: null,
  source_url: null,
  door_style: door,
  fill_mode: "color",
  sort,
  active: true,
});

export const STANDARD_CATALOG: Catalog = {
  manufacturers: [
    { id: TOPKING, name: "Top King", website: "https://topkingcabinets.com", notes: null, sort: 10, active: true },
    { id: GENERIC, name: "Generic", website: null, notes: null, sort: 999, active: true },
  ],
  lines: [
    { id: AMERICAN, manufacturer_id: TOPKING, name: "American Style", construction: "framed", features: null, sort: 10, active: true },
    { id: EUROPEAN, manufacturer_id: TOPKING, name: "European Style", construction: "frameless", features: null, sort: 20, active: true },
    { id: APPLIANCES, manufacturer_id: GENERIC, name: "Appliances", construction: "other", features: null, sort: 999, active: true },
  ],
  products: [
    ...build(AMERICAN, american, 1),
    ...build(EUROPEAN, european, 500),
    ...appliances.map(([sku, name, style, width, height, depth, mount], i) => ({
      id: `0a000000-0000-4000-8000-${String(900 + i).padStart(12, "0")}`,
      line_id: APPLIANCES,
      sku,
      name,
      description: null,
      category: "appliance" as const,
      style,
      width,
      height,
      depth,
      mount_height: mount,
      doors: 0,
      drawers: 0,
      shelves: 0,
      split_height: null,
      placeable: true,
      image_url: null,
      source_url: null,
      sort: (i + 1) * 10,
      active: true,
    })),
  ],
  finishes: [
    finish("0f000000-0000-4000-8000-000000000101", AMERICAN, "White Shaker", "#EDEDED", "shaker", 10),
    finish("0f000000-0000-4000-8000-000000000102", AMERICAN, "Grey Shaker", "#646664", "shaker", 20),
    finish("0f000000-0000-4000-8000-000000000103", AMERICAN, "Espresso Shaker", "#362518", "shaker", 30),
    finish("0f000000-0000-4000-8000-000000000104", AMERICAN, "Crimson Glaze", "#75412B", "raised", 40),
    finish("0f000000-0000-4000-8000-000000000105", AMERICAN, "Antique White", "#DADBDA", "raised", 50),
    finish("0f000000-0000-4000-8000-000000000111", EUROPEAN, "Torino Grey", "#787570", "slab", 110),
    finish("0f000000-0000-4000-8000-000000000112", EUROPEAN, "Torino Dark", "#524743", "slab", 120),
    finish("0f000000-0000-4000-8000-000000000113", EUROPEAN, "White Pet", "#F9F9F9", "slab", 130),
    finish("0f000000-0000-4000-8000-000000000114", EUROPEAN, "Matte Black", "#292A2F", "slab", 140),
    finish("0f000000-0000-4000-8000-000000000115", EUROPEAN, "White Oak", "#C6A882", "slab", 150),
  ],
  countertops: [
    { id: "0c000000-0000-4000-8000-000000000001", name: "White Quartz", color_hex: "#EFEEEA", image_url: null, thickness: 1.5, sort: 10, active: true },
    { id: "0c000000-0000-4000-8000-000000000003", name: "Gray Quartz", color_hex: "#9C9B98", image_url: null, thickness: 1.5, sort: 30, active: true },
    { id: "0c000000-0000-4000-8000-000000000004", name: "Absolute Black Granite", color_hex: "#1F1F1F", image_url: null, thickness: 1.5, sort: 40, active: true },
  ],
};
