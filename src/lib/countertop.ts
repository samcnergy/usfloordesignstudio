// The countertop plan (owner, 2026-11-21; K&B drawing standards Chapter 13):
// where each sink cutout and faucet hole goes, and the clear opening the
// counters leave for each range. Sizes come from the sink and faucet spec
// sheets typed on the Finishes tab; anything not typed is left for the
// fabricator's template and said so on the drawing, never made up.

import { pointOn, type RunFrame, type Vec } from "./geometry";
import { BASE_TOP, COUNTER_STYLES, OVERHANG } from "./plan";
import type { SinkSpec } from "./finishes";
import type { DesignData } from "./types";

export interface SinkCut {
  run: string;
  /** Sink centerline along the run. */
  s: number;
  /** Front edge of the counter, from the wall (or the island's back edge). */
  front: number;
  back: number;
  /** The cutout outline, when its size is known; open at the front for an apron-front sink. */
  outline: Vec[] | null;
  apron: boolean;
  holes: Vec[];
  /** Where the faucet holes line up, from the back edge of the counter. */
  holeT: number | null;
}

export function sinkCuts(design: DesignData, frames: Map<string, RunFrame>, spec: SinkSpec | undefined, mount: string | undefined): SinkCut[] {
  const out: SinkCut[] = [];
  const apron = !!mount && mount.startsWith("farmhouse");
  for (const it of design.items.filter((i) => i.style === "sink_base")) {
    const f = frames.get(it.run);
    if (!f) continue;
    const island = f.kind === "island";
    const back = island ? -OVERHANG : 0;
    const front = it.depth + OVERHANG;
    const s = it.offset + it.width / 2;
    let outline: Vec[] | null = null;
    let cutBack: number | null = null;
    if (spec?.cutout && spec.cutout.w > 0 && spec.cutout.d > 0) {
      const { w, d } = spec.cutout;
      // an apron-front sink comes through the front edge; any other is centered front to back
      const t1 = apron ? front : (back + front) / 2 + d / 2;
      const t0 = t1 - d;
      cutBack = t0;
      outline = [pointOn(f, s - w / 2, t0), pointOn(f, s + w / 2, t0), pointOn(f, s + w / 2, t1), pointOn(f, s - w / 2, t1)];
    }
    const holes: Vec[] = [];
    let holeT: number | null = null;
    const n = Math.max(0, Math.min(5, Math.round(spec?.faucetHoles ?? 0)));
    if (n > 0 && cutBack !== null) {
      // the faucet holes sit midway between the back of the cutout and the back of the counter
      holeT = (back + cutBack) / 2;
      const spread = n > 1 ? (spec?.spread ?? 0) : 0;
      for (let k = 0; k < n; k++) {
        const ds = n === 1 || !spread ? 0 : -spread / 2 + (spread * k) / (n - 1);
        holes.push(pointOn(f, s + ds, holeT));
      }
    }
    out.push({ run: it.run, s, front, back, outline, apron, holes, holeT });
  }
  return out;
}

/** Counter spans along a run, merged. */
export function counterRuns(design: DesignData, run: string): [number, number][] {
  const s = design.items.filter((i) => i.run === run && i.mountHeight === 0 && COUNTER_STYLES.has(i.style) && Math.abs(i.height - BASE_TOP) < 0.01)
    .map((i) => [i.offset, i.offset + i.width] as [number, number]).sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const x of s) {
    const last = out[out.length - 1];
    if (last && x[0] <= last[1] + 0.1) last[1] = Math.max(last[1], x[1]);
    else out.push([...x]);
  }
  return out;
}

/** The clear opening the counters leave at each range: from the counter edge on one side to the other. */
export function rangeOpenings(design: DesignData, run: string): { s0: number; s1: number; depth: number }[] {
  const spans = counterRuns(design, run);
  const out: { s0: number; s1: number; depth: number }[] = [];
  for (const r of design.items.filter((i) => i.run === run && i.style === "range")) {
    const before = spans.filter(([, b]) => b <= r.offset + 0.1).map(([, b]) => b);
    const after = spans.filter(([a]) => a >= r.offset + r.width - 0.1).map(([a]) => a);
    const s0 = before.length ? Math.max(...before) : r.offset;
    const s1 = after.length ? Math.min(...after) : r.offset + r.width;
    out.push({ s0, s1, depth: r.depth });
  }
  return out;
}
