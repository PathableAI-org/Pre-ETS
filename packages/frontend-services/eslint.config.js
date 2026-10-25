import { defineConfig } from "eslint/config"

import rootConfig from "../../eslint.config.js"

export default defineConfig([
  ...rootConfig,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: { tsconfigRootDir: import.meta.dirname }
    }
  },
  {
    files: ["src/authentication/provider.ts"],
    rules: {
      // Maintainer-approved local HTTP opt-in; the adapter still enforces loopback-only URLs.
      "@typescript-eslint/no-deprecated": ["error", {
        allow: [{ from: "package", name: "allowInsecureRequests", package: "openid-client" }]
      }]
    }
  }
])
