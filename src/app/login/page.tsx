"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Brand } from "@/components/Brand";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="login-wrap">
      <form
        className="login-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          const { error } = await getSupabaseBrowserClient().auth.signInWithPassword({ email: email.trim(), password });
          setBusy(false);
          if (error) {
            setError(error.message === "Invalid login credentials" ? "That email and password do not match." : error.message);
            return;
          }
          router.replace("/");
          router.refresh();
        }}
      >
        <Brand size={34} />
        <p className="muted" style={{ margin: 0 }}>
          Sign in with your US Floor staff account.
        </p>
        <label className="field">
          <span className="field-label">Email</span>
          <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Password</span>
          <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <div className="error-box">{error}</div>}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}
