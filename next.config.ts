import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/subscription-guardian",
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
