import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const API_BACKEND = isProd
  ? "https://handy-production-8390.up.railway.app"
  : "http://localhost:3000";

const nextConfig: NextConfig = {
  // API proxy — routes /api/* to backend (local in dev, Railway in prod)
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_BACKEND}/api/:path*`,
      },
    ];
  },

  // PWA headers
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },

  // Allow external images (dicebear avatars)
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "api.dicebear.com",
      },
    ],
  },
};

export default nextConfig;
