// Content-Security-Policy for every page. Scripts need this request's nonce
// (Next.js adds it to its own scripts); everything else is limited to the
// origins the app actually uses.
export function contentSecurityPolicy(nonce: string) {
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin : "";
  const dev = process.env.NODE_ENV === "development";

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(dev ? ["'unsafe-eval'"] : [])],
    // Inline style attributes (chart positions, progress bars) can't carry a
    // nonce, so styles allow inline. Style injection can't run code.
    "style-src": ["'self'", "'unsafe-inline'"],
    // Photos are signed Supabase Storage URLs; video posters come from Mux.
    "img-src": ["'self'", "data:", "blob:", supabase, "https://image.mux.com"],
    "media-src": ["'self'", "blob:", "https://*.mux.com"],
    // Browser uploads go to Supabase Storage; Mux streams, its direct-upload
    // bucket and its playback analytics.
    "connect-src": ["'self'", supabase, "https://*.mux.com", "https://storage.googleapis.com", "https://*.litix.io"],
    "worker-src": ["'self'", "blob:"],
    "font-src": ["'self'", "data:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    // Checkout and the billing portal are reached by redirect after a form post.
    "form-action": ["'self'", "https://checkout.stripe.com", "https://billing.stripe.com"],
    "frame-ancestors": ["'none'"],
  };

  const policy = Object.entries(directives)
    .map(([name, values]) => [name, ...values.filter(Boolean)].join(" "))
    .join("; ");
  // Only upgrade when the backend is HTTPS; local Supabase runs on plain http.
  return supabase.startsWith("https://") ? `${policy}; upgrade-insecure-requests` : policy;
}
