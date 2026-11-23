import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // When deployed (e.g. Vercel), proxy all API calls to the remote NestJS API
  // so browser requests stay same-origin (cookies + no CORS).
  // Set API_BASE_URL, e.g. https://smm-api.up.railway.app
  ...(process.env.API_BASE_URL
    ? {
        async rewrites() {
          return [
            {
              source: "/api/v1/:path*",
              destination: `${process.env.API_BASE_URL}/api/v1/:path*`,
            },
          ];
        },
      }
    : {}),
};

export default nextConfig;
