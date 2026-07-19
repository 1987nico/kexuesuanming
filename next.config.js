/** @type {import('next').NextConfig} */
if (process.env.GROWTH_PREVIEW_MODE === "fixture" && process.env.NODE_ENV === "production") {
  throw new Error("GROWTH_PREVIEW_MODE=fixture 仅允许本地开发，生产构建与启动已拒绝。");
}

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
