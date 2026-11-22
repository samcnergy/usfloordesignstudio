// The countertop plan (owner, 2026-11-21; K&B drawing standards Chapter 13):
// where each sink cutout and faucet hole goes, and the clear opening the
// counters leave for each range. Sizes come from the sink and faucet spec
// sheets typed on the Finishes tab; anything not typed is left for the
// fabricator's template and said so on the drawing, never made up.

import { pointOn, type RunFrame, type Vec } from "./geometry";
import { BASE_TOP, COUNTER_STYLES, OVERHANG } from "./plan";
import type { SinkSpec } from "./finishes";
import type { DesignData } from "./types";
import { fmtIn } from "./units";

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

export interface CounterPiece {
  run: string;
  /** Along the run, and out from the wall (or the island's back edge). */
  s0: number;
  s1: number;
  t0: number;
  t1: number;
  quad: Vec[];
}

export interface Seam {
  run: string;
  s: number;
  t0: number;
  t1: number;
  /** Why it is there: a corner, or a run longer than the slab. */
  kind: "corner" | "length";
  /** Set when the seam could not land where it should: off a cabinet joint, or the top is deeper than the slab. */
  warn?: string;
}

/**
 * Where the countertop pieces and seams go, for a slab of usable length x width (owner, 2026-11-21).
 * Runs meeting at a corner seam where they meet. A run longer than the slab is cut at cabinet joints, the
 * longest piece the slab allows each time, never at the sink cabinet or over the dishwasher (nothing under
 * it); when no joint works the seam goes at the slab length and is flagged for the fabricator.
 */
export function counterLayout(design: DesignData, frames: Map<string, RunFrame>, slab: { l: number; w: number }): { pieces: CounterPiece[]; seams: Seam[]; warnings: string[] } {
  const pieces: CounterPiece[] = [];
  const seams: Seam[] = [];
  const warnings: string[] = [];
  const runs = [...frames.values()];
  const wallOrder = runs.filter((f) => f.kind === "wall").map((f) => f.id);
  for (const f of runs) {
    const island = f.kind === "island";
    const here = design.items.filter((i) => i.run === f.id && i.mountHeight === 0);
    for (const [a, b] of counterRuns(design, f.id)) {
      const inSpan = here.filter((i) => i.offset < b - 0.01 && a < i.offset + i.width - 0.01);
      const depth = Math.max(...inSpan.filter((i) => COUNTER_STYLES.has(i.style)).map((i) => i.depth)) + OVERHANG;
      const t0 = island ? -OVERHANG : 0;
      const t1 = depth;
      const s0 = island ? a - OVERHANG : a;
      const s1 = island ? b + OVERHANG : b;
      // corners: a wall run that stops where the next (or previous) wall's counter takes the corner
      if (!island) {
        const i = wallOrder.indexOf(f.id);
        const next = frames.get(wallOrder[(i + 1) % wallOrder.length]);
        const prev = frames.get(wallOrder[(i - 1 + wallOrder.length) % wallOrder.length]);
        // the other run owns the corner when its top reaches the corner (within 1 1/2")
        const nextStarts = next ? counterRuns(design, next.id).some(([x]) => x < 1.5) : false;
        const prevEnds = prev ? counterRuns(design, prev.id).some(([, y]) => y > prev.length - 1.5) : false;
        // the run that stops short of the corner carries the seam, where its top meets the other run's
        if (nextStarts && f.length - b > 1.5 && f.length - b < depth + 6) seams.push({ run: f.id, s: b, t0, t1, kind: "corner" });
        if (prevEnds && a > 1.5 && a < depth + 6) seams.push({ run: f.id, s: a, t0, t1, kind: "corner" });
      }
      // no seam at the sink cabinet or over the dishwasher; joints between other cabinets are fine. As a last
      // resort a seam may sit at the outer edge of one of them (flagged), never inside one or between the two
      const banned = here.filter((i) => i.style === "sink_base" || i.style === "dishwasher").map((i) => [i.offset, i.offset + i.width] as [number, number]);
      const inside = (x: number) => banned.some(([p, q]) => x > p + 0.02 && x < q - 0.02);
      const edgeOf = (x: number) => banned.filter(([p, q]) => Math.abs(x - p) < 0.02 || Math.abs(x - q) < 0.02).length;
      const joints = [...new Set(inSpan.flatMap((i) => [i.offset, i.offset + i.width]))].filter((x) => x > a + 0.5 && x < b - 0.5).sort((x, y) => x - y);
      const good = joints.filter((x) => !inside(x) && edgeOf(x) === 0);
      const atEdge = joints.filter((x) => !inside(x) && edgeOf(x) === 1);
      const cuts: { s: number; warn?: string }[] = [];
      let start = s0;
      while (s1 - start > slab.l + 0.01) {
        const reach = (xs: number[]) => xs.filter((x) => x > start + 6 && x <= start + slab.l + 0.01);
        const g = reach(good);
        const e = reach(atEdge);
        if (g.length) cuts.push({ s: g[g.length - 1] });
        else if (e.length) cuts.push({ s: e[e.length - 1], warn: "At the edge of the sink or dishwasher cabinet: the fabricator confirms the distance to the cutout and the support." });
        else {
          // no joint reaches: cut at the slab length, moved back out of a sink or dishwasher cabinet
          let x = start + slab.l;
          const hit = banned.find(([p, q]) => x > p + 0.02 && x < q - 0.02);
          if (hit && hit[0] > start + 6) x = hit[0];
          cuts.push({ s: x, warn: "Not over a cabinet joint: the fabricator confirms support." });
        }
        start = cuts[cuts.length - 1].s;
      }
      for (const c of cuts) seams.push({ run: f.id, s: c.s, t0, t1, kind: "length", warn: c.warn });
      // a top deeper than the slab is wide needs a seam along its length; the fabricator places it
      if (t1 - t0 > slab.w + 0.01) warnings.push(`The ${f.label} top is ${fmtIn(t1 - t0)} deep, more than the ${fmtIn(slab.w)} slab: it needs a seam along its length, placed by the fabricator.`);
      const edges = [s0, ...cuts.map((c) => c.s), s1];
      for (let k = 0; k < edges.length - 1; k++) {
        pieces.push({
          run: f.id, s0: edges[k], s1: edges[k + 1], t0, t1,
          quad: [pointOn(f, edges[k], t0), pointOn(f, edges[k + 1], t0), pointOn(f, edges[k + 1], t1), pointOn(f, edges[k], t1)],
        });
      }
    }
  }
  for (const sm of seams) if (sm.warn) warnings.push(`Seam on ${frames.get(sm.run)?.label ?? "a run"} at ${fmtIn(sm.s)}: ${sm.warn}`);
  return { pieces, seams, warnings };
}
