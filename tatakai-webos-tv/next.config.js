/** @type {import('next').NextConfig} */
const nextConfig = {
  // Remove output: 'export' for dynamic routes to work
  // output: 'export',
  trailingSlash: true,
  skipTrailingSlashRedirect: true,
  distDir: 'dist',
  images: {
    unoptimized: true
  },
  // webOS specific optimizations
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production'
  },
  // Ensure compatibility with webOS runtime
  webpack: (config, { dev, isServer }) => {
    // Optimize for TV hardware
    if (!dev && !isServer) {
      config.optimization.splitChunks = {
        chunks: 'all',
        cacheGroups: {
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            chunks: 'all',
          },
        },
      }
    }
    return config
  }
}

module.exports = nextConfig