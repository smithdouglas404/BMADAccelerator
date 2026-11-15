import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Agent SDK runs Claude Code as a child process; keep it out of the bundle.
  serverExternalPackages: ["@anthropic-ai/claude-agent-sdk", "playwright", "playwright-core"],
};

export default nextConfig;
