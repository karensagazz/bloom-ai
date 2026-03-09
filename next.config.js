/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  // Ensure server-only packages aren't bundled for client
  experimental: {
    serverComponentsExternalPackages: ['googleapis', '@slack/web-api'],
  },
  // Production optimizations for Vercel
  output: 'standalone',
  poweredByHeader: false,
  compress: true,
  swcMinify: true,
}

module.exports = nextConfig
