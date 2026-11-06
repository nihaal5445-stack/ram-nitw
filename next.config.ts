import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "*.trycloudflare.com"],
  // Two-device demo only (NEXT_PUBLIC_SUPABASE_PROXY=1): a phone behind an HTTPS tunnel reaches Supabase through us.
  async rewrites() {
    if (process.env.NEXT_PUBLIC_SUPABASE_PROXY !== "1") return [];
    return [{ source: "/sb/:path*", destination: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/:path*` }];
  },
  experimental: {
    agentUpgrade: "security",
  },
  /* config options here */
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
