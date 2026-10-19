import "server-only";
import { headers } from "next/headers";

// Public origin for links in emails. Prefer the configured URL: request
// headers can be spoofed when the app isn't behind a trusted proxy.
export async function siteOrigin() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}
