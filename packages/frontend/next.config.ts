import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  experimental: {
    authInterrupts: true
  },
  headers() {
    return [
      {
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
        source: "/"
      }
    ]
  },
  rewrites() {
    return [{ destination: "/api/tenant-config", source: "/_test/tenant-config" }]
  },
  transpilePackages: ["@pathableai/react"]
}

export default nextConfig
