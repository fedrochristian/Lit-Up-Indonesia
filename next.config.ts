import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the local preview separate from any existing Cursor dev server.
  distDir: process.env.LITUP_PREVIEW === "1" ? ".next-preview" : ".next",
  devIndicators: false,
};

export default nextConfig;
