import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Data here is per-user and DB-backed, so we use classic dynamic rendering rather than Cache Components.
  serverExternalPackages: ["postgres"],
  // The public news pages moved from /radar to /news when the product was renamed Radar.
  redirects() {
    return [
      { source: "/radar", destination: "/news", permanent: true },
      { source: "/radar/:path*", destination: "/news/:path*", permanent: true },
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

export default nextConfig;
