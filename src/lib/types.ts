// Shared types for US Floor Design Studio.
// All lengths are in inches.

export type Category = "base" | "wall" | "tall" | "appliance" | "filler";

// Style decides how a piece is drawn in the front view and where it sits.
export type Style =
  | "base"
  | "drawer_base"
  | "sink_base"
  | "blind_corner_base"
  | "wall"
  | "wall_blind_corner"
  | "tall_pantry"
  | "tall_oven"
  | "range"
  | "refrigerator"
  | "dishwasher"
  | "hood"
  | "filler"
  | "panel";

export interface CatalogCabinet {
  id: string;
  code: string;
  name: string;
  category: Category;
  style: Style;
  widths: number[];
  heights: number[];
  default_height: number;
  depth: number;
  mount_height: number | null; // distance from floor to bottom, for wall-hung pieces
  image_url: string | null;
  sort: number;
  active: boolean;
}

export interface Finish {
  id: string;
  name: string;
  vendor: string | null;
  color_hex: string;
  image_url: string | null;
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
  cabinets: CatalogCabinet[];
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
  cabinetId: string;
  // Snapshot of the catalog piece, so a saved design keeps drawing the same
  // even if the catalog changes later.
  code: string;
  name: string;
  category: Category;
  style: Style;
  run: string; // "A" | "B" | "C" | "D" or an island id
  offset: number;
  width: number;
  height: number;
  depth: number;
  mountHeight: number; // floor to bottom of the piece (0 for floor-standing)
  finishId: string | null; // null means the design default
  hinge: "left" | "right";
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
  finishId: string | null;
  countertopId: string | null;
  photos: DesignPhoto[];
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
    finishId: null,
    countertopId: null,
    photos: [],
  };
}
