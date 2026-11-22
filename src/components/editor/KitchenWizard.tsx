"use client";

// The kitchen wizard, five plain steps (owner, 2026-11-21: easy enough for
// someone with minimal computer skills): the shape, the sizes, the window and
// door, the appliances, and the look. Big buttons, pictures, no CAD words. The
// kitchen it builds is an ordinary design: everything can be changed after.

import { useMemo, useState } from "react";
import { CABINET_WALLS, SHAPE_LABEL, buildKitchen, defaultSpec, freeEnds, type Shape, type WizardSpec } from "@/lib/wizard";
import type { Catalog, DesignData } from "@/lib/types";
import { fmtFtIn, parseLength } from "@/lib/units";

const SHAPES: Shape[] = ["one", "L", "U", "galley"];
const STEPS = ["Shape", "Size", "Window and door", "Appliances", "Look"];

/** A small top view of the shape: the room outline, with the cabinet walls drawn heavy. */
function ShapePicture({ shape, island }: { shape: Shape; island?: boolean }) {
  const walls = CABINET_WALLS[shape];
  const heavy = (w: string) => (walls.includes(w) ? 9 : 2);
  return (
    <svg viewBox="0 0 100 80" width="120" height="96" aria-hidden="true">
      <rect x={6} y={6} width={88} height={68} fill="#FFFFFF" stroke="#C9CCCE" strokeWidth={1.5} />
      <line x1={6} y1={10} x2={94} y2={10} stroke="#1A1D1F" strokeWidth={heavy("A")} opacity={walls.includes("A") ? 1 : 0} />
      <line x1={90} y1={6} x2={90} y2={74} stroke="#1A1D1F" strokeWidth={heavy("B")} opacity={walls.includes("B") ? 1 : 0} />
      <line x1={6} y1={70} x2={94} y2={70} stroke="#1A1D1F" strokeWidth={heavy("C")} opacity={walls.includes("C") ? 1 : 0} />
      <line x1={10} y1={6} x2={10} y2={74} stroke="#1A1D1F" strokeWidth={heavy("D")} opacity={walls.includes("D") ? 1 : 0} />
      {island ? <rect x={36} y={34} width={28} height={12} fill="#1A1D1F" /> : null}
      <text x={50} y={4.5} fontSize={5} textAnchor="middle" fill="#6D7276">A</text>
    </svg>
  );
}

function LengthInput({ label, value, onChange, hint }: { label: string; value: number; onChange: (v: number) => void; hint?: string }) {
  const [text, setText] = useState(fmtFtIn(value));
  const parsed = parseLength(text);
  return (
    <label className="field wiz-field">
      <span className="field-label">{label}</span>
      <input className="input wiz-input" value={text} inputMode="decimal"
        onChange={(e) => { setText(e.target.value); const v = parseLength(e.target.value); if (v && v > 0) onChange(v); }} />
      <span className={parsed ? "muted" : "wiz-error"}>{parsed ? `${fmtFtIn(parsed)} (${Math.round(parsed)}")` : "Type a length like 12' 6\" or 150"}</span>
      {hint ? <span className="muted">{hint}</span> : null}
    </label>
  );
}

export function KitchenWizard({ design, catalog, onDone, onClose }: {
  design: DesignData; catalog: Catalog;
  onDone: (design: DesignData, notes: string[]) => void; onClose: () => void;
}) {
  const [step, setStep] = useState(0);
  const [spec, setSpec] = useState<WizardSpec>(() => defaultSpec("L", { lineId: design.lineId, finishId: design.finishId, countertopId: design.countertopId }));
  const set = (patch: Partial<WizardSpec>) => setSpec((s) => ({ ...s, ...patch }));
  const walls = CABINET_WALLS[spec.shape];
  const plainWalls = ["A", "B", "C", "D"].filter((w) => !walls.includes(w));
  const lines = useMemo(() => catalog.lines.filter((l) => catalog.products.some((p) => p.line_id === l.id && p.style === "base")), [catalog]);
  const lineId = spec.lineId ?? lines[0]?.id ?? null;
  const finishes = catalog.finishes.filter((f) => f.line_id === lineId);
  const wallName = (w: string) => `Wall ${w}`;
  const fridgeEnds = freeEnds(spec.shape, spec.fridge.wall);

  const build = () => {
    const makeId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2));
    const r = buildKitchen(design, catalog, { ...spec, lineId }, makeId);
    onDone(r.design, r.notes);
  };

  const choice = (on: boolean) => `wiz-choice ${on ? "wiz-choice-on" : ""}`;

  return (
    <div className="preview-back wiz-back" role="dialog" aria-modal="true" aria-label="Kitchen wizard">
      <div className="preview-bar">
        <div>
          <div className="preview-title">Kitchen wizard</div>
          <div className="muted">Step {step + 1} of {STEPS.length}: {STEPS[step]}. You can change everything afterwards.</div>
        </div>
        <div className="preview-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
      <div className="wiz-body">
        <ol className="wiz-steps" aria-label="Steps">
          {STEPS.map((s, i) => <li key={s} className={i === step ? "on" : i < step ? "done" : ""}>{s}</li>)}
        </ol>

        {step === 0 && (
          <section className="wiz-section">
            <h2>What shape is the kitchen?</h2>
            <div className="wiz-grid">
              {SHAPES.map((s) => (
                <button key={s} className={choice(spec.shape === s)} onClick={() => setSpec((x) => defaultSpec(s, { width: x.width, depth: x.depth, ceiling: x.ceiling, island: x.island, lineId: x.lineId, finishId: x.finishId, countertopId: x.countertopId }))}>
                  <ShapePicture shape={s} island={spec.island} />
                  <span>{SHAPE_LABEL[s]}</span>
                </button>
              ))}
            </div>
            <label className="wiz-check">
              <input type="checkbox" checked={spec.island} onChange={(e) => set({ island: e.target.checked })} />
              Add an island (only if there is room for 42&quot; walkways around it)
            </label>
          </section>
        )}

        {step === 1 && (
          <section className="wiz-section">
            <h2>How big is the room?</h2>
            <div className="wiz-size">
              <ShapePicture shape={spec.shape} island={spec.island} />
              <div className="wiz-fields">
                <LengthInput label="Wall A (the top wall)" value={spec.width} onChange={(v) => set({ width: v })} />
                <LengthInput label="Wall B (the right wall)" value={spec.depth} onChange={(v) => set({ depth: v })} />
                <LengthInput label="Ceiling height" value={spec.ceiling} onChange={(v) => set({ ceiling: v })} hint="Most homes: 8' (96&quot;)." />
              </div>
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="wiz-section">
            <h2>Is there a window over the sink?</h2>
            <div className="wiz-row">
              <button className={choice(!!spec.window)} onClick={() => set({ window: spec.window ?? { width: 36 } })}>Yes</button>
              <button className={choice(!spec.window)} onClick={() => set({ window: null })}>No</button>
              {spec.window && (
                <label className="field"><span className="field-label">Window width</span>
                  <select className="input" value={spec.window.width} onChange={(e) => set({ window: { width: Number(e.target.value) } })}>
                    {[24, 30, 36, 42, 48, 60].map((w) => <option key={w} value={w}>{w}&quot;</option>)}
                  </select>
                </label>
              )}
            </div>
            <h2>Where is the door into the kitchen?</h2>
            <div className="wiz-row">
              {[...plainWalls, null].map((w) => (
                <button key={w ?? "none"} className={choice((spec.door?.wall ?? null) === w)} onClick={() => set({ door: w ? { wall: w, at: spec.door?.at ?? "center", width: 32 } : null })}>
                  {w ? wallName(w) : "No door to show"}
                </button>
              ))}
            </div>
            {spec.door && (
              <div className="wiz-row">
                {(["left", "center", "right"] as const).map((a) => (
                  <button key={a} className={choice(spec.door!.at === a)} onClick={() => set({ door: { ...spec.door!, at: a } })}>{a === "center" ? "In the middle" : `Near the ${a} end`}</button>
                ))}
              </div>
            )}
          </section>
        )}

        {step === 3 && (
          <section className="wiz-section">
            <h2>Where does the sink go?</h2>
            <div className="wiz-row">{walls.map((w) => <button key={w} className={choice(spec.sinkWall === w)} onClick={() => set({ sinkWall: w })}>{wallName(w)}</button>)}</div>
            <label className="wiz-check"><input type="checkbox" checked={spec.dishwasher} onChange={(e) => set({ dishwasher: e.target.checked })} /> Dishwasher next to the sink</label>
            <h2>Where does the range go?</h2>
            <div className="wiz-row">
              {walls.map((w) => <button key={w} className={choice(spec.rangeWall === w)} onClick={() => set({ rangeWall: w })}>{wallName(w)}</button>)}
              <label className="field"><span className="field-label">Range width</span>
                <select className="input" value={spec.rangeWidth} onChange={(e) => set({ rangeWidth: Number(e.target.value) })}>
                  {[30, 36].map((w) => <option key={w} value={w}>{w}&quot;</option>)}
                </select>
              </label>
            </div>
            <h2>Where does the refrigerator go?</h2>
            <div className="wiz-row">
              {walls.filter((w) => freeEnds(spec.shape, w).length).map((w) => (
                <button key={w} className={choice(spec.fridge.wall === w)} onClick={() => set({ fridge: { ...spec.fridge, wall: w, end: freeEnds(spec.shape, w).includes(spec.fridge.end) ? spec.fridge.end : freeEnds(spec.shape, w)[0] } })}>{wallName(w)}</button>
              ))}
              {fridgeEnds.map((e) => <button key={e} className={choice(spec.fridge.end === e)} onClick={() => set({ fridge: { ...spec.fridge, end: e } })}>At the {e} end</button>)}
              <label className="field"><span className="field-label">Fridge width</span>
                <select className="input" value={spec.fridge.width} onChange={(e) => set({ fridge: { ...spec.fridge, width: Number(e.target.value) } })}>
                  {[30, 36].map((w) => <option key={w} value={w}>{w}&quot;</option>)}
                </select>
              </label>
            </div>
          </section>
        )}

        {step === 4 && (
          <section className="wiz-section">
            <h2>Cabinet line</h2>
            <div className="wiz-row">
              {lines.map((l) => <button key={l.id} className={choice(lineId === l.id)} onClick={() => set({ lineId: l.id, finishId: null })}>{l.name}</button>)}
            </div>
            <h2>Cabinet color</h2>
            <div className="wiz-swatches">
              {finishes.map((f) => (
                <button key={f.id} className={choice((spec.finishId ?? finishes[0]?.id) === f.id)} onClick={() => set({ finishId: f.id })}>
                  <span className="wiz-swatch" style={{ background: f.image_url ? `center / cover url(${f.image_url})` : f.color_hex }} />
                  <span>{f.name}</span>
                </button>
              ))}
            </div>
            <h2>Countertop</h2>
            <div className="wiz-swatches">
              {catalog.countertops.map((c) => (
                <button key={c.id} className={choice((spec.countertopId ?? catalog.countertops[0]?.id) === c.id)} onClick={() => set({ countertopId: c.id })}>
                  <span className="wiz-swatch" style={{ background: c.image_url ? `center / cover url(${c.image_url})` : c.color_hex }} />
                  <span>{c.name}</span>
                </button>
              ))}
            </div>
            {design.items.length > 0 && <p className="wiz-warn">This replaces the layout already in this design. Undo brings it back.</p>}
          </section>
        )}

        <div className="wiz-nav">
          <button className="btn btn-secondary wiz-big" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>Back</button>
          {step < STEPS.length - 1 ? (
            <button className="btn btn-primary wiz-big" onClick={() => setStep((s) => s + 1)}>Next</button>
          ) : (
            <button className="btn btn-primary wiz-big" onClick={build}>Build my kitchen</button>
          )}
        </div>
      </div>
    </div>
  );
}
