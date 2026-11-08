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
    // Decode once, pass values: startup parses StartupConfig and hands plain settings to layer factories.
    // See docs/engineering/effect-guidance.md#configuration-is-decoded-once-at-startup.
    files: ["src/**/*.ts"],
    ignores: ["src/config/**", "src/runtime.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [{
          importNames: ["Config", "ConfigProvider"],
          message:
            "Only src/config and src/runtime.ts read configuration. Take the decoded settings as a layer factory argument.",
          name: "effect"
        }],
        patterns: [{
          message:
            "Only src/config and src/runtime.ts read configuration. Take the decoded settings as a layer factory argument.",
          regex: "^effect/(Config|ConfigProvider)$"
        }]
      }]
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
