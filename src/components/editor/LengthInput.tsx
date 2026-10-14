"use client";

// Text input for inch values. Accepts 34 1/2, 34.5, 12'6", 3/4 and similar.
// Shows the stored value as inches with fractions; reverts if unreadable.

import { useState } from "react";
import { fmtIn, parseLength, round8 } from "@/lib/units";

export function LengthInput({
  value,
  onChange,
  min,
  max,
  label,
  id,
  hint,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  label: string;
  id: string;
  hint?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [bad, setBad] = useState(false);

  const commit = () => {
    if (draft === null) return;
    const parsed = parseLength(draft);
    if (parsed === null || (min !== undefined && parsed < min) || (max !== undefined && parsed > max)) {
      setBad(true);
      setDraft(null);
      window.setTimeout(() => setBad(false), 1600);
      return;
    }
    setDraft(null);
    setBad(false);
    const v = round8(parsed);
    if (v !== value) onChange(v);
  };

  return (
    <label htmlFor={id} className="field">
      <span className="field-label">{label}</span>
      <input
        id={id}
        className={`input tabular ${bad ? "input-bad" : ""}`}
        value={draft ?? fmtIn(value)}
        inputMode="decimal"
        onFocus={(e) => {
          setDraft(fmtIn(value, false));
          requestAnimationFrame(() => e.target.select());
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setDraft(null);
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      {bad ? <span className="field-hint field-hint-bad">Enter a size like 34 1/2 or 12&apos;6&quot;{min !== undefined ? ` (at least ${fmtIn(min)})` : ""}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}
