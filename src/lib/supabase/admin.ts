import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { serverFetch, supabaseUrl } from "./env";

// Service-role client: bypasses RLS. Only use after an explicit permission
// check with the user's client, or for trusted server events (webhooks).
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("Missing environment variable SUPABASE_SECRET_KEY");
  return createClient<Database>(supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: serverFetch },
  });
}
