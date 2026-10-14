// Front-view drawing of one placed piece: doors, drawers, toe kick, handles,
// hinge-side swing marks and simple appliance faces. x runs along the wall,
// z is height from the floor; Y(z) converts to SVG coordinates.

import type { ReactNode } from "react";
import type { PlacedItem } from "@/lib/types";
import type { Paint } from "./paint";

const REVEAL = 0.25;
const TOE = 4;
const SW = 0.35; // stroke width in inches

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
}

function doorsAcross(x0: number, x1: number, z0: number, z1: number, hinge: Hinge, at: "top" | "bottom" | "middle", singleMax: number): Face[] {
  const w = x1 - x0;
  if (w <= singleMax) {
    return [{ x0, z0, x1, z1, handle: { door: hinge, at }, swing: hinge }];
  }
  const mid = x0 + w / 2;
  return [
    { x0, z0, x1: mid, z1, handle: { door: "left", at }, swing: "left" },
    { x0: mid, z0, x1, z1, handle: { door: "right", at }, swing: "right" },
  ];
}

function drawersStack(x0: number, x1: number, z0: number, z1: number, heights: number[]): Face[] {
  // heights are from the top down; the last drawer takes what remains
  const faces: Face[] = [];
  let top = z1;
  heights.forEach((h, i) => {
    const bottom = i === heights.length - 1 ? z0 : top - h;
    faces.push({ x0, z0: bottom, x1, z1: top, handle: "drawer" });
    top = bottom;
  });
  return faces;
}

export function frontFaces(item: PlacedItem): { faces: Face[]; extras: (Y: (z: number) => number, x0: number) => ReactNode } {
  const w = item.width;
  const h = item.height;
  const x0 = 0;
  const x1 = w;
  const top = h;
  const noExtras = () => null;

  switch (item.style) {
    case "base":
      return {
        faces: [
          ...(w >= 12 ? drawersStack(x0, x1, top - 6, top, [6]) : []),
          ...doorsAcross(x0, x1, TOE, w >= 12 ? top - 6 : top, item.hinge, "top", 24),
        ],
        extras: noExtras,
      };
    case "drawer_base": {
      const body = top - TOE;
      const rest = (body - 6) / 2;
      return { faces: drawersStack(x0, x1, TOE, top, [6, rest, rest]), extras: noExtras };
    }
    case "sink_base":
      return {
        faces: [{ x0, z0: top - 6, x1, z1: top, handle: "none" }, ...doorsAcross(x0, x1, TOE, top - 6, item.hinge, "top", 24)],
        extras: noExtras,
      };
    case "blind_corner_base": {
      // hinge field marks the blind side: "left" means the blind part is on the left
      const doorW = Math.min(Math.max(w - 21, 12), 24);
      const blindLeft = item.hinge === "left";
      const dx0 = blindLeft ? x1 - doorW : x0;
      const dx1 = blindLeft ? x1 : x0 + doorW;
      return {
        faces: [
          ...drawersStack(dx0, dx1, top - 6, top, [6]),
          { x0: dx0, z0: TOE, x1: dx1, z1: top - 6, handle: { door: blindLeft ? "right" : "left", at: "top" }, swing: blindLeft ? "right" : "left" },
          { x0: blindLeft ? x0 : dx1, z0: TOE, x1: blindLeft ? dx0 : x1, z1: top, handle: "none" },
        ],
        extras: noExtras,
      };
    }
    case "wall":
      return { faces: doorsAcross(x0, x1, 0, top, item.hinge, "bottom", 21), extras: noExtras };
    case "wall_blind_corner": {
      const doorW = Math.max(w - 12, 9);
      const blindLeft = item.hinge === "left";
      const dx0 = blindLeft ? x1 - doorW : x0;
      const dx1 = blindLeft ? x1 : x0 + doorW;
      return {
        faces: [
          ...doorsAcross(dx0, dx1, 0, top, blindLeft ? "right" : "left", "bottom", 21),
          { x0: blindLeft ? x0 : dx1, z0: 0, x1: blindLeft ? dx0 : x1, z1: top, handle: "none" },
        ],
        extras: noExtras,
      };
    }
    case "tall_pantry": {
      const split = TOE + Math.round((top - TOE) * 0.45);
      return {
        faces: [
          ...doorsAcross(x0, x1, TOE, split, item.hinge, "top", 21),
          ...doorsAcross(x0, x1, split, top, item.hinge, "bottom", 21),
        ],
        extras: noExtras,
      };
    }
    case "tall_oven": {
      const ovenBottom = 27;
      const ovenTop = Math.min(57, top - 12);
      return {
        faces: [
          ...drawersStack(x0, x1, TOE, ovenBottom - 0.5, [(ovenBottom - 0.5 - TOE) / 2, (ovenBottom - 0.5 - TOE) / 2]),
          { x0, z0: ovenBottom, x1, z1: ovenTop, handle: "none", fill: "#2A2C2E" },
          ...doorsAcross(x0, x1, ovenTop + 0.5, top, item.hinge, "bottom", 21),
        ],
        extras: (Y, ox) => (
          <g>
            <rect x={ox + 3} y={Y(ovenTop - 6)} width={w - 6} height={ovenTop - 6 - (ovenBottom + 4)} fill="#4A4F53" stroke="#6A7075" strokeWidth={SW} />
            <rect x={ox + 3} y={Y(ovenTop - 2)} width={w - 6} height={1} rx={0.5} fill={STEEL_HANDLE} />
          </g>
        ),
      };
    }
    case "range":
      return {
        faces: [],
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
              { x0, z0: 0.5, x1, z1: split, handle: "drawer" },
              { x0, z0: split + 0.25, x1: w / 2, z1: top, handle: "fridge-left" },
              { x0: w / 2, z0: split + 0.25, x1, z1: top, handle: "fridge-right" },
            ]
          : [
              { x0, z0: 0.5, x1, z1: split, handle: "drawer" },
              { x0, z0: split + 0.25, x1, z1: top, handle: item.hinge === "left" ? "fridge-right" : "fridge-left" },
            ],
        extras: noExtras,
      };
    }
    case "dishwasher":
      return {
        faces: [{ x0, z0: TOE, x1, z1: top, handle: "none" }],
        extras: (Y, ox) => (
          <g>
            <line x1={ox + REVEAL} x2={ox + w - REVEAL} y1={Y(top - 4)} y2={Y(top - 4)} stroke={STEEL_LINE} strokeWidth={SW} />
            <rect x={ox + 3} y={Y(top - 5.5)} width={w - 6} height={0.9} rx={0.45} fill={STEEL_HANDLE} />
          </g>
        ),
      };
    case "hood": {
      return {
        faces: [],
        extras: () => null, // drawn by HoodShape below, since it is not rectangular
      };
    }
    case "filler":
    case "panel":
    default:
      return { faces: [], extras: noExtras };
  }
}

const STEEL_LINE = "#7E8488";
const STEEL_HANDLE = "#55595C";

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
  // lines meet on the hinge side
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

  const { faces, extras } = frontFaces(item);
  const floorStanding = z0 === 0 && item.category !== "appliance" && item.style !== "panel";
  const hasToe = floorStanding && item.style !== "filler" ? true : item.style === "dishwasher";
  const boxFill = paint.fill;

  return (
    <g>
      {/* carcass */}
      <rect x={ox} y={ZY(item.height)} width={item.width} height={item.height - (hasToe ? TOE : 0)} fill={boxFill} stroke={paint.ink === "#ECEAE4" ? "#111" : "#1A1D1F"} strokeWidth={SW} />
      {hasToe && (
        <rect x={ox + 0.5} y={ZY(TOE)} width={item.width - 1} height={TOE} fill="#2B2B2B" fillOpacity={0.85} />
      )}
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
          {/* inner panel line for a shaker look on doors and taller drawers */}
          {item.category !== "appliance" && f.handle !== "none" && f.x1 - f.x0 > 6 && f.z1 - f.z0 > 5 && !f.fill && (
            <rect
              x={ox + f.x0 + 2.4}
              y={ZY(f.z1 - 2.3)}
              width={f.x1 - f.x0 - 4.8}
              height={f.z1 - f.z0 - 4.6}
              fill="none"
              stroke={paint.ink}
              strokeOpacity={0.35}
              strokeWidth={0.25}
            />
          )}
          <SwingMark face={f} Y={ZY} ox={ox} ink={paint.ink} />
          <HandleMark face={f} Y={ZY} ox={ox} ink={paint.ink} />
        </g>
      ))}
      {extras(ZY, ox)}
    </g>
  );
}
