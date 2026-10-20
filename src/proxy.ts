import { NextResponse, type NextRequest } from "next/server";
import { contentSecurityPolicy } from "@/lib/csp";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce);

  let response: NextResponse;
  try {
    // Next.js reads the CSP from the request headers to nonce its own scripts.
    response = await updateSession(request, { "x-nonce": nonce, "Content-Security-Policy": csp });
  } catch (error) {
    // Most likely missing configuration. Let the request through so that
    // /api/health can still explain what's wrong; pages fail on their own.
    console.error("proxy: session refresh failed", error);
    const headers = new Headers(request.headers);
    headers.set("x-nonce", nonce);
    headers.set("Content-Security-Policy", csp);
    response = NextResponse.next({ request: { headers } });
  }
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    // Skip static assets and image optimisation.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif)$).*)",
  ],
};
