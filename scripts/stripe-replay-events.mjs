// Local development without the Stripe CLI: Stripe can't reach localhost, so
// this fetches recent subscription events from your test-mode account and
// delivers them to the local webhook, signed with STRIPE_WEBHOOK_SECRET from
// .env.local (the same thing `stripe listen --forward-to` does).
//
//   set -a; source .env.local; set +a
//   node scripts/stripe-replay-events.mjs            # once, after a checkout or portal change
//   node scripts/stripe-replay-events.mjs --watch    # keep delivering every 5 s
//
// Events already delivered are remembered in .stripe-events-delivered.json.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
if (!/^(sk|rk)_test_/.test(key)) {
  console.error("Test-mode keys only (sk_test_…).");
  process.exit(1);
}
if (!secret) {
  console.error("Set STRIPE_WEBHOOK_SECRET.");
  process.exit(1);
}

const stripe = new Stripe(key);
const url = process.env.WEBHOOK_URL ?? "http://localhost:3000/api/webhooks/stripe";
const stateFile = new URL("../.stripe-events-delivered.json", import.meta.url);
const delivered = new Set(existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, "utf8")) : []);
const types = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
];

async function deliver() {
  const events = [];
  const since = Math.floor(Date.now() / 1000) - 24 * 3600;
  for await (const event of stripe.events.list({ created: { gte: since }, types, limit: 100 })) events.push(event);
  events.sort((a, b) => a.created - b.created);
  for (const event of events) {
    if (delivered.has(event.id)) continue;
    const payload = JSON.stringify(event);
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
    const res = await fetch(url, {
      method: "POST",
      headers: { "stripe-signature": header, "content-type": "application/json" },
      body: payload,
    });
    console.log(new Date(event.created * 1000).toISOString(), event.type, "→", res.status);
    if (res.ok) delivered.add(event.id);
  }
  writeFileSync(stateFile, JSON.stringify([...delivered]));
}

await deliver();
if (process.argv.includes("--watch")) setInterval(() => deliver().catch((e) => console.error(e.message)), 5000);
