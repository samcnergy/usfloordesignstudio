"use client";

// The Finishes tab: floor, walls, backsplash, ceiling and base, and the
// countertop's edge and sink mounting (owner, 2026-11-21). Pick a material and
// type what is known; the finish plan, its symbol and the finish schedule
// (with quantities) are made from these.

import { useState } from "react";
import { FINISH_USES, MATERIALS_FOR, MATERIAL_NAME, USE_NAME, finishKeys, finishQuantity, finishesOf, type FinishData, type FinishEntry, type FinishUse, type SinkSpec } from "@/lib/finishes";
import type { Catalog, DesignData } from "@/lib/types";

const FIELDS: [keyof FinishEntry, string, string][] = [
  ["description", "Description", "For example Porcelain tile, matte"],
  ["manufacturer", "Manufacturer (full name)", ""],
  ["product", "Product no.", ""],
  ["color", "Color / finish", ""],
  ["notes", "Notes", "Grout and trims for tile, sheen for paint"],
  ["suppliedBy", "Supplied by", "For example US Floor"],
  ["installedBy", "Installed by", ""],
];

export function FinishPanel({ design, catalog, apply }: { design: DesignData; catalog: Catalog; apply: (fn: (d: DesignData) => DesignData) => void }) {
  const fin = finishesOf(design);
  const keys = finishKeys(fin);
  const [open, setOpen] = useState<FinishUse | null>("floor");
  const thick = catalog.countertops.find((c) => c.id === design.countertopId)?.thickness ?? 1.5;
  const set = (fn: (f: FinishData) => FinishData) => apply((d) => ({ ...d, finishes: fn(finishesOf(d)) }));
  const setUse = (u: FinishUse, e: FinishEntry | null) => set((f) => {
    const uses = { ...f.uses };
    if (e) uses[u] = e;
    else delete uses[u];
    return { ...f, uses };
  });
  const chip = (on: boolean) => `chip ${on ? "chip-on" : ""}`;
  const setSink = (patch: Partial<SinkSpec>) => set((f) => ({ ...f, sink: { ...(f.sink ?? {}), ...patch } }));

  return (
    <div className="panel-scroll stack">
      <p className="muted">Pick what goes on each surface. The finish plan and finish schedule print with the drawings once anything is picked.</p>
      {FINISH_USES.map((u) => {
        const e = fin.uses[u];
        const isOpen = open === u;
        return (
          <div key={u} className="mep-spec">
            <button className="mep-spec-head" onClick={() => setOpen(isOpen ? null : u)} aria-expanded={isOpen}>
              <b>{USE_NAME[u]}</b>
              <span className="muted">{e ? `${keys[u]} ${e.description || MATERIAL_NAME[e.material]}` : "not picked"}</span>
            </button>
            {isOpen && (
              <div className="stack">
                <div className="chips">
                  {MATERIALS_FOR[u].map((m) => (
                    <button key={m} className={chip(e?.material === m)} onClick={() => setUse(u, { ...(e ?? {}), material: m })}>{MATERIAL_NAME[m]}</button>
                  ))}
                  {e && <button className="chip" onClick={() => setUse(u, null)}>None</button>}
                </div>
                {e && (
                  <>
                    {(u === "floor" || u === "backsplash") && e.material !== "paint" && e.material !== "carpet" && (
                      <div className="field">
                        <span className="field-label">{["wood", "vinyl", "laminate"].includes(e.material) ? "Plank width x length (inches)" : "Tile size (inches)"}</span>
                        <div className="chips">
                          <input className="input fin-size" inputMode="decimal" value={e.size?.w ?? ""} placeholder="12"
                            onChange={(ev) => setUse(u, { ...e, size: { w: Number(ev.target.value) || 0, l: e.size?.l ?? 24 } })} />
                          <span>x</span>
                          <input className="input fin-size" inputMode="decimal" value={e.size?.l ?? ""} placeholder="24"
                            onChange={(ev) => setUse(u, { ...e, size: { w: e.size?.w ?? 12, l: Number(ev.target.value) || 0 } })} />
                        </div>
                      </div>
                    )}
                    {FIELDS.map(([f, label, hint]) => (
                      <label key={f} className="field">
                        <span className="field-label">{label}</span>
                        <input className="input" value={(e[f] as string | undefined) ?? ""} placeholder={hint} onChange={(ev) => setUse(u, { ...e, [f]: ev.target.value })} />
                      </label>
                    ))}
                    <span className="muted">Quantity from the drawings: {finishQuantity(design, u, thick)} (no waste added).</span>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
      <div className="field">
        <span className="field-label">Countertop edge</span>
        <div className="chips">
          {["square", "eased", "1/4\" bevel", "half bullnose", "full bullnose", "ogee", "mitered"].map((x) => (
            <button key={x} className={chip(fin.counterEdge === x)} onClick={() => set((f) => ({ ...f, counterEdge: x }))}>{x}</button>
          ))}
        </div>
      </div>
      <div className="field">
        <span className="field-label">Sink mounting</span>
        <div className="chips">
          {["undermount", "drop-in", "farmhouse (apron front)"].map((x) => (
            <button key={x} className={chip(fin.sinkMount === x)} onClick={() => set((f) => ({ ...f, sinkMount: x }))}>{x}</button>
          ))}
        </div>
      </div>
      {fin.sinkMount === "undermount" && (
        <div className="field">
          <span className="field-label">Undermount reveal (how the stone edge meets the bowl)</span>
          <div className="chips">
            {(["positive", "negative", "flush"] as const).map((x) => (
              <button key={x} className={chip(fin.sink?.reveal === x)} onClick={() => setSink({ reveal: x })}>{x}</button>
            ))}
          </div>
        </div>
      )}
      <h3 className="cat-title">Sink and faucet (for the countertop plan)</h3>
      <p className="muted">From the sink and faucet spec sheets. What is left blank prints as &quot;per template&quot; for the fabricator.</p>
      <label className="field">
        <span className="field-label">Sink model</span>
        <input className="input" value={fin.sink?.model ?? ""} onChange={(e) => setSink({ model: e.target.value })} />
      </label>
      <div className="field">
        <span className="field-label">Sink cutout, width x depth (inches)</span>
        <div className="chips">
          <input className="input fin-size" inputMode="decimal" value={fin.sink?.cutout?.w ?? ""} placeholder="W"
            onChange={(e) => setSink({ cutout: { w: Number(e.target.value) || 0, d: fin.sink?.cutout?.d ?? 0 } })} />
          <span>x</span>
          <input className="input fin-size" inputMode="decimal" value={fin.sink?.cutout?.d ?? ""} placeholder="D"
            onChange={(e) => setSink({ cutout: { w: fin.sink?.cutout?.w ?? 0, d: Number(e.target.value) || 0 } })} />
        </div>
      </div>
      <div className="field">
        <span className="field-label">Faucet holes in the counter</span>
        <div className="chips">
          {[0, 1, 2, 3, 4].map((n) => (
            <button key={n} className={chip((fin.sink?.faucetHoles ?? 0) === n)} onClick={() => setSink({ faucetHoles: n })}>{n === 0 ? "None" : n}</button>
          ))}
        </div>
      </div>
      {(fin.sink?.faucetHoles ?? 0) > 0 && (
        <div className="grid2">
          <label className="field">
            <span className="field-label">Hole size (inches)</span>
            <input className="input" inputMode="decimal" value={fin.sink?.holeSize ?? ""} placeholder="From the faucet sheet"
              onChange={(e) => setSink({ holeSize: Number(e.target.value) || undefined })} />
          </label>
          {(fin.sink?.faucetHoles ?? 0) > 1 && (
            <label className="field">
              <span className="field-label">Spread, outer holes (inches)</span>
              <input className="input" inputMode="decimal" value={fin.sink?.spread ?? ""} placeholder="For example 8"
                onChange={(e) => setSink({ spread: Number(e.target.value) || undefined })} />
            </label>
          )}
        </div>
      )}
    </div>
  );
}
