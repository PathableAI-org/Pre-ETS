import { defineConfig } from "eslint/config"

import rootConfig from "../../eslint.config.js"

const configMessage =
  "Only src/config and src/runtime.ts read configuration. Take the decoded settings as a layer factory argument."

/**
 * Decode once, pass values: startup parses StartupConfig and hands plain settings to layer factories.
 * See docs/engineering/effect-guidance.md#configuration-is-decoded-once-at-startup.
 */
const configReads = {
  paths: [{ importNames: ["Config", "ConfigProvider"], message: configMessage, name: "effect" }],
  patterns: [{ message: configMessage, regex: "^effect/(Config|ConfigProvider)$" }]
}

/** Only the Next host adapters (src/next.ts and src/next/) import the Next.js runtime modules. */
const nextHost = {
  paths: ["next/server", "next/navigation"].map((name) => ({
    message: "Next.js imports belong in src/next.ts or src/next/. Keep services framework-free.",
    name
  }))
}

const configAndRuntime = ["src/config.ts", "src/config/**", "src/runtime.ts"]
const nextAdapters = ["src/next.ts", "src/next/**"]

export default defineConfig([
  ...rootConfig,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: { tsconfigRootDir: import.meta.dirname }
    }
  },
  {
    files: ["src/**/*.ts"],
    ignores: [...configAndRuntime, ...nextAdapters],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [...configReads.paths, ...nextHost.paths],
        patterns: configReads.patterns
      }]
    }
  },
  { files: configAndRuntime, rules: { "no-restricted-imports": ["error", nextHost] } },
  { files: nextAdapters, rules: { "no-restricted-imports": ["error", configReads] } },
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
