import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Note: do NOT set `output: "standalone"` — that's for self-hosted Docker/Node
  // deployments and breaks Vercel's build pipeline.
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
