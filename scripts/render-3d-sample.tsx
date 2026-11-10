// Draws a sample kitchen in the 3D view to an SVG file, to look at the drawing
// without the designer. Development only:
//
//   npx tsx scripts/render-3d-sample.tsx out.svg [turn] [tilt] [line|color]

import { writeFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { View3D } from "../src/components/drawing/View3D";
import { STANDARD_CATALOG as C } from "../src/lib/standard-catalog";
import { emptyDesign, rectangleRoom, type PlacedItem } from "../src/lib/types";

const d = emptyDesign();
d.room = rectangleRoom(168, 144);
d.islands = [{ id: "isl", name: "Island", x: 40, y: 80, rotation: 0 }];
let n = 0;
const put = (sku: string, run: string, offset: number): void => {
  const p = C.products.find((x) => x.sku === sku)!;
  const it: PlacedItem = {
    id: `i${n++}`, productId: p.id, code: p.sku, name: p.name, category: p.category, style: p.style, run, offset,
    width: p.width!, height: p.height!, depth: p.depth!, mountHeight: p.mount_height ?? 0, doors: p.doors, drawers: p.drawers,
    splitHeight: p.split_height, finishId: null, hinge: "left",
  };
  d.items.push(it);
};
// Wall A: fridge, base run with sink, uppers
put("REF36", "A", 0);
put("B30", "A", 36);
put("DW24", "A", 66);
put("SB36", "A", 90);
put("DB30-2", "A", 126);
put("W3036", "A", 36);
put("W2436", "A", 66);
put("W3036", "A", 126);
d.openings.push({ id: "win", wall: "A", type: "window", offset: 92, width: 32, height: 36, sill: 42, hinge: "left" });
// Wall B: range with hood between bases, then a pantry
put("B24", "B", 24);
put("RNG36", "B", 48);
put("B24", "B", 84);
put("UT249024", "B", 108);
put("HD36", "B", 48);
put("W2436", "B", 24);
put("W2436", "B", 84);
// Island
put("B36", "isl", 0);
put("DB30-2", "isl", 36);
put("B30", "isl", 66);

const [out = "sample-3d.svg", turn = "35", tilt = "30", look = "line"] = process.argv.slice(2);
const svg = renderToStaticMarkup(createElement(View3D, { design: d, catalog: C, cam: { turn: Number(turn), tilt: Number(tilt), look: look as "line" | "color" } }));
const css = `<style>.lineart [fill]:not([fill="none"]):not(text){fill:#fff!important;fill-opacity:1!important}.lineart [stroke]:not([stroke="none"]){stroke:#1A1D1F!important;stroke-opacity:1!important}.lineart rect:not([stroke]),.lineart circle:not([stroke]),.lineart path:not([stroke]),.lineart polygon:not([stroke]){stroke:#1A1D1F;stroke-width:0.2}</style>`;
const vb = /viewBox="([^"]+)"/.exec(svg)![1].split(" ").map(Number);
writeFileSync(out, svg.replace(/^<svg([^>]*)>/, `<svg$1 width="1600" height="${Math.round((1600 * vb[3]) / vb[2])}">${css}`));
console.log("wrote", out);
