/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
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
}

export default nextConfig
