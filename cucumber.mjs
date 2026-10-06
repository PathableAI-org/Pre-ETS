export default {
  default: {
    failFast: false,
    format: ["summary", ["json", "reports/cucumber-bdd.json"]],
    import: ["tests/bdd/support/world.ts", "tests/bdd/support/hooks.ts", "tests/bdd/steps/*.ts"],
    parallel: 0,
    paths: ["tests/bdd/requirements/**/*.feature"],
    strict: true
  }
}
