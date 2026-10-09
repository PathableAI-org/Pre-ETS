export default {
  "!(pnpm-lock).{json,jsonc,md,yaml,yml}": "dprint fmt",
  "*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}": [
    "eslint --fix --max-warnings=0",
    "dprint fmt"
  ],
  "tests/bdd/requirements/**/*.feature": [
    "gherkin-lint --config gherkin-lint.json",
    "prettier --no-config --no-editorconfig --plugin prettier-plugin-gherkin --tab-width 2 --end-of-line lf --print-width 120 --write"
  ]
}
