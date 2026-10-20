function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

// Referenced literally so Next.js can inline them into the browser bundle.
export const supabaseUrl = required(
  "NEXT_PUBLIC_SUPABASE_URL",
  process.env.NEXT_PUBLIC_SUPABASE_URL,
);
export const supabasePublishableKey = required(
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

// Server-side requests to Supabase give up after this long, so an unresponsive
// backend shows the error page instead of hanging the request.
const SERVER_TIMEOUT_MS = 15_000;

export const serverFetch: typeof fetch = (input, init) => {
  const timeout = AbortSignal.timeout(SERVER_TIMEOUT_MS);
  return fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout });
};
