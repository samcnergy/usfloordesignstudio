// The drawing set, laid out to the K&B drawing standards (owner, 2026-11-21:
// "make sure that our system comply with these documents"). Kept in one place:
// paper sizes, the standard scales, the firm's facts for the title block, the
// disclaimers, sheet numbers, and which way each wall faces.
//
// Plain functions, no React, so the print sheet and any check share them.

import { roomShape } from "./geometry";
import type { DesignData } from "./types";

/** 11x17 (ANSI B) is the standard sheet; Letter stays available for quick handouts. */
export type Paper = "tabloid" | "letter";

export interface PaperSpec {
  label: string;
  width: number;
  height: number;
  /** The binding margin is the left one and the largest; the others are at least 1/2". */
  left: number;
  margin: number;
  /** The title block runs down the right side. */
  titleBlock: number;
}

export const PAPER: Record<Paper, PaperSpec> = {
  tabloid: { label: "11 x 17", width: 17, height: 11, left: 1, margin: 0.5, titleBlock: 2.1 },
  letter: { label: "Letter", width: 11, height: 8.5, left: 0.75, margin: 0.4, titleBlock: 1.7 },
};

/** Room left for drawings inside the border and beside the title block, in paper inches. */
export function drawingArea(p: PaperSpec): { width: number; height: number } {
  const pad = 0.15;
  return {
    width: p.width - p.left - p.margin - p.titleBlock - pad * 3,
    height: p.height - p.margin * 2 - pad * 2,
  };
}

/** A drawing scale: how many real inches one inch of paper stands for. */
export interface Scale {
  k: number;
  label: string;
}

/** Plans and elevations are drawn at 1/2" = 1'-0"; smaller only when a drawing does not fit the sheet. */
export const SCALES: Scale[] = [
  { k: 24, label: '1/2" = 1\'-0"' },
  { k: 32, label: '3/8" = 1\'-0"' },
  { k: 48, label: '1/4" = 1\'-0"' },
  { k: 64, label: '3/16" = 1\'-0"' },
  { k: 96, label: '1/8" = 1\'-0"' },
];

/** The largest standard scale at which a drawing of this real size fits the space. */
export function fitScale(realWidth: number, realHeight: number, space: { width: number; height: number }): Scale {
  return SCALES.find((s) => realWidth / s.k <= space.width && realHeight / s.k <= space.height) ?? SCALES[SCALES.length - 1];
}

/** Lettering plotted about 1/8" high (3/32" to 1/8" for notes and labels), in real inches at this scale. */
export const textSize = (k: number) => k * 0.12;

export const FIRM = {
  name: "US Floor Design Center",
  dba: "dba US Floor Kitchen & Bath",
  street: "30092 Santa Margarita Pkwy, Suite G",
  city: "Rancho Santa Margarita, CA 92688",
  phone: "(949) 589-9226",
  email: "info@usfloordesign.com",
  web: "usfloordesign.com",
};

/** Liability disclaimer, in capitals, in the title block of every sheet. */
export const LIABILITY =
  "THESE DRAWINGS ARE AN INSTRUMENT OF SERVICE SHOWING THE DESIGN INTENT FOR CABINETRY, COUNTERTOPS AND FINISHES. " +
  "THEY ARE NOT FOR ARCHITECTURAL OR ENGINEERING USE. VERIFY ALL DIMENSIONS AND CONDITIONS ON SITE BEFORE ORDERING OR " +
  "STARTING WORK, AND REPORT ANY DISCREPANCY TO THE DESIGNER AT ONCE.";

/** Next to every 3D or presentation view. */
export const INTERPRETATION =
  "This drawing is a visual interpretation of the general look of the room. It is not an exact depiction; finishes, colors and details may vary.";

/** General notes for the whole set, on the title sheet, in the indicative mood. */
export const GENERAL_NOTES = [
  "All dimensions are in inches and are measured from the finished face of the wall.",
  "Dimensions and existing conditions are verified on site before cabinets are ordered or work starts.",
  "Cabinet codes are the manufacturer's order codes. See the cabinet schedule.",
  "Appliance, fixture and fitting sizes and clearances follow the manufacturer's installation instructions.",
  "The client approves these drawings before work proceeds.",
];

export const copyright = (date = new Date()) => `© ${date.getFullYear()} ${FIRM.name}`;

/** Sheet number in the standard form: discipline, sheet group, two-digit sheet number (ID-1.01). */
export const sheetId = (group: number, n: number) => `ID-${group}.${String(n).padStart(2, "0")}`;

const DIRECTIONS = ["NORTH", "NORTHEAST", "EAST", "SOUTHEAST", "SOUTH", "SOUTHWEST", "WEST", "NORTHWEST"];

/** The north wall: the one chosen, else Wall A (the top of the top view). */
export function northWallId(design: DesignData): string | null {
  const walls = roomShape(design.room).walls;
  return walls.find((w) => w.id === design.northWall)?.id ?? walls[0]?.id ?? null;
}

/**
 * Which way each wall faces, named as the standard names an interior wall: for
 * the direction you look when you stand in the room facing it. The north wall
 * is the one chosen; the others follow by their angle to it.
 */
export function wallDirections(design: DesignData): Map<string, string> {
  const walls = roomShape(design.room).walls;
  const north = walls.find((w) => w.id === northWallId(design));
  const out = new Map<string, string>();
  if (!north) return out;
  // Facing a wall means looking out through it, against its into-the-room direction n.
  const nx = -north.n.x;
  const ny = -north.n.y;
  for (const w of walls) {
    const wx = -w.n.x;
    const wy = -w.n.y;
    // y grows down the page, so a positive cross product turns clockwise, from north toward east.
    const deg = (Math.atan2(nx * wy - ny * wx, nx * wx + ny * wy) * 180) / Math.PI;
    out.set(w.id, DIRECTIONS[(Math.round((deg + 360) / 45) % 8 + 8) % 8]);
  }
  return out;
}

/** The angle, in degrees clockwise from the top of the page, that north points to. */
export function northAngle(design: DesignData): number {
  const walls = roomShape(design.room).walls;
  const north = walls.find((w) => w.id === northWallId(design));
  if (!north) return 0;
  return (Math.atan2(-north.n.x, north.n.y) * 180) / Math.PI;
}

/** Walls in the order the standard sets for elevations: the north wall first, then clockwise. */
export function wallsFromNorth<T extends { id: string }>(design: DesignData, walls: T[]): T[] {
  const start = Math.max(0, walls.findIndex((w) => w.id === northWallId(design)));
  return [...walls.slice(start), ...walls.slice(0, start)];
}

export const roomName = (design: DesignData) => (design.roomName ?? "").trim() || "Kitchen";

/** Initials of a name, for "Drawn by". */
export const initials = (name: string | null | undefined) =>
  (name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0]!.toUpperCase())
    .join("");
