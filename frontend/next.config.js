/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
  async rewrites() {
    const api = process.env.API_URL || "http://localhost:8000";
    // `fallback` runs only after Next.js has checked filesystem routes AND
    // dynamic routes — so /api/auth/[...nextauth], /api/auth/signup and
    // /api/debug/db stay on Next, and everything else (/api/crawl etc.)
    // proxies to the FastAPI backend.
    return {
      fallback: [{ source: "/api/:path*", destination: `${api}/:path*` }],
    };
  },
};
module.exports = nextConfig;
