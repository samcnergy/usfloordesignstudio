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

export type WallId = string;

export interface Wall {
  id: string; // stable id; the letter shown (A, B, C...) comes from the wall's position
  length: number;
  // Angle inside the room at the end of this wall, where it meets the next one, in degrees.
  // 90 is a normal corner, 270 the inside corner of an L, 135 an angled corner.
  corner: number;
  open?: boolean; // no wall here, the kitchen opens to another room
}

export interface Room {
  // Walls in order, clockwise around the room starting with Wall A (top of the top view, drawn left to right).
  // The last wall always closes the shape, so its length and the two corners around it are worked out.
  walls: Wall[];
  ceiling: number;
  wallThickness: number;
  // Direction of Wall A in the top view, degrees clockwise from pointing right. Only set for
  // rooms drawn with the mouse that have no straight top wall to start from.
  rotation?: number;
}

/**
 * A free standing run of cabinets: an island, a peninsula, or a single piece
 * lifted off a wall. It stands anywhere on the floor at any angle.
 */
export interface Island {
  id: string;
  name: string;
  x: number; // left end of the island's back line, in room coordinates
  y: number;
  rotation: number; // degrees clockwise from pointing right in the top view
  auto?: boolean; // made by dragging a piece off a wall; goes away when nothing is left on it
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
    room: rectangleRoom(144, 120),
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

export function rectangleRoom(width: number, depth: number, ceiling = 96, wallThickness = 4.5): Room {
  return {
    walls: [
      { id: "A", length: width, corner: 90 },
      { id: "B", length: depth, corner: 90 },
      { id: "C", length: width, corner: 90 },
      { id: "D", length: depth, corner: 90 },
    ],
    ceiling,
    wallThickness,
  };
}

/** Designs saved before custom room shapes stored only width and depth. */
export function normalizeRoom(raw: unknown): Room {
  const r = (raw ?? {}) as Partial<Room> & { width?: number; depth?: number };
  const ceiling = typeof r.ceiling === "number" ? r.ceiling : 96;
  const wallThickness = typeof r.wallThickness === "number" ? r.wallThickness : 4.5;
  if (Array.isArray(r.walls) && r.walls.length >= 3) {
    return {
      walls: r.walls.map((w) => ({ id: String(w.id), length: Number(w.length) || 0, corner: Number(w.corner) || 90, ...(w.open ? { open: true } : {}) })),
      ceiling,
      wallThickness,
      ...(typeof r.rotation === "number" && r.rotation !== 0 ? { rotation: r.rotation } : {}),
    };
  }
  return rectangleRoom(typeof r.width === "number" ? r.width : 144, typeof r.depth === "number" ? r.depth : 120, ceiling, wallThickness);
}
