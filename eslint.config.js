import eslint from "@eslint/js"
import perfectionist from "eslint-plugin-perfectionist"
import { defineConfig, globalIgnores } from "eslint/config"
import globals from "globals"
import tseslint from "typescript-eslint"

import { effectConventions, effectFnRestriction, effectRestrictedSyntax } from "./eslint.effect.js"

/** JavaScript globals that a local binding must not shadow. Effect exports modules with several of these names. */
const shadowedGlobals =
  "/^(Array|BigInt|Boolean|Date|Error|Function|JSON|Map|Math|Number|Object|Promise|RegExp|Request|Response|Set|String|Symbol|URL)$/"

/**
 * Error messages are human-readable text. Branch on a tag, a reason, or another structured field instead.
 * See docs/engineering/effect-guidance.md#errors-and-identifiers.
 */
const messageText = "[property.name='message']"

const restrictedSyntax = [
  {
    message: "Do not branch on error message text; match a `_tag`, a `reason`, or another structured field.",
    selector: [
      `CallExpression[callee.property.name=/^(includes|startsWith|endsWith|match|matchAll|indexOf|search)$/] > MemberExpression.callee > MemberExpression.object${messageText}`,
      `CallExpression[callee.property.name=/^(test|exec)$/] > MemberExpression.arguments${messageText}`,
      `BinaryExpression[operator=/^[!=]==?$/] > MemberExpression${messageText}`,
      `SwitchStatement > MemberExpression.discriminant${messageText}`
    ].join(", ")
  },
  {
    message:
      "Do not shadow a JavaScript global. Alias the import (`import { String as Str } from \"effect\"`) or rename the binding.",
    selector: [
      "ImportSpecifier",
      "ImportDefaultSpecifier",
      "ImportNamespaceSpecifier"
    ].map((node) => `${node} > Identifier.local[name=${shadowedGlobals}]`).concat(
      [
        "VariableDeclarator > Identifier.id",
        "FunctionDeclaration > Identifier.id",
        "ClassDeclaration > Identifier.id"
      ].map((node) => `${node}[name=${shadowedGlobals}]`)
    ).join(", ")
  },
  ...effectRestrictedSyntax
]

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
      ],
      "no-restricted-syntax": ["error", ...restrictedSyntax, effectFnRestriction]
    }
  },
  {
    // Flat config replaces rule options per block, so tests restate the list without the production-only entry.
    files: ["tests/**/*.{ts,tsx}", "**/tests/**/*.{ts,tsx}", "e2e/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": ["error", ...restrictedSyntax]
    }
  },
  ...effectConventions
])
