import type { NextConfig } from 'next';

// Dev-only: proxy /api → Nest (prod: edge nginx; static export has no rewrites).
const apiUpstream = process.env.API_UPSTREAM ?? 'http://localhost:3001';

const nextConfig: NextConfig = {
  // Static HTML/JS/CSS for nginx (no Node web process in Docker).
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
};

// Rewrites are unsupported with `output: 'export'` at build time; keep for `next dev` only.
if (process.env.NODE_ENV !== 'production') {
  nextConfig.rewrites = async () => [
    {
      source: '/api/:path*',
      destination: `${apiUpstream}/api/:path*`,
    },
  ];
}

export default nextConfig;
