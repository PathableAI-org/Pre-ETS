import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  oxc: {
    jsx: { runtime: "automatic" }
  },
  resolve: {
    alias: {
      "next/headers": fileURLToPath(new URL("./tests/unit/next-headers-stub.ts", import.meta.url)),
      "next/navigation": fileURLToPath(new URL("./tests/unit/next-navigation-stub.ts", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/unit/server-only-stub.ts", import.meta.url))
    }
  },
  test: {
    environment: "node",
    exclude: ["tests/integration/**"],
    globals: false,
    include: ["tests/**/*.test.ts"],
    server: { deps: { inline: ["@pathableai/react", "@pathableai/styles"] } }
  }
})
