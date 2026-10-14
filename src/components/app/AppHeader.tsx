import Link from "next/link";
import { Brand } from "@/components/Brand";
import { SignOutButton } from "./SignOutButton";

export function AppHeader({ current, email }: { current: "designs" | "catalog"; email: string | null }) {
  return (
    <header className="app-header">
      <Link href="/" aria-label="Designs">
        <Brand size={24} />
      </Link>
      <nav>
        <Link href="/" aria-current={current === "designs" ? "page" : undefined}>
          Designs
        </Link>
        <Link href="/catalog" aria-current={current === "catalog" ? "page" : undefined}>
          Catalog
        </Link>
      </nav>
      <span className="spacer" />
      {email && <span className="muted">{email}</span>}
      <SignOutButton />
    </header>
  );
}
