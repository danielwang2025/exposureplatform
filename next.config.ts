import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Locale lives in a cookie, not the URL, so share links stay identical across languages.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Pages reachable without an account: never leak the token via Referer and
// keep them out of search engines even if a link gets posted somewhere.
const sharedPageHeaders = [
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
];

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/s/:path*", headers: sharedPageHeaders },
      { source: "/c/:path*", headers: sharedPageHeaders },
      { source: "/invite/:path*", headers: sharedPageHeaders },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withNextIntl(nextConfig);
