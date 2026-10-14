import { AppHeader } from "@/components/app/AppHeader";
import { CatalogManager } from "@/components/app/CatalogManager";
import { loadCatalog } from "@/lib/data";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Catalog" };

export default async function CatalogPage() {
  const sb = await getSupabaseServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  const catalog = await loadCatalog(sb);
  const admin = user?.app_metadata?.role === "admin";
  return (
    <>
      <AppHeader current="catalog" email={user?.email ?? null} />
      <main className="page">
        <div className="page-head">
          <div>
            <h1 className="page-title">Catalog</h1>
            <p className="muted" style={{ margin: "6px 0 0" }}>
              The cabinet sizes, colors and countertops designers can use. Changes show up in the designer right away.
            </p>
          </div>
        </div>
        <CatalogManager catalog={catalog} admin={admin} />
      </main>
    </>
  );
}
