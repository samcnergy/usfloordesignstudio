// Refreshes the Supabase session on every request and sends signed-out
// visitors to /login. Next.js 16 calls this file proxy (formerly middleware).

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // The sandbox runs without a database and only exists in development.
  if (path.startsWith("/sandbox") && process.env.NODE_ENV !== "production") return NextResponse.next();

  const res = NextResponse.next({ request: req });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });

  let signedIn = false;
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    signedIn = !!user;
  } catch {
    signedIn = false;
  }

  if (path === "/login") {
    if (signedIn) return NextResponse.redirect(new URL("/", req.url));
    return res;
  }
  if (!signedIn) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.svg|.*\\.png|.*\\.jpg|.*\\.jpeg|.*\\.webp|.*\\.ico|.*\\.woff2?).*)"],
};
