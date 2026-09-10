import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@cex/app-contracts",
    "@cex/db",
    "@cex/exchange-types",
  ],
  turbopack: {},
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
};

export default nextConfig;
