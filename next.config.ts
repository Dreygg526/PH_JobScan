import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Scan API routes call Firecrawl + Claude and can run for a while.
  // On Vercel Pro/Fluid this raises the per-request ceiling; each stage
  // is still kept short by the client-orchestrated pipeline.
  serverExternalPackages: ["@anthropic-ai/sdk"],
};

export default nextConfig;
