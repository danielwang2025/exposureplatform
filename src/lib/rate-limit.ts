import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

// Attempts allowed per window. Generous for real people, tight for scripts.
const rules = {
  signInEmail: { limit: 10, windowSeconds: 15 * 60 },
  signInIp: { limit: 50, windowSeconds: 15 * 60 },
  signUpIp: { limit: 10, windowSeconds: 60 * 60 },
  resetEmail: { limit: 3, windowSeconds: 60 * 60 },
  resetIp: { limit: 10, windowSeconds: 60 * 60 },
  invite: { limit: 30, windowSeconds: 24 * 60 * 60 },
  comment: { limit: 30, windowSeconds: 10 * 60 },
  deleteAccount: { limit: 5, windowSeconds: 60 * 60 },
} as const;

export type RateLimitRule = keyof typeof rules;

// The visitor's IP as reported by the hosting proxy (Vercel overwrites
// x-forwarded-for, so it can't be spoofed there).
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

// Records an attempt; false once the limit for this rule + identifier is hit.
// Fails open: a database hiccup must not lock everyone out of signing in.
export async function allowAttempt(rule: RateLimitRule, identifier: string): Promise<boolean> {
  const { limit, windowSeconds } = rules[rule];
  // Only a hash is stored, never the raw email/IP/user id.
  const key = createHash("sha256").update(`${rule}:${identifier.trim().toLowerCase()}`).digest("hex");
  try {
    const { data, error } = await createAdminClient().rpc("rate_limit_hit", {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) throw error;
    return data;
  } catch (error) {
    console.error("rate limit check failed; allowing the attempt", error);
    return true;
  }
}

// All rules must pass. Every rule records the attempt, even after one fails.
export async function allowAttempts(checks: [RateLimitRule, string][]): Promise<boolean> {
  const results = await Promise.all(checks.map(([rule, id]) => allowAttempt(rule, id)));
  return results.every(Boolean);
}
