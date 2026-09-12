export default {
  "!(pnpm-lock).{json,jsonc,md,yaml,yml}": "dprint fmt",
  "*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}": [
    "eslint --fix --max-warnings=0",
    "dprint fmt"
  ]
}
