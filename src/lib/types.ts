// Shared types for US Floor Design Studio.
// All lengths are in inches.

export type Category = "base" | "wall" | "tall" | "vanity" | "appliance" | "filler" | "panel" | "accessory";

export const CATEGORIES: Category[] = ["base", "wall", "tall", "vanity", "appliance", "filler", "panel", "accessory"];

// Style decides how a piece is drawn in the front view.
export type Style =
  | "base"
  | "drawer_base"
  | "sink_base"
  | "blind_corner_base"
  | "lazy_susan"
  | "open_shelf"
  | "wall"
  | "wall_blind_corner"
  | "wall_diagonal"
  | "wall_microwave"
  | "wine_rack"
  | "plate_rack"
  | "tall_pantry"
  | "tall_oven"
  | "vanity_combo"
  | "range"
  | "refrigerator"
  | "dishwasher"
  | "hood"
  | "filler"
  | "panel"
  | "accessory";

export const STYLES: Style[] = [
  "base", "drawer_base", "sink_base", "blind_corner_base", "lazy_susan", "open_shelf",
  "wall", "wall_blind_corner", "wall_diagonal", "wall_microwave", "wine_rack", "plate_rack",
  "tall_pantry", "tall_oven", "vanity_combo",
  "range", "refrigerator", "dishwasher", "hood", "filler", "panel", "accessory",
];

export type DoorStyle = "shaker" | "slab" | "raised";

export interface Manufacturer {
  id: string;
  name: string;
  website: string | null;
  notes: string | null;
  sort: number;
  active: boolean;
}

export interface ProductLine {
  id: string;
  manufacturer_id: string;
  name: string;
  construction: "framed" | "frameless" | "other";
  features: string | null;
  sort: number;
  active: boolean;
}

export interface Product {
  id: string;
  line_id: string;
  sku: string;
  name: string;
  description: string | null;
  category: Category;
  style: Style;
  width: number | null;
  height: number | null;
  depth: number | null;
  mount_height: number | null; // floor to bottom, for wall-hung pieces
  doors: number;
  drawers: number;
  shelves: number;
  split_height: number | null; // tall pieces built as two boxes: height of the lower box
  placeable: boolean; // false for order-only accessories (molding, trays, panels for ends)
  image_url: string | null;
  source_url: string | null;
  sort: number;
  active: boolean;
}

export interface Finish {
  id: string;
  line_id: string | null;
  name: string;
  vendor: string | null;
  color_hex: string;
  image_url: string | null;
  source_url: string | null;
  door_style: DoorStyle;
  fill_mode: "color" | "photo"; // photo tiles the swatch picture over the cabinets
  sort: number;
  active: boolean;
}

export interface Countertop {
  id: string;
  name: string;
  color_hex: string;
  image_url: string | null;
  thickness: number;
  sort: number;
  active: boolean;
}

export interface Catalog {
  manufacturers: Manufacturer[];
  lines: ProductLine[];
  products: Product[];
  finishes: Finish[];
  countertops: Countertop[];
}

export type WallId = "A" | "B" | "C" | "D";
export const WALLS: WallId[] = ["A", "B", "C", "D"];

export interface Room {
  width: number; // left to right in top view (walls A and C)
  depth: number; // top to bottom in top view (walls B and D)
  ceiling: number;
  wallThickness: number;
}

export interface Island {
  id: string;
  name: string;
  x: number; // left end of the island's back line, in room coordinates
  y: number;
  rotation: 0 | 90 | 180 | 270;
}

export type OpeningType = "door" | "window" | "opening";

export interface Opening {
  id: string;
  wall: WallId;
  type: OpeningType;
  offset: number; // from the left end of the wall, standing in the room facing it
  width: number;
  height: number;
  sill: number; // windows only, floor to bottom of window
  hinge: "left" | "right"; // doors only
}

export interface PlacedItem {
  id: string;
  productId?: string;
  cabinetId?: string; // designs made before the SKU catalog
  // Snapshot of the catalog piece, so a saved design keeps drawing the same
  // even if the catalog changes later.
  code: string; // SKU
  name: string;
  lineName?: string;
  category: Category;
  style: Style;
  run: string; // "A" | "B" | "C" | "D" or an island id
  offset: number;
  width: number;
  height: number;
  depth: number;
  mountHeight: number; // floor to bottom of the piece (0 for floor-standing)
  doors?: number;
  drawers?: number;
  splitHeight?: number | null;
  finishId: string | null; // null means the design default
  hinge: "left" | "right";
}

// Order-only items that are not drawn: molding, roll-out trays, panels, and so on.
export interface ExtraItem {
  id: string;
  productId: string;
  code: string;
  name: string;
  lineName: string;
  qty: number;
  finishId: string | null;
}

export interface DesignPhoto {
  id: string;
  url: string;
  caption: string;
}

export interface DesignData {
  version: 1;
  room: Room;
  islands: Island[];
  openings: Opening[];
  items: PlacedItem[];
  lineId: string | null; // cabinet line the designer is working from
  finishId: string | null;
  countertopId: string | null;
  photos: DesignPhoto[];
  extras: ExtraItem[];
}

export interface DesignRecord {
  id: string;
  name: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  designer_name: string | null;
  notes: string | null;
  data: DesignData;
  created_at: string;
  updated_at: string;
}

export function emptyDesign(): DesignData {
  return {
    version: 1,
    room: { width: 144, depth: 120, ceiling: 96, wallThickness: 4.5 },
    islands: [],
    openings: [],
    items: [],
    lineId: null,
    finishId: null,
    countertopId: null,
    photos: [],
    extras: [],
  };
}
