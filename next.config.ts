import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [{ protocol: "https", hostname: "afcgrocery.com" }],
  },
};

export default nextConfig;
