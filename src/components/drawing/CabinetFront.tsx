// Front-view drawing of one placed piece: doors, drawers, toe kick, handles,
// hinge-side swing marks and simple appliance faces. Door and drawer counts come
// from the product (B12 = 1 drawer over 1 door, DB30-2 = 2 drawers) and the door
// style from the color (shaker, slab or raised panel). x runs along the wall,
// z is height from the floor; Y(z) converts to SVG coordinates.

import type { ReactNode } from "react";
import type { DoorStyle, PlacedItem } from "@/lib/types";
import type { Paint } from "./paint";

const REVEAL = 0.25;
const TOE = 4;
const SW = 0.35; // stroke width in inches
const STEEL_LINE = "#7E8488";
const STEEL_HANDLE = "#55595C";

type Hinge = "left" | "right";
type Handle = "drawer" | "none" | { door: Hinge; at: "top" | "bottom" | "middle" } | "fridge-left" | "fridge-right";

interface Face {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  handle: Handle;
  swing?: Hinge;
  fill?: string;
  plain?: boolean; // no panel detail (blind panels, false fronts on slab lines)
}

type Extras = (Y: (z: number) => number, x0: number) => ReactNode;
const noExtras: Extras = () => null;

/** n equal doors across a span; single doors use the chosen hinge, pairs open from the middle. */
function doorRow(x0: number, x1: number, z0: number, z1: number, n: number, hinge: Hinge, at: "top" | "bottom" | "middle"): Face[] {
  const count = Math.max(1, n);
  if (count === 1) return [{ x0, z0, x1, z1, handle: { door: hinge, at }, swing: hinge }];
  const w = (x1 - x0) / count;
  return Array.from({ length: count }, (_, i) => {
    const side: Hinge = i % 2 === 0 ? "left" : "right";
    return { x0: x0 + i * w, z0, x1: x0 + (i + 1) * w, z1, handle: { door: side, at }, swing: side };
  });
}

/** Drawers stacked top to bottom; heights listed from the top, the last one takes the rest. */
function drawerStack(x0: number, x1: number, z0: number, z1: number, heights: number[]): Face[] {
  const faces: Face[] = [];
  let top = z1;
  heights.forEach((h, i) => {
    const bottom = i === heights.length - 1 ? z0 : top - h;
    faces.push({ x0, z0: bottom, x1, z1: top, handle: "drawer" });
    top = bottom;
  });
  return faces;
}

/** Standard drawer heights for a stack of n in a given space: a 6" top drawer when there are three or more. */
function drawerHeights(n: number, space: number): number[] {
  if (n <= 1) return [space];
  if (n === 2) return [space / 2, space / 2];
  const rest = (space - 6) / (n - 1);
  return [6, ...Array.from({ length: n - 1 }, () => rest)];
}

/** Drawers side by side in one row. */
function drawerRow(x0: number, x1: number, z0: number, z1: number, n: number): Face[] {
  const count = Math.max(1, n);
  const w = (x1 - x0) / count;
  return Array.from({ length: count }, (_, i) => ({ x0: x0 + i * w, z0, x1: x0 + (i + 1) * w, z1, handle: "drawer" as const }));
}

export function frontFaces(item: PlacedItem): { faces: Face[]; extras: Extras; toe: boolean } {
  const w = item.width;
  const h = item.height;
  const top = h;
  const hinge = item.hinge;
  const doors = item.doors;
  const drawers = item.drawers;

  switch (item.style) {
    case "base": {
      const nDrawers = drawers ?? (w >= 12 ? 1 : 0);
      const nDoors = doors ?? (w > 24 ? 2 : 1);
      const faces: Face[] = [];
      let doorTop = top;
      if (nDrawers > 0 && nDoors > 0) {
        faces.push(...drawerRow(0, w, top - 6, top, Math.min(nDrawers, nDoors)));
        doorTop = top - 6;
      } else if (nDrawers > 0) {
        faces.push(...drawerStack(0, w, TOE, top, drawerHeights(nDrawers, top - TOE)));
      }
      if (nDoors > 0) faces.push(...doorRow(0, w, TOE, doorTop, nDoors, hinge, "top"));
      return { faces, extras: noExtras, toe: true };
    }
    case "drawer_base": {
      const n = drawers || 3;
      return { faces: drawerStack(0, w, TOE, top, drawerHeights(n, top - TOE)), extras: noExtras, toe: true };
    }
    case "sink_base":
      return {
        faces: [{ x0: 0, z0: top - 6, x1: w, z1: top, handle: "none", plain: true }, ...doorRow(0, w, TOE, top - 6, doors || (w > 24 ? 2 : 1), hinge, "top")],
        extras: noExtras,
        toe: true,
      };
    case "blind_corner_base":
    case "lazy_susan": {
      // hinge marks the blind (corner) side: "left" means the corner is on the left
      const doorW = item.style === "lazy_susan" ? Math.max(w - 21, 9) : Math.max(w / 2 - 3.25, 9);
      const blindLeft = hinge === "left";
      const dx0 = blindLeft ? w - doorW : 0;
      const dx1 = blindLeft ? w : doorW;
      return {
        faces: [
          { x0: dx0, z0: TOE, x1: dx1, z1: top, handle: { door: blindLeft ? "right" : "left", at: "top" }, swing: blindLeft ? "right" : "left" },
          { x0: blindLeft ? 0 : dx1, z0: TOE, x1: blindLeft ? dx0 : w, z1: top, handle: "none", plain: true },
        ],
        extras: noExtras,
        toe: true,
      };
    }
    case "open_shelf": {
      const floor = item.mountHeight === 0;
      const z0 = floor ? TOE : 0;
      const n = Math.max(1, item.category === "wall" ? 2 : 2);
      return {
        faces: [],
        toe: floor,
        extras: (Y, ox) => (
          <g>
            <rect x={ox + 0.75} y={Y(top - 0.75)} width={w - 1.5} height={top - z0 - 1.5} fill="#000" fillOpacity={0.12} />
            {Array.from({ length: n }, (_, i) => {
              const z = z0 + ((top - z0) / (n + 1)) * (i + 1);
              return <rect key={i} x={ox + 0.75} y={Y(z + 0.4)} width={w - 1.5} height={0.75} fill="#000" fillOpacity={0.35} />;
            })}
          </g>
        ),
      };
    }
    case "wall":
      return { faces: doorRow(0, w, 0, top, doors || (w >= 24 ? 2 : 1), hinge, "bottom"), extras: noExtras, toe: false };
    case "wall_blind_corner": {
      const doorW = Math.max(w - 12, 9);
      const blindLeft = hinge === "left";
      const dx0 = blindLeft ? w - doorW : 0;
      const dx1 = blindLeft ? w : doorW;
      return {
        faces: [
          ...doorRow(dx0, dx1, 0, top, doorW > 21 ? 2 : 1, blindLeft ? "right" : "left", "bottom"),
          { x0: blindLeft ? 0 : dx1, z0: 0, x1: blindLeft ? dx0 : w, z1: top, handle: "none", plain: true },
        ],
        extras: noExtras,
        toe: false,
      };
    }
    case "wall_diagonal": {
      // seen square on, the angled door sits in the middle with the cabinet sides beside it
      const side = Math.min(w * 0.25, 6);
      return {
        faces: [
          { x0: 0, z0: 0, x1: side, z1: top, handle: "none", plain: true, fill: "rgba(0,0,0,0.12)" },
          ...doorRow(side, w - side, 0, top, 1, hinge, "bottom"),
          { x0: w - side, z0: 0, x1: w, z1: top, handle: "none", plain: true, fill: "rgba(0,0,0,0.12)" },
        ],
        extras: noExtras,
        toe: false,
      };
    }
    case "wall_microwave": {
      const opening = Math.min(18, top * 0.55);
      return {
        faces: doorRow(0, w, opening, top, doors || 2, hinge, "bottom"),
        toe: false,
        extras: (Y, ox) => (
          <g>
            <rect x={ox + 0.75} y={Y(opening - 0.25)} width={w - 1.5} height={opening - 0.75} fill="#000" fillOpacity={0.14} />
            <text x={ox + w / 2} y={Y(opening / 2) + 1} fontSize={2.6} textAnchor="middle" fill="#4A4D50">
              MICROWAVE
            </text>
          </g>
        ),
      };
    }
    case "wine_rack": {
      return {
        faces: [],
        toe: false,
        extras: (Y, ox) => {
          const cell = Math.min(top, 6);
          const cols = Math.max(1, Math.round((w - 1.5) / cell));
          const rows = Math.max(1, Math.round((top - 1.5) / cell));
          const cw = (w - 1.5) / cols;
          const ch = (top - 1.5) / rows;
          const lines: ReactNode[] = [];
          for (let c = 0; c < cols; c++)
            for (let r = 0; r < rows; r++) {
              const x = ox + 0.75 + c * cw;
              const z = 0.75 + r * ch;
              lines.push(<rect key={`${c}-${r}`} x={x} y={Y(z + ch)} width={cw} height={ch} fill="#000" fillOpacity={0.1} stroke="#000" strokeOpacity={0.35} strokeWidth={0.3} />);
              lines.push(<circle key={`b${c}-${r}`} cx={x + cw / 2} cy={Y(z + ch / 2)} r={Math.min(cw, ch) * 0.28} fill="none" stroke="#000" strokeOpacity={0.35} strokeWidth={0.3} />);
            }
          return <g>{lines}</g>;
        },
      };
    }
    case "plate_rack":
      return {
        faces: [],
        toe: false,
        extras: (Y, ox) => (
          <g>
            <rect x={ox + 0.75} y={Y(top - 0.75)} width={w - 1.5} height={top - 1.5} fill="#000" fillOpacity={0.1} />
            {Array.from({ length: Math.max(2, Math.floor((w - 1.5) / 1.75)) }, (_, i) => (
              <line key={i} x1={ox + 1.5 + i * 1.75} x2={ox + 1.5 + i * 1.75} y1={Y(top - 1.5)} y2={Y(1.5)} stroke="#000" strokeOpacity={0.4} strokeWidth={0.35} />
            ))}
          </g>
        ),
      };
    case "tall_pantry": {
      const split = item.splitHeight && item.splitHeight < top ? item.splitHeight : TOE + Math.round((top - TOE) * 0.45);
      const n = doors || (w >= 24 ? 2 : 1);
      return {
        faces: [...doorRow(0, w, TOE, split, n, hinge, "top"), ...doorRow(0, w, split, top, n, hinge, "bottom")],
        extras: noExtras,
        toe: true,
      };
    }
    case "tall_oven": {
      const ovenBottom = 27;
      const ovenTop = Math.min(57, top - 12);
      return {
        faces: [
          ...drawerStack(0, w, TOE, ovenBottom - 0.5, [(ovenBottom - 0.5 - TOE) / 2, (ovenBottom - 0.5 - TOE) / 2]),
          { x0: 0, z0: ovenBottom, x1: w, z1: ovenTop, handle: "none", fill: "#2A2C2E", plain: true },
          ...doorRow(0, w, ovenTop + 0.5, top, w >= 24 ? 2 : 1, hinge, "bottom"),
        ],
        toe: true,
        extras: (Y, ox) => (
          <g>
            <rect x={ox + 3} y={Y(ovenTop - 6)} width={w - 6} height={ovenTop - 6 - (ovenBottom + 4)} fill="#4A4F53" stroke="#6A7075" strokeWidth={SW} />
            <rect x={ox + 3} y={Y(ovenTop - 2)} width={w - 6} height={1} rx={0.5} fill={STEEL_HANDLE} />
          </g>
        ),
      };
    }
    case "vanity_combo": {
      const n = drawers || 3;
      const faces: Face[] = [];
      if (n >= 4) {
        // drawer banks on both sides, doors in the middle
        const bank = Math.min(15, w * 0.25);
        const per = Math.ceil(n / 2);
        faces.push(...drawerStack(0, bank, TOE, top, drawerHeights(per, top - TOE)));
        faces.push(...drawerStack(w - bank, w, TOE, top, drawerHeights(n - per, top - TOE)));
        faces.push({ x0: bank, z0: top - 6, x1: w - bank, z1: top, handle: "none", plain: true });
        faces.push(...doorRow(bank, w - bank, TOE, top - 6, doors || 2, hinge, "top"));
      } else {
        // one drawer bank; hinge marks its side
        const bank = Math.min(15, w * 0.4);
        const left = hinge === "left";
        const bx0 = left ? 0 : w - bank;
        faces.push(...drawerStack(bx0, bx0 + bank, TOE, top, drawerHeights(n, top - TOE)));
        const dx0 = left ? bank : 0;
        const dx1 = left ? w : w - bank;
        faces.push({ x0: dx0, z0: top - 6, x1: dx1, z1: top, handle: "none", plain: true });
        faces.push(...doorRow(dx0, dx1, TOE, top - 6, doors || 2, hinge, "top"));
      }
      return { faces, extras: noExtras, toe: true };
    }
    case "range":
      return {
        faces: [],
        toe: false,
        extras: (Y, ox) => (
          <g>
            <rect x={ox + 2} y={Y(27)} width={w - 4} height={23} fill="#BFC2C4" stroke={STEEL_LINE} strokeWidth={SW} />
            <rect x={ox + 5} y={Y(22)} width={w - 10} height={13} fill="#3E4246" stroke={STEEL_LINE} strokeWidth={SW} />
            <rect x={ox + 4} y={Y(25.5)} width={w - 8} height={1} rx={0.5} fill={STEEL_HANDLE} />
            <line x1={ox} x2={ox + w} y1={Y(30)} y2={Y(30)} stroke={STEEL_LINE} strokeWidth={SW} />
            {Array.from({ length: w >= 36 ? 6 : 4 }, (_, i) => (
              <circle key={i} cx={ox + (w / ((w >= 36 ? 6 : 4) + 1)) * (i + 1)} cy={Y(33)} r={1.1} fill="#2A2C2E" />
            ))}
          </g>
        ),
      };
    case "refrigerator": {
      const split = Math.round(h * 0.4);
      const french = w >= 30;
      return {
        faces: french
          ? [
              { x0: 0, z0: 0.5, x1: w, z1: split, handle: "drawer" },
              { x0: 0, z0: split + 0.25, x1: w / 2, z1: top, handle: "fridge-left" },
              { x0: w / 2, z0: split + 0.25, x1: w, z1: top, handle: "fridge-right" },
            ]
          : [
              { x0: 0, z0: 0.5, x1: w, z1: split, handle: "drawer" },
              { x0: 0, z0: split + 0.25, x1: w, z1: top, handle: hinge === "left" ? "fridge-right" : "fridge-left" },
            ],
        extras: noExtras,
        toe: false,
      };
    }
    case "dishwasher":
      return {
        faces: [{ x0: 0, z0: TOE, x1: w, z1: top, handle: "none" }],
        toe: true,
        extras: (Y, ox) => (
          <g>
            <line x1={ox + REVEAL} x2={ox + w - REVEAL} y1={Y(top - 4)} y2={Y(top - 4)} stroke={STEEL_LINE} strokeWidth={SW} />
            <rect x={ox + 3} y={Y(top - 5.5)} width={w - 6} height={0.9} rx={0.45} fill={STEEL_HANDLE} />
          </g>
        ),
      };
    case "hood":
    case "filler":
    case "panel":
    case "accessory":
    default:
      return { faces: [], extras: noExtras, toe: item.style === "filler" && item.mountHeight === 0 && item.height < 40 };
  }
}

function HandleMark({ face, Y, ox, ink }: { face: Face; Y: (z: number) => number; ox: number; ink: string }) {
  const fx0 = ox + face.x0;
  const fx1 = ox + face.x1;
  const fw = fx1 - fx0;
  const fh = face.z1 - face.z0;
  const color = ink === "#ECEAE4" ? "#D8D5CC" : "#4A4D50";
  if (face.handle === "none") return null;
  if (face.handle === "drawer") {
    const len = Math.min(Math.max(fw * 0.35, 3), 12);
    const zc = face.z0 + fh / 2;
    return <rect x={fx0 + fw / 2 - len / 2} y={Y(zc) - 0.35} width={len} height={0.7} rx={0.35} fill={color} />;
  }
  if (face.handle === "fridge-left" || face.handle === "fridge-right") {
    const x = face.handle === "fridge-left" ? fx1 - 2 : fx0 + 1.2;
    const len = Math.min(fh * 0.6, 30);
    const zc = face.z0 + fh / 2;
    return <rect x={x} y={Y(zc + len / 2)} width={0.8} height={len} rx={0.4} fill={STEEL_HANDLE} />;
  }
  const { door, at } = face.handle;
  const x = door === "left" ? fx1 - 2 : fx0 + 1.3;
  const len = Math.min(4, fh * 0.3);
  const zTop = at === "top" ? face.z1 - 2 : at === "bottom" ? face.z0 + 2 + len : face.z0 + fh / 2 + len / 2;
  return <rect x={x} y={Y(zTop)} width={0.7} height={len} rx={0.35} fill={color} />;
}

function SwingMark({ face, Y, ox, ink }: { face: Face; Y: (z: number) => number; ox: number; ink: string }) {
  if (!face.swing) return null;
  const fx0 = ox + face.x0 + 1;
  const fx1 = ox + face.x1 - 1;
  const zt = face.z1 - 1;
  const zb = face.z0 + 1;
  const zm = (face.z0 + face.z1) / 2;
  // the lines meet on the hinge side
  const apex = face.swing === "left" ? fx0 : fx1;
  const open = face.swing === "left" ? fx1 : fx0;
  return (
    <polyline
      points={`${open},${Y(zt)} ${apex},${Y(zm)} ${open},${Y(zb)}`}
      fill="none"
      stroke={ink}
      strokeOpacity={0.45}
      strokeWidth={0.25}
      strokeDasharray="1.2 0.9"
    />
  );
}

/** Panel detail for one door or drawer front, by door style. */
function PanelDetail({ face, Y, ox, ink, doorStyle }: { face: Face; Y: (z: number) => number; ox: number; ink: string; doorStyle: DoorStyle }) {
  const fw = face.x1 - face.x0;
  const fh = face.z1 - face.z0;
  if (face.plain || face.fill || doorStyle === "slab" || fw < 5 || fh < 4) return null;
  const rail = fh < 9 ? 1.4 : 2.4;
  const x = ox + face.x0 + rail;
  const w = fw - rail * 2;
  const z1 = face.z1 - rail;
  const hh = fh - rail * 2;
  if (w <= 1 || hh <= 1) return null;
  if (doorStyle === "shaker") {
    return <rect x={x} y={Y(z1)} width={w} height={hh} fill="none" stroke={ink} strokeOpacity={0.35} strokeWidth={0.25} />;
  }
  // raised panel: frame line, bevel, and the raised field with corner miters
  const b = Math.min(1.2, w / 4, hh / 4);
  return (
    <g fill="none" stroke={ink} strokeWidth={0.22} strokeOpacity={0.4}>
      <rect x={x} y={Y(z1)} width={w} height={hh} />
      <rect x={x + b} y={Y(z1 - b)} width={w - 2 * b} height={hh - 2 * b} />
      <line x1={x} y1={Y(z1)} x2={x + b} y2={Y(z1 - b)} />
      <line x1={x + w} y1={Y(z1)} x2={x + w - b} y2={Y(z1 - b)} />
      <line x1={x} y1={Y(z1 - hh)} x2={x + b} y2={Y(z1 - hh + b)} />
      <line x1={x + w} y1={Y(z1 - hh)} x2={x + w - b} y2={Y(z1 - hh + b)} />
    </g>
  );
}

export function HoodShape({ x, w, z0, h, Y }: { x: number; w: number; z0: number; h: number; Y: (z: number) => number }) {
  const canopy = Math.min(10, h * 0.45);
  const chimneyW = Math.max(w * 0.38, 10);
  const cx = x + w / 2;
  return (
    <g>
      <rect x={cx - chimneyW / 2} y={Y(z0 + h)} width={chimneyW} height={h - canopy} fill="#D2D5D7" stroke={STEEL_LINE} strokeWidth={SW} />
      <path
        d={`M ${x} ${Y(z0)} L ${x + w} ${Y(z0)} L ${cx + chimneyW / 2 + 1} ${Y(z0 + canopy)} L ${cx - chimneyW / 2 - 1} ${Y(z0 + canopy)} Z`}
        fill="#C9CCCE"
        stroke={STEEL_LINE}
        strokeWidth={SW}
      />
      <line x1={x} x2={x + w} y1={Y(z0 + 1.5)} y2={Y(z0 + 1.5)} stroke={STEEL_LINE} strokeWidth={SW} />
    </g>
  );
}

export function CabinetFront({ item, paint, Y }: { item: PlacedItem; paint: Paint; Y: (z: number) => number }) {
  const ox = item.offset;
  const z0 = item.mountHeight;
  const ZY = (z: number) => Y(z0 + z); // local z to svg y

  if (item.style === "hood") return <HoodShape x={ox} w={item.width} z0={z0} h={item.height} Y={Y} />;

  const { faces, extras, toe } = frontFaces(item);
  const hasToe = toe && z0 === 0;
  const boxFill = paint.fill;

  return (
    <g>
      {/* carcass */}
      <rect
        x={ox}
        y={ZY(item.height)}
        width={item.width}
        height={item.height - (hasToe ? TOE : 0)}
        fill={boxFill}
        stroke={paint.ink === "#ECEAE4" ? "#111" : "#1A1D1F"}
        strokeWidth={SW}
      />
      {hasToe && <rect x={ox + 0.5} y={ZY(TOE)} width={Math.max(item.width - 1, 0.2)} height={TOE} fill="#2B2B2B" fillOpacity={0.85} />}
      {faces.map((f, i) => (
        <g key={i}>
          <rect
            x={ox + f.x0 + REVEAL}
            y={ZY(f.z1 - REVEAL / 2)}
            width={Math.max(f.x1 - f.x0 - REVEAL * 2, 0.1)}
            height={Math.max(f.z1 - f.z0 - REVEAL, 0.1)}
            fill={f.fill ?? boxFill}
            stroke={paint.ink}
            strokeOpacity={0.75}
            strokeWidth={0.3}
          />
          {item.category !== "appliance" && f.handle !== "none" && <PanelDetail face={f} Y={ZY} ox={ox} ink={paint.ink} doorStyle={paint.doorStyle} />}
          <SwingMark face={f} Y={ZY} ox={ox} ink={paint.ink} />
          <HandleMark face={f} Y={ZY} ox={ox} ink={paint.ink} />
        </g>
      ))}
      {extras(ZY, ox)}
    </g>
  );
}
