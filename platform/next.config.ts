import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@modularmind/ui"],
  turbopack: {
    root: "..",
  },
};

export default nextConfig;
