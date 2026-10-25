import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "next/navigation": fileURLToPath(new URL("./tests/unit/next-navigation-stub.ts", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/unit/server-only-stub.ts", import.meta.url))
    }
  },
  test: {
    environment: "node",
    globals: false,
    include: ["tests/integration/**/*.test.ts"]
  }
})
