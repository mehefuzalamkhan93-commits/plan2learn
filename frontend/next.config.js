/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
  images: {
    domains: ['i.ytimg.com', 'img.youtube.com'],
  },
}

module.exports = nextConfig
