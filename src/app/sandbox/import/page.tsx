// Development only: the import screen against the sample catalog. Saving needs a database.

import { notFound } from "next/navigation";
import { ImportWizard } from "@/components/app/ImportWizard";
import { STANDARD_CATALOG } from "@/lib/standard-catalog";

export default function SandboxImportPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="page">
      <h1 className="page-title" style={{ marginBottom: 24 }}>
        Import products (sandbox)
      </h1>
      <ImportWizard catalog={STANDARD_CATALOG} />
    </main>
  );
}
