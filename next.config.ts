import type { NextConfig } from "next";

// Recordings and pictures come from the media CDN when MEDIA_BASE_URL is set (the deployed
// sites); locally they are served from public/. next/image only loads hosts listed here.
const media = process.env.MEDIA_BASE_URL ? new URL(process.env.MEDIA_BASE_URL) : null;

const nextConfig: NextConfig = {
  cacheComponents: true,
  images: media
    ? {
        remotePatterns: [
          {
            protocol: media.protocol === "http:" ? "http" : "https",
            hostname: media.hostname,
            pathname: `${media.pathname.replace(/\/$/, "")}/**`,
          },
        ],
      }
    : undefined,
  partialPrefetching: true,
  poweredByHeader: false,
  // Sign-in trusts one origin (BETTER_AUTH_URL), so www sends people to the bare domain.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.lengualearn.com" }],
        destination: "https://lengualearn.com/:path*",
        permanent: true,
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
