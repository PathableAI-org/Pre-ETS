import nextPlugin from "@next/eslint-plugin-next"
import reactHooks from "eslint-plugin-react-hooks"
import { defineConfig } from "eslint/config"
import globals from "globals"

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
    files: ["**/*.tsx"],
    languageOptions: {
      globals: globals.browser
    }
  },
  reactHooks.configs.flat.recommended,
  nextPlugin.configs.recommended,
  {
    files: ["src/lib/authentication/provider.ts"],
    rules: {
      // Maintainer-approved local HTTP opt-in; the adapter still enforces loopback-only URLs.
      "@typescript-eslint/no-deprecated": ["error", {
        allow: [{ from: "package", name: "allowInsecureRequests", package: "openid-client" }]
      }]
    }
  }
])
