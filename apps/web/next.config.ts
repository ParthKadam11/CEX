import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@cex/app-contracts",
    "@cex/db",
    "@cex/exchange-types",
    "@cex/solana",
    "@solana/wallet-adapter-base",
    "@solana/wallet-adapter-react",
    "@solana/wallet-adapter-react-ui",
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
