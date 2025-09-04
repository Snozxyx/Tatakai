/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  assetPrefix: './',
  experimental: {
    esmExternals: false,
  },
}

module.exports = nextConfig