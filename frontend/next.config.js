/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
  async redirects() {
    // Canonicalise on prodlyft.com — any request that arrives on the
    // *.vercel.app preview URL gets 308'd to the same path on the apex
    // domain. Helps SEO (one canonical host) and avoids OAuth/cookie
    // weirdness when callers bookmark the Vercel-assigned URL.
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "prodlyft.vercel.app" }],
        destination: "https://prodlyft.com/:path*",
        permanent: true,
      },
    ];
  },
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
