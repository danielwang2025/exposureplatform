// Creates the Sprout Plus product and its four prices in Stripe. Safe to run
// again: prices are found by lookup key and only missing ones are created.
//
//   STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-setup.mjs
//
// Run it with the test key first, then with the live key before launch.
// To change a price later, create a new one in Stripe and move the lookup key
// to it ("transfer lookup key"); existing subscribers keep their price.
import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY?.trim();
if (!key) {
  console.error("Set STRIPE_SECRET_KEY");
  process.exit(1);
}
const live = /^(sk|rk)_live_/.test(key);
if (live && !process.argv.includes("--live")) {
  console.error("This is a LIVE key. Run with --live if you really mean to create live prices.");
  process.exit(1);
}
console.log(`Stripe ${live ? "LIVE" : "test"} mode`);
const stripe = new Stripe(key);

// US cents. Monthly $5.99; 3 months 10% off, 6 months 20% off, a year 40% off.
const prices = [
  { lookup_key: "sprout_plus_month", unit_amount: 599, recurring: { interval: "month", interval_count: 1 } },
  { lookup_key: "sprout_plus_quarter", unit_amount: 1599, recurring: { interval: "month", interval_count: 3 } },
  { lookup_key: "sprout_plus_half_year", unit_amount: 2849, recurring: { interval: "month", interval_count: 6 } },
  { lookup_key: "sprout_plus_year", unit_amount: 4299, recurring: { interval: "year", interval_count: 1 } },
];

const existing = await stripe.prices.list({ lookup_keys: prices.map((p) => p.lookup_key), expand: ["data.product"] });
let productId = existing.data[0] && (typeof existing.data[0].product === "string" ? existing.data[0].product : existing.data[0].product.id);
if (!productId) {
  const product = await stripe.products.create({
    name: "Sprout Plus",
    description: "100 GB for photos and videos, video uploads and AI showcase pages.",
    // Stripe Tax: software as a service for personal use.
    tax_code: "txcd_10103000",
  });
  productId = product.id;
  console.log("created product", productId);
}

for (const price of prices) {
  const found = existing.data.find((p) => p.lookup_key === price.lookup_key);
  if (found) {
    console.log("exists ", price.lookup_key, found.id, found.unit_amount);
    continue;
  }
  const created = await stripe.prices.create({
    ...price,
    product: productId,
    currency: "usd",
    // Tax is added on top at checkout.
    tax_behavior: "exclusive",
  });
  console.log("created", price.lookup_key, created.id, created.unit_amount);
}
