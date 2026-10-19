import "server-only";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";

// Payments are optional: without Stripe keys the app works and simply doesn't
// offer Plus (like video without Mux).
let client: Stripe | null | undefined;

export function getStripe(): Stripe | null {
  if (client !== undefined) return client;
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  // Real money only from production builds: a live key pasted into a dev
  // .env.local is ignored rather than used.
  if (key && /^(sk|rk)_live_/.test(key) && process.env.NODE_ENV !== "production") {
    console.error("Ignoring a live Stripe key outside production. Use a sk_test_ key for development.");
    client = null;
    return client;
  }
  client = key ? new Stripe(key) : null;
  return client;
}

export function isBillingEnabled() {
  return getStripe() !== null && Boolean(process.env.STRIPE_WEBHOOK_SECRET);
}

export const billingIntervals = ["month", "quarter", "half_year", "year"] as const;
export type BillingInterval = (typeof billingIntervals)[number];

// Prices are found by lookup key, so ids don't need to be configured
// (created by scripts/stripe-setup.mjs).
export const priceLookupKey = (interval: BillingInterval) => `sprout_plus_${interval}`;

export const PLUS_QUOTA_BYTES = 100 * 1024 ** 3;
export const FREE_QUOTA_BYTES = 2 * 1024 ** 3;

export function intervalOf(price: Stripe.Price): BillingInterval | null {
  const r = price.recurring;
  if (!r) return null;
  if (r.interval === "year" && r.interval_count === 1) return "year";
  if (r.interval !== "month") return null;
  return ({ 1: "month", 3: "quarter", 6: "half_year" } as const)[r.interval_count as 1 | 3 | 6] ?? null;
}

export type PlanPrice = { interval: BillingInterval; amount: number; currency: string };

// Display prices, cached for the life of the server instance.
let pricesCache: { at: number; prices: PlanPrice[] } | undefined;
export async function listPlusPrices(): Promise<PlanPrice[]> {
  const stripe = getStripe();
  if (!stripe) return [];
  if (pricesCache && Date.now() - pricesCache.at < 10 * 60_000) return pricesCache.prices;
  const { data } = await stripe.prices.list({ lookup_keys: billingIntervals.map(priceLookupKey), active: true });
  const prices = billingIntervals.flatMap((interval) => {
    const p = data.find((d) => d.lookup_key === priceLookupKey(interval));
    return p?.unit_amount != null ? [{ interval, amount: p.unit_amount, currency: p.currency }] : [];
  });
  pricesCache = { at: Date.now(), prices };
  return prices;
}

// Ends a user's subscription right away (account deletion). Throws if they
// have one that can't be cancelled, so the account isn't deleted while the
// card keeps being charged.
export async function cancelBilling(userId: string) {
  const { data: row } = await createAdminClient()
    .from("subscriptions")
    .select("stripe_subscription_id, status")
    .eq("user_id", userId)
    .maybeSingle();
  if (!row?.stripe_subscription_id || ["canceled", "incomplete_expired"].includes(row.status ?? "")) return;
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe is not configured but the user has a subscription");
  await stripe.subscriptions.cancel(row.stripe_subscription_id);
}
