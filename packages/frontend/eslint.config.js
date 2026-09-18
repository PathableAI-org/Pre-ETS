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
  {
    files: ["src/lib/oidc/insecure-loopback-discovery.ts"],
    rules: {
      "@typescript-eslint/no-deprecated": "off"
    }
  },
  reactHooks.configs.flat.recommended,
  nextPlugin.configs.recommended
])
