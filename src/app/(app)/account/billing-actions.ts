"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { siteOrigin } from "@/lib/site";
import { billingIntervals, getStripe, isBillingEnabled, priceLookupKey, type BillingInterval } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

type Result = { ok: false; error: string };

const ENTITLED = ["active", "trialing", "past_due"];

// The Stripe customer for this user, created (with their user id attached)
// the first time they start a checkout.
async function customerFor(user: { id: string; email?: string }) {
  const stripe = getStripe()!;
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("subscriptions")
    .select("stripe_customer_id, status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (row) return row;

  const customer = await stripe.customers.create({ email: user.email, metadata: { user_id: user.id } });
  const { error } = await admin.from("subscriptions").insert({ user_id: user.id, stripe_customer_id: customer.id });
  if (error) {
    // Two tabs at once: keep the row that won and drop our extra customer.
    await stripe.customers.del(customer.id).catch(() => {});
    const { data: existing } = await admin
      .from("subscriptions")
      .select("stripe_customer_id, status")
      .eq("user_id", user.id)
      .single();
    return existing!;
  }
  return { stripe_customer_id: customer.id, status: null };
}

export async function startCheckout(interval: BillingInterval): Promise<Result | void> {
  const user = await requireUser();
  if (!isBillingEnabled() || !billingIntervals.includes(interval)) return { ok: false, error: "billing.errors.unavailable" };
  const stripe = getStripe()!;

  const customer = await customerFor(user);
  // Already subscribed: changing plan or card happens in the portal.
  if (ENTITLED.includes(customer.status ?? "")) return openPortal();

  const { data: prices } = await stripe.prices.list({ lookup_keys: [priceLookupKey(interval)], active: true });
  if (!prices[0]) return { ok: false, error: "billing.errors.unavailable" };

  const origin = await siteOrigin();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customer.stripe_customer_id,
    client_reference_id: user.id,
    line_items: [{ price: prices[0].id, quantity: 1 }],
    subscription_data: { metadata: { user_id: user.id } },
    automatic_tax: { enabled: true },
    // Stripe Tax needs the customer's address; save what they enter.
    customer_update: { address: "auto", name: "auto" },
    billing_address_collection: "required",
    allow_promotion_codes: true,
    success_url: `${origin}/account?billing=success`,
    cancel_url: `${origin}/account?billing=cancelled`,
  });
  redirect(session.url!);
}

export async function openPortal(): Promise<Result | void> {
  const user = await requireUser();
  if (!isBillingEnabled()) return { ok: false, error: "billing.errors.unavailable" };
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!row) return { ok: false, error: "billing.errors.noSubscription" };

  const session = await getStripe()!.billingPortal.sessions.create({
    customer: row.stripe_customer_id,
    return_url: `${await siteOrigin()}/account`,
  });
  redirect(session.url);
}
