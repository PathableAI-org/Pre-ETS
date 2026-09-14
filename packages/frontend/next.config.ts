import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  headers() {
    return [
      {
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
        source: "/"
      }
    ]
  },
  transpilePackages: ["@pathableai/react"]
}

export default nextConfig
