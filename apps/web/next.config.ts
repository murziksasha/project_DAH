import type { NextConfig } from 'next';

const apiUpstream = process.env.API_UPSTREAM ?? 'http://localhost:3001';

const nextConfig: NextConfig = {
  output: 'standalone',
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiUpstream}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;