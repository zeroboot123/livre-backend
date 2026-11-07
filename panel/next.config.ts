/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  basePath: '/admin',
  assetPrefix: '/admin',
  trailingSlash: false,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
