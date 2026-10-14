import type { Metadata } from "next";
// Fonts are bundled from npm (same families as the Design Center site), so builds never depend on Google Fonts.
import "@fontsource/domine/latin-700.css";
import "@fontsource/source-sans-3/latin-400.css";
import "@fontsource/source-sans-3/latin-600.css";
import "@fontsource/source-sans-3/latin-700.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "US Floor Design Studio", template: "%s | US Floor Design Studio" },
  description: "Kitchen layout and cabinet design for US Floor Design Center.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
