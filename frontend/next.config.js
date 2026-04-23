/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
  async rewrites() {
    const api = process.env.API_URL || "http://localhost:8000";
    return [{ source: "/api/:path*", destination: `${api}/:path*` }];
  },
};
module.exports = nextConfig;
