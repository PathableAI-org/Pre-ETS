import requirements from "./cucumber.mjs"

export default {
  ...requirements,
  format: ["summary"],
  paths: ["tests/bdd/smoke/**/*.feature"]
}
