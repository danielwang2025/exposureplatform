import type { NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe, intervalOf } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

// Stripe → us: subscription lifecycle. Every event is signature-checked with
// STRIPE_WEBHOOK_SECRET before anything is trusted. Plus is granted only here.
export async function POST(request: NextRequest) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return new Response("Billing not configured", { status: 503 });

  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, request.headers.get("stripe-signature") ?? "", secret);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.mode !== "subscription" || typeof session.subscription !== "string") break;
      // The session only has the id; fetch the subscription it created.
      const subscription = await stripe.subscriptions.retrieve(session.subscription);
      await syncSubscription(subscription, event.created, session.client_reference_id);
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.paused":
    case "customer.subscription.resumed":
      await syncSubscription(event.data.object, event.created);
      break;
  }

  return new Response("ok");
}

const ENTITLED = ["active", "trialing", "past_due"];

async function syncSubscription(sub: Stripe.Subscription, eventCreated: number, userIdHint?: string | null) {
  const admin = createAdminClient();
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const eventAt = new Date(eventCreated * 1000).toISOString();

  const { data: row } = await admin
    .from("subscriptions")
    .select("user_id, stripe_subscription_id, status, last_event_at")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  // Customers are created by our checkout action with the user's id attached.
  const userId = row?.user_id ?? sub.metadata?.user_id ?? userIdHint;
  if (!userId) {
    console.error("stripe webhook: no user for customer", customerId);
    return;
  }

  if (row) {
    // Out-of-order delivery: an older event never overwrites a newer one.
    if (row.last_event_at && row.last_event_at > eventAt && row.stripe_subscription_id === sub.id) return;
    // A different, ended subscription must not cancel the one that's active.
    if (
      row.stripe_subscription_id &&
      row.stripe_subscription_id !== sub.id &&
      ENTITLED.includes(row.status ?? "") &&
      !ENTITLED.includes(sub.status)
    ) {
      return;
    }
  }

  const item = sub.items.data[0];
  // Cancelling in the Customer Portal sets cancel_at (a date) rather than
  // cancel_at_period_end; either way Plus ends then instead of renewing.
  const endsAt: number | null = sub.cancel_at || (sub.cancel_at_period_end && item ? item.current_period_end : null) || null;
  const periodEnd = endsAt ?? item?.current_period_end ?? null;
  const { error } = await admin.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      status: sub.status,
      billing_interval: item ? intervalOf(item.price) : null,
      // When Plus renews, or (if cancelled) when it ends.
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancel_at_period_end: endsAt !== null,
      last_event_at: eventAt,
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;

  const { error: planError } = await admin.rpc("apply_plan", { p_user_id: userId });
  if (planError) throw planError;
}
