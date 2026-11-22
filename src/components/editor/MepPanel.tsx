"use client";

// The Electrical tab: outlets, lights, switches and plumbing hook-ups for the
// MEP sheet (owner, 2026-11-21). One button lays out the whole plan from the
// kitchen; then pieces are dragged in the top view, added from the buttons
// below, or deleted. The schedule details (maker, model, finish) are typed
// once per type and print in the lighting and MEP schedules.

import { useState } from "react";
import { MepLegendGlyph } from "@/components/drawing/MepSymbols";
import { MEP_KINDS, TAG_MEANING, layoutMep, mepKey, mepOf, newMepItem, type MepData, type MepItem, type MepKind, type MepSpec } from "@/lib/mep";
import { roomShape } from "@/lib/geometry";
import type { DesignData } from "@/lib/types";

const PALETTE: { title: string; kinds: MepKind[] }[] = [
  { title: "Outlets", kinds: ["duplex", "r240", "hardwired", "junction", "data"] },
  { title: "Lights and switches", kinds: ["recessed", "pendant", "ceiling_light", "sconce", "undercabinet", "switch"] },
  { title: "Plumbing and gas", kinds: ["supply_valve", "gas_valve", "disposal"] },
  { title: "Air and safety", kinds: ["exhaust", "register", "thermostat", "smoke"] },
];

const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2));

export function MepPanel({ design, apply, selectedId, setSelectedId, wall, flash }: {
  design: DesignData;
  apply: (fn: (d: DesignData) => DesignData) => void;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  wall: string | null;
  flash: (msg: string) => void;
}) {
  const mep = mepOf(design);
  const [notes, setNotes] = useState<string[]>([]);
  const setMep = (fn: (m: MepData) => MepData) => apply((d) => ({ ...d, mep: fn(mepOf(d)) }));
  const selected = mep.items.find((m) => m.id === selectedId) ?? null;
  const update = (patch: Partial<MepItem>) => selected && setMep((m) => ({ ...m, items: m.items.map((x) => (x.id === selected.id ? { ...x, ...patch } : x)) }));
  const switches = mep.items.filter((m) => m.kind === "switch");
  const seen = new Map<string, MepItem>();
  for (const m of mep.items) if (!seen.has(mepKey(m))) seen.set(mepKey(m), m);
  const keys = [...seen.entries()];
  const [openKey, setOpenKey] = useState<string | null>(null);
  const wallName = (id: string | null) => roomShape(design.room).walls.find((w) => w.id === id)?.label ?? "";

  const layout = () => {
    const r = layoutMep(design, uid);
    apply((d) => ({ ...d, mep: r.mep }));
    setNotes(r.notes);
    setSelectedId(null);
  };

  const addKind = (k: MepKind) => {
    const it = newMepItem(design, k, wall, uid);
    setMep((m) => ({ ...m, items: [...m.items, it] }));
    setSelectedId(it.id);
    flash(MEP_KINDS[k].mount === "wall" ? `Added to ${wallName(it.wall)}. Drag it along the wall to place it.` : "Added in the middle of the room. Drag it into place.");
  };

  const remove = () => {
    if (!selected) return;
    setMep((m) => ({
      ...m,
      items: m.items.filter((x) => x.id !== selected.id).map((x) => (x.controls ? { ...x, controls: x.controls.filter((c) => c !== selected.id) } : x)),
    }));
    setSelectedId(null);
  };

  const setSpec = (key: string, patch: MepSpec) => setMep((m) => ({ ...m, specs: { ...m.specs, [key]: { ...(m.specs[key] ?? {}), ...patch } } }));

  const choice = (on: boolean) => `chip ${on ? "chip-on" : ""}`;

  return (
    <div className="panel-scroll stack">
      <div className="field">
        <span className="field-label">The range runs on</span>
        <div className="chips">
          <button className={choice(mep.rangeFuel === "gas")} onClick={() => setMep((m) => ({ ...m, rangeFuel: "gas" }))}>Gas</button>
          <button className={choice(mep.rangeFuel === "electric")} onClick={() => setMep((m) => ({ ...m, rangeFuel: "electric" }))}>Electric</button>
        </div>
      </div>
      <label className="wiz-check">
        <input type="checkbox" checked={mep.disposal} onChange={(e) => setMep((m) => ({ ...m, disposal: e.target.checked }))} /> Garbage disposal in the sink
      </label>
      <button className="btn btn-primary btn-fill" onClick={layout}>
        {mep.items.some((m) => m.auto) ? "Lay out again" : "Lay out outlets, lights and plumbing"}
      </button>
      <p className="muted">Places counter outlets every 4 feet, the appliance outlets and hook-ups, recessed lights, pendants over the island, under-cabinet lights and the switches by the door. Pieces you added yourself stay. Undo brings back the last layout.</p>
      {notes.length > 0 && (
        <div className="fill-notes">
          {notes.map((n, i) => <p key={i}>{n}</p>)}
          <button className="btn btn-secondary" onClick={() => setNotes([])}>OK</button>
        </div>
      )}

      {selected ? (
        <div className="stack mep-selected">
          <div className="mep-selected-head">
            <MepLegendGlyph kind={selected.kind} tag={selected.tag} />
            <b>{MEP_KINDS[selected.kind].name}</b>
          </div>
          {selected.wall && <span className="muted">On {wallName(selected.wall)}, {Math.round(selected.offset)}&quot; from its left end. Drag it to move it.</span>}
          <label className="field">
            <span className="field-label">Type mark</span>
            <input className="input" value={selected.tag} placeholder="For example GFCI, DW, R1" onChange={(e) => update({ tag: e.target.value.toUpperCase().slice(0, 8) })} />
            {TAG_MEANING[selected.tag] && <span className="muted">{TAG_MEANING[selected.tag]}</span>}
          </label>
          <label className="field">
            <span className="field-label">Where (height or place)</span>
            <input className="input" value={selected.aff} placeholder={`For example 48" AFF`} onChange={(e) => update({ aff: e.target.value })} />
          </label>
          {selected.kind === "undercabinet" && (
            <label className="field">
              <span className="field-label">Length (inches)</span>
              <input className="input" inputMode="decimal" value={selected.length ?? 24} onChange={(e) => update({ length: Math.max(6, Number(e.target.value) || 24) })} />
            </label>
          )}
          {selected.kind === "exhaust" && (
            <label className="field">
              <span className="field-label">Duct runs</span>
              <input className="input" value={selected.note ?? ""} onChange={(e) => update({ note: e.target.value })} />
            </label>
          )}
          {MEP_KINDS[selected.kind].group === "lighting" && selected.kind !== "switch" && (
            <label className="field">
              <span className="field-label">Turned on by</span>
              <select className="input" value={switches.find((s) => s.controls?.includes(selected.id))?.id ?? ""}
                onChange={(e) => setMep((m) => ({
                  ...m,
                  items: m.items.map((x) => (x.kind !== "switch" ? x : {
                    ...x,
                    controls: x.id === e.target.value ? [...new Set([...(x.controls ?? []), selected.id])] : (x.controls ?? []).filter((c) => c !== selected.id),
                  })),
                }))}>
                <option value="">No switch</option>
                {switches.map((s, i) => <option key={s.id} value={s.id}>Switch {i + 1} on {wallName(s.wall)}{s.tag ? ` (${s.tag})` : ""}</option>)}
              </select>
            </label>
          )}
          <div className="chips">
            <button className="btn btn-secondary" onClick={remove}>Delete</button>
            <button className="btn btn-secondary" onClick={() => setSelectedId(null)}>Done</button>
          </div>
        </div>
      ) : (
        <span className="muted">Click a symbol in the top view to change or delete it. Wall pieces go on the wall picked under Add to.</span>
      )}

      {PALETTE.map((g) => (
        <div key={g.title} className="field">
          <span className="field-label">Add {g.title.toLowerCase()}</span>
          <div className="mep-palette">
            {g.kinds.map((k) => (
              <button key={k} className="mep-add" onClick={() => addKind(k)} title={MEP_KINDS[k].name}>
                <MepLegendGlyph kind={k} tag="" />
                <span>{MEP_KINDS[k].name}</span>
              </button>
            ))}
          </div>
        </div>
      ))}

      {keys.length > 0 && (
        <div className="field">
          <span className="field-label">Schedule details</span>
          <span className="muted">Typed once per type; they print in the lighting and MEP schedules.</span>
          {keys.map(([k, m]) => {
            const sp = mep.specs[k] ?? {};
            const open = openKey === k;
            return (
              <div key={k} className="mep-spec">
                <button className="mep-spec-head" onClick={() => setOpenKey(open ? null : k)} aria-expanded={open}>
                  <MepLegendGlyph kind={m.kind} tag={m.tag} />
                  <span>{MEP_KINDS[m.kind].name}{m.tag ? ` ${m.tag}` : ""}</span>
                  <span className="muted">{sp.manufacturer || sp.product ? "filled in" : "add details"}</span>
                </button>
                {open && (
                  <div className="stack">
                    {([
                      ["description", "Description"], ["manufacturer", "Manufacturer (full name)"], ["product", "Product no."],
                      ["finish", "Color / finish"], ...(MEP_KINDS[m.kind].schedule === "lighting" && m.kind !== "switch" ? [["kelvin", "Kelvin / CRI"]] : []),
                      ["notes", "Notes"], ["suppliedBy", "Supplied by"], ["installedBy", "Installed by"],
                    ] as [keyof MepSpec, string][]).map(([f, label]) => (
                      <label key={f} className="field">
                        <span className="field-label">{label}</span>
                        <input className="input" value={sp[f] ?? ""} onChange={(e) => setSpec(k, { [f]: e.target.value })} />
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
