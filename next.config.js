/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: { bodySizeLimit: "5mb" },
  },
  async redirects() {
    return [
      {
        source: "/",
        destination: "/mianba",
        permanent: false,
      },
    ];
  },
};

module.exports = nextConfig;
