"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createDesign, deleteDesign, duplicateDesign } from "@/lib/data";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export function NewDesignForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [customer, setCustomer] = useState("");
  const [designer, setDesigner] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          const id = await createDesign(getSupabaseBrowserClient(), {
            name: name.trim() || (customer.trim() ? `${customer.trim()} kitchen` : "Untitled kitchen"),
            customer_name: customer.trim() || null,
            designer_name: designer.trim() || null,
          });
          router.push(`/designs/${id}`);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not create the design.");
          setBusy(false);
        }
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 12, alignItems: "end" }}>
        <label className="field">
          <span className="field-label">Customer</span>
          <input className="input" value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Last name" />
        </label>
        <label className="field">
          <span className="field-label">Design name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Defaults to customer + kitchen" />
        </label>
        <label className="field">
          <span className="field-label">Designer</span>
          <input className="input" value={designer} onChange={(e) => setDesigner(e.target.value)} />
        </label>
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Creating..." : "New design"}
        </button>
      </div>
      {error && <div className="error-box">{error}</div>}
    </form>
  );
}

export function DesignRowActions({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <div className="row-actions">
      <button
        className="btn btn-ghost btn-small"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const copy = await duplicateDesign(getSupabaseBrowserClient(), id);
            router.push(`/designs/${copy}`);
          } catch {
            setBusy(false);
          }
        }}
      >
        Duplicate
      </button>
      <button
        className="btn btn-ghost btn-small"
        disabled={busy}
        onClick={async () => {
          if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
          setBusy(true);
          try {
            await deleteDesign(getSupabaseBrowserClient(), id);
            router.refresh();
          } finally {
            setBusy(false);
          }
        }}
      >
        Delete
      </button>
    </div>
  );
}
