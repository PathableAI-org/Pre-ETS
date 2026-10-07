import eslint from "@eslint/js"
import perfectionist from "eslint-plugin-perfectionist"
import { defineConfig, globalIgnores } from "eslint/config"
import globals from "globals"
import tseslint from "typescript-eslint"

export default defineConfig([
  globalIgnores([
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/coverage/**",
    "**/.next/**",
    "**/.vitest/**",
    "**/reports/**"
  ]),
  {
    extends: [eslint.configs.recommended, perfectionist.configs["recommended-natural"]],
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    languageOptions: { globals: globals.node },
    rules: {
      "no-console": "error"
    }
  },
  {
    files: [
      "cucumber.mjs",
      "eslint.config.js",
      "lint-staged.config.js",
      "packages/*/eslint.config.js",
      "packages/*/lint-staged.config.js",
      "scripts/**",
      "tests/**",
      "e2e/**",
      "packages/*/tests/**"
    ],
    rules: {
      "no-console": "off"
    }
  },
  {
    extends: [
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked
    ],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: { projectService: true }
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { fixStyle: "inline-type-imports", prefer: "type-imports" }
      ],
      "@typescript-eslint/no-import-type-side-effects": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }
      ]
    }
  }
])
