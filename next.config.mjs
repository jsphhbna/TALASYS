/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // Enforce strict type checking during builds
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
  async redirects() {
    return [
      { source: '/login', destination: '/auth/login', permanent: true },
      { source: '/register', destination: '/auth/register', permanent: true },
      { source: '/dashboard', destination: '/resident/dashboard', permanent: true },
      { source: '/profile', destination: '/resident/profile', permanent: true },
      { source: '/history', destination: '/resident/history', permanent: true },
      { source: '/notifications', destination: '/resident/notifications', permanent: true },
      { source: '/request', destination: '/resident/request', permanent: true },
    ]
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()'
          }
        ],
      },
    ]
  },
}

export default nextConfig
