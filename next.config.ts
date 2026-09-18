import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  basePath: "/subscription-guardian",
  images: {
    unoptimized: true,
  },
  async redirects() {
    return [
      {
        source: "/",
        destination: "/subscription-guardian",
        basePath: false,
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
