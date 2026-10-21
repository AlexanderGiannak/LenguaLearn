import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
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
