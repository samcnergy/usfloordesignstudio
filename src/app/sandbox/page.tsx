// Development only: the editor with the standard catalog and no database.
// The proxy lets it through only when NODE_ENV is not production.

import { notFound } from "next/navigation";
import { SandboxEditor } from "./SandboxEditor";

export default function SandboxPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <SandboxEditor />;
}
