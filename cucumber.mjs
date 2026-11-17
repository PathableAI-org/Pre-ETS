export default {
  failFast: false,
  format: ["summary", ["json", "reports/cucumber-bdd.json"]],
  import: ["tests/bdd/support/world.ts", "tests/bdd/support/hooks.ts", "tests/bdd/steps/*.ts"],
  // Serial unless BDD_PARALLEL names a worker count; the nightly workflow sets it.
  parallel: Number(process.env.BDD_PARALLEL ?? 0),
  // Workers take scenarios in path order, so the features that wait longest in real time come first and the short
  // ones fill in around them. Later globs repeat these files; Cucumber keeps only the first occurrence.
  paths: [
    "tests/bdd/requirements/warning-policy.feature",
    "tests/bdd/requirements/expiration-protection.feature",
    "tests/bdd/requirements/expiration-warning.feature",
    "tests/bdd/requirements/**/*.feature"
  ],
  strict: true
}
