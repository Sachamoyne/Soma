import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },

  // Mark pdf-parse and pdfjs-dist as external packages to avoid webpack bundling issues
  // This ensures these packages are not bundled by webpack and are loaded at runtime
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],

  webpack: (config, { isServer }) => {
    // Disable canvas for both client and server (not available in serverless)
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
    };

    // For server-side, ensure native modules are not bundled
    if (isServer) {
      config.externals = [...(config.externals || []), "pdf-parse"];
    }

    return config;
  },
};


export default nextConfig;

