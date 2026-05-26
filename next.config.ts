import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['playwright', 'playwright-core'],
  outputFileTracingIncludes: {
    '/api/**/*': ['node_modules/playwright-core/browsers.json'],
  },
};

export default nextConfig;
