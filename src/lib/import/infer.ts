// Turns a row from a vendor price list or website into a catalog product.
// Anything the row states outright wins. Blanks are filled from the description
// ("Base Cabinet- 12"(W) x 34 1/2"(H) x 24"(D) 1 Drawer -1 Door -1 Shelf") and from
// the SKU's letters and numbers (W3036 = wall, 30 wide, 36 high).

import type { Category, Style } from "../types";
import { CATEGORIES, STYLES } from "../types";
import { parseLength } from "../units";

export interface ParsedProduct {
  line: string | null;
  sku: string;
  name: string;
  description: string | null;
  category: Category;
  style: Style;
  width: number | null;
  height: number | null;
  depth: number | null;
  mount_height: number | null;
  doors: number;
  drawers: number;
  shelves: number;
  split_height: number | null;
  placeable: boolean;
  image_url: string | null;
  source_url: string | null;
  warnings: string[];
}

export type RawRow = Record<string, string>;

const ALIASES: Record<string, string[]> = {
  sku: ["sku", "code", "item", "item #", "item no", "model", "part", "part #"],
  line: ["line", "product line", "collection", "series", "style line"],
  heading: ["heading", "vendor category", "group", "section", "type"],
  name: ["name", "title", "product name"],
  description: ["description", "desc", "details", "specs"],
  category: ["category"],
  style: ["style", "drawn as"],
  width: ["width", "w", "width (in)"],
  height: ["height", "h", "height (in)"],
  depth: ["depth", "d", "depth (in)"],
  mount_height: ["mount_height", "mount height", "mount", "hung at"],
  doors: ["doors", "door count"],
  drawers: ["drawers", "drawer count"],
  shelves: ["shelves", "shelf count"],
  split_height: ["split_height", "split height", "lower box height"],
  placeable: ["placeable", "drawn", "draw"],
  image_url: ["image_url", "image", "photo", "picture", "image url", "photo url"],
  source_url: ["source_url", "url", "link", "product url", "web page"],
};

/** Maps whatever headers a file has to our field names. Unknown columns are ignored. */
export function mapHeaders(headers: string[]): Record<number, string> {
  const out: Record<number, string> = {};
  headers.forEach((h, i) => {
    const key = h.trim().toLowerCase().replace(/[_\s]+/g, " ");
    for (const [field, names] of Object.entries(ALIASES)) {
      if (names.some((n) => n.replace(/[_\s]+/g, " ") === key)) {
        if (!Object.values(out).includes(field)) out[i] = field;
        return;
      }
    }
  });
  return out;
}

const FAMILY_STYLE: Record<string, Style> = {
  SB: "sink_base",
  VSB: "sink_base",
  DB: "drawer_base",
  VDB: "drawer_base",
  BBC: "blind_corner_base",
  WBC: "wall_blind_corner",
  BLS: "lazy_susan",
  BES: "open_shelf",
  WES: "open_shelf",
  OV: "tall_oven",
  UT: "tall_pantry",
  WDC: "wall_diagonal",
  WM: "wall_microwave",
  WR: "wine_rack",
  PR: "plate_rack",
  VC: "vanity_combo",
  VSBC: "vanity_combo",
  VSDB: "vanity_combo",
  BF: "filler",
  WF: "filler",
  TF: "filler",
  RF: "filler",
  PNL: "panel",
  B: "base",
  BSR: "base",
  W: "wall",
};

const ACCESSORY_FAMILIES = new Set(["CM", "DCM", "RCM", "OCM", "QR", "SM", "TK", "LM", "VAL", "RD", "DKD", "DWP", "SK", "BEP", "WEP", "GH"]);

// families whose first two digits are the width (and next two the height for wall and tall)
const WIDTH_FAMILIES = new Set(["B", "DB", "SB", "W", "UT", "VSB", "VDB", "VC", "VSBC", "VSDB", "WDC", "WM", "WES", "BLS", "BSR", "BES"]);
const HEIGHT_FAMILIES = new Set(["W", "UT", "WDC", "WM", "WES"]);

export function skuFamily(sku: string): string {
  return (sku.toUpperCase().replace(/\s+/g, "").match(/^[A-Z]+/) ?? [""])[0];
}

function skuNumbers(sku: string): { width: number | null; height: number | null } {
  const m = sku.toUpperCase().replace(/\s+/g, "").match(/^[A-Z]+(\d{2})(\d{2})?/);
  if (!m) return { width: null, height: null };
  return { width: parseInt(m[1], 10), height: m[2] ? parseInt(m[2], 10) : null };
}

/** Straightens the many quote marks vendors use for inches. */
function normalizeInches(s: string): string {
  return s
    .replace(/''|’’|‘‘|″|”|“/g, '"')
    .replace(/\u00a0/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2") // "2 DrawersTwo options" becomes "2 Drawers Two options"
    .replace(/\s+/g, " ")
    .trim();
}

const NUM = String.raw`(\d+(?:\.\d+)?(?:\s*[- ]\s*\d+\/\d+)?|\d+\/\d+)`;

function dimFromText(text: string, letter: "W" | "H" | "D" | "L"): number | null {
  const re = new RegExp(NUM + String.raw`\s*"?\s*\(\s*` + letter + String.raw`\s*\)`, "i");
  const m = text.match(re);
  if (!m) return null;
  return parseLength(m[1].replace(/\s*-\s*/, " "));
}

function countFrom(text: string, re: RegExp): number | null {
  let total = 0;
  let found = false;
  for (const m of text.matchAll(re)) {
    total += parseInt(m[1], 10);
    found = true;
  }
  return found ? total : null;
}

function numberField(v: string | undefined): number | null {
  if (v === undefined || v.trim() === "") return null;
  return parseLength(v);
}

function intField(v: string | undefined): number | null {
  if (v === undefined || v.trim() === "") return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function boolField(v: string | undefined): boolean | null {
  if (v === undefined || v.trim() === "") return null;
  return /^(1|y|yes|true|x)$/i.test(v.trim());
}

function inferCategory(family: string, heading: string, desc: string): Category {
  const h = heading.toLowerCase();
  const d = desc.toLowerCase();
  if (h.includes("vanity") || d.startsWith("vanity")) return "vanity";
  if (["BF", "WF", "TF", "RF"].includes(family)) return "filler";
  if (family === "PNL") return "panel";
  if (ACCESSORY_FAMILIES.has(family)) return "accessory";
  if (/pantry|tall|oven/.test(h) || family === "UT" || family === "OV") return "tall";
  if (h.includes("wall") || family.startsWith("W") || family === "PR") return "wall";
  if (/base|drawer|sink/.test(h) || family.startsWith("B") || family === "DB" || family === "SB") return "base";
  if (/accessor|molding|moulding|trim/.test(h)) return "accessory";
  if (/range|refrigerator|dishwasher|hood|appliance/.test(h + " " + d)) return "appliance";
  return "base";
}

function inferStyle(family: string, category: Category, desc: string, name: string): Style {
  if (category === "accessory") return "accessory";
  if (FAMILY_STYLE[family]) return FAMILY_STYLE[family];
  const t = (desc + " " + name).toLowerCase();
  if (category === "appliance") {
    if (t.includes("refrigerator") || t.includes("fridge")) return "refrigerator";
    if (t.includes("dishwasher")) return "dishwasher";
    if (t.includes("hood")) return "hood";
    return "range";
  }
  if (t.includes("sink")) return "sink_base";
  if (t.includes("lazy susan")) return "lazy_susan";
  if (t.includes("blind")) return category === "wall" ? "wall_blind_corner" : "blind_corner_base";
  if (t.includes("microwave")) return "wall_microwave";
  if (t.includes("oven")) return "tall_oven";
  switch (category) {
    case "wall":
      return "wall";
    case "tall":
      return "tall_pantry";
    case "filler":
      return "filler";
    case "panel":
      return "panel";
    default:
      return /drawer/.test(t) && !/door/.test(t) ? "drawer_base" : "base";
  }
}

function inferName(desc: string, fallback: string): string {
  const cut = desc.split(/\s*:\s*|\s*-\s+|\s+\d|\d+"?\s*\(/)[0] ?? "";
  const name = cut.replace(/[-\s]+$/, "").trim();
  return name || fallback;
}

export function inferProduct(row: RawRow, defaults: { line: string | null }): ParsedProduct | null {
  const sku = (row.sku ?? "").trim().replace(/\s+/g, " ");
  if (!sku) return null;
  const warnings: string[] = [];
  const family = skuFamily(sku);
  const rawDesc = normalizeInches(row.description ?? "");
  const description = rawDesc ? rawDesc.replace(/\)(?=[A-Za-z0-9])/g, ") ").replace(/\s+/g, " ") : null;
  const heading = row.heading ?? "";

  // category and style
  let category: Category | null = (row.category?.trim().toLowerCase() as Category) || null;
  if (category && !CATEGORIES.includes(category)) {
    warnings.push(`Unknown category "${row.category}", guessed instead`);
    category = null;
  }
  const cat: Category = category ?? inferCategory(family, heading, rawDesc);
  let style: Style | null = (row.style?.trim().toLowerCase() as Style) || null;
  if (style && !STYLES.includes(style)) {
    warnings.push(`Unknown style "${row.style}", guessed instead`);
    style = null;
  }
  const sty: Style = style ?? inferStyle(family, cat, rawDesc, row.name ?? "");

  // dimensions: explicit columns, then the description, then the SKU
  let width = numberField(row.width) ?? dimFromText(rawDesc, "W");
  let height = numberField(row.height) ?? dimFromText(rawDesc, "H");
  let depth = numberField(row.depth) ?? dimFromText(rawDesc, "D");
  const length = dimFromText(rawDesc, "L");
  const fromSku = skuNumbers(sku);
  if (!numberField(row.width) && WIDTH_FAMILIES.has(family) && fromSku.width) {
    if (width !== null && Math.abs(width - fromSku.width) > 0.01) {
      warnings.push(`Description says ${width}" wide but the SKU says ${fromSku.width}". Used ${fromSku.width}".`);
    }
    width = fromSku.width;
  }
  if (!numberField(row.height) && HEIGHT_FAMILIES.has(family) && fromSku.height) {
    if (height !== null && Math.abs(height - fromSku.height) > 0.01) {
      warnings.push(`Description says ${height}" high but the SKU says ${fromSku.height}". Used ${fromSku.height}".`);
    }
    height = fromSku.height;
  }
  if (height === null && length !== null && (cat === "accessory" || sty === "filler")) height = length;

  // pieces that sit at the face of a run are drawn as deep as the cabinets around them
  if (sty === "filler" && !numberField(row.depth)) {
    depth = family === "WF" ? 12 : 24;
  }
  if (sty === "panel" && !numberField(row.width) && depth !== null && width !== null && depth < 1.5) {
    const thickness = depth;
    depth = width;
    width = thickness;
  }

  // doors, drawers, shelves
  const doorsParsed = countFrom(rawDesc, /(\d+)\s*(?:Full\s+)?Doors?\b/gi);
  const drawersParsed = countFrom(rawDesc, /(\d+)\s*Drawers?\b(?!\s*Panel)/gi);
  const shelvesParsed = countFrom(rawDesc, /(\d+)\s*Shel(?:f|ves)\b/gi);
  let doors = intField(row.doors) ?? doorsParsed;
  let drawers = intField(row.drawers) ?? drawersParsed;
  const shelves = intField(row.shelves) ?? shelvesParsed ?? 0;
  const anyParsed = doors !== null || drawers !== null;
  const w = width ?? 0;
  if (!anyParsed) {
    switch (sty) {
      case "base":
        doors = w >= 24 ? 2 : 1;
        drawers = w >= 12 ? 1 : 0;
        break;
      case "drawer_base":
        drawers = 3;
        break;
      case "sink_base":
        doors = w > 24 ? 2 : 1;
        break;
      case "wall":
      case "wall_microwave":
        doors = w >= 24 ? 2 : 1;
        break;
      case "tall_pantry":
      case "tall_oven":
        doors = w >= 24 ? 2 : 1;
        break;
      case "wall_diagonal":
      case "wall_blind_corner":
      case "blind_corner_base":
      case "lazy_susan":
        doors = 1;
        break;
    }
  }
  doors = doors ?? 0;
  drawers = drawers ?? 0;

  // tall cabinets built as two boxes
  let split = numberField(row.split_height);
  if (split === null) {
    const m = rawDesc.match(new RegExp(String.raw`2 Box-?\s*` + NUM + String.raw`\s*"?\s*\(\s*W\s*\)\s*x\s*` + NUM + String.raw`\s*"?\s*\(\s*H\s*\)`, "i"));
    if (m) split = parseLength(m[2].replace(/\s*-\s*/, " "));
  }

  // where wall pieces hang
  let mount = numberField(row.mount_height);
  if (mount === null) {
    const bridge = /bridge/i.test(heading) || sty === "wine_rack" || sty === "plate_rack";
    if (cat === "wall") {
      mount = height !== null && (bridge || height <= 24) ? Math.max(54, 84 - height) : 54;
    } else if (sty === "filler" && family === "WF") {
      mount = 54;
    } else if (sty === "panel" && height !== null && height <= 42 && depth !== null && depth <= 13) {
      mount = 54;
    } else if (sty === "hood") {
      mount = 66;
    }
  }

  // name
  let name = (row.name ?? "").trim() || inferName(rawDesc, heading || sku);
  if (!row.name && sty === "base" && drawers === 0 && doors > 0 && cat === "base" && family === "B") name += ", full door";
  if (!row.name && sty === "drawer_base" && drawers > 0) name += `, ${drawers} drawers`;

  // can it be drawn?
  let placeable = boolField(row.placeable) ?? cat !== "accessory";
  if (placeable && (width === null || height === null || depth === null)) {
    warnings.push("Missing a width, height or depth, so it is listed as order-only until the size is filled in");
    placeable = false;
  }

  return {
    line: (row.line ?? "").trim() || defaults.line,
    sku,
    name,
    description,
    category: cat,
    style: sty,
    width,
    height,
    depth,
    mount_height: mount,
    doors,
    drawers,
    shelves,
    split_height: split,
    placeable,
    image_url: (row.image_url ?? "").trim() || null,
    source_url: (row.source_url ?? "").trim() || null,
    warnings,
  };
}
