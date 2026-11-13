import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Data here is per-user and DB-backed, so we use classic dynamic rendering rather than Cache Components.
  serverExternalPackages: ["postgres"],
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
