import Link from "next/link";
import { AppHeader } from "@/components/app/AppHeader";
import { DesignRowActions, NewDesignForm } from "@/components/app/DesignListClient";
import { listDesigns, type DesignSummary } from "@/lib/data";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DesignsPage() {
  const sb = await getSupabaseServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  let designs: DesignSummary[] = [];
  let loadError: string | null = null;
  try {
    designs = await listDesigns(sb);
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Could not load designs.";
  }

  return (
    <>
      <AppHeader current="designs" email={user?.email ?? null} />
      <main className="page">
        <div className="page-head">
          <div>
            <h1 className="page-title">Kitchen designs</h1>
            <p className="muted" style={{ margin: "6px 0 0" }}>
              Top view and front views drawn from our own cabinet sizes and colors.
            </p>
          </div>
        </div>
        <div className="card" style={{ marginBottom: 24 }}>
          <NewDesignForm />
        </div>
        {loadError && <div className="error-box">{loadError}</div>}
        <table className="table">
          <thead>
            <tr>
              <th>Design</th>
              <th>Customer</th>
              <th>Designer</th>
              <th>Last changed</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {designs.map((d) => (
              <tr key={d.id}>
                <td>
                  <Link href={`/designs/${d.id}`}>{d.name}</Link>
                </td>
                <td>{d.customer_name ?? ""}</td>
                <td>{d.designer_name ?? ""}</td>
                <td className="tabular">
                  {new Date(d.updated_at).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                </td>
                <td>
                  <DesignRowActions id={d.id} name={d.name} />
                </td>
              </tr>
            ))}
            {!designs.length && !loadError && (
              <tr>
                <td colSpan={5} className="muted">
                  No designs yet. Start one above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </main>
    </>
  );
}
