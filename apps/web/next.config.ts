import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@cex/db", "@cex/solana"],
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
