import { loadSources } from "@cucumber/cucumber/api"

const invalid = [
  "not (@application or @http or @browser)",
  "(@application and @http)",
  "(@application and @browser)",
  "(@http and @browser)",
  "((@http or @browser) and not (@production or @development))",
  "(@production and @development)",
  "(@application and (@production or @development))"
].map((expression) => `(${expression})`).join(" or ")
export async function validateFeatures(paths = ["features/capabilities/**/*.feature"]) {
  const source = { defaultDialect: "en", names: [], order: "defined", paths, tagExpression: "" }
  const all = await loadSources(source)
  if (all.errors.length) throw new Error(JSON.stringify(all.errors))
  if (!all.plan.length) throw new Error("No capability scenarios discovered")
  const rejected = await loadSources({ ...source, tagExpression: invalid })
  if (rejected.plan.length) {
    throw new Error(
      `Invalid execution/runtime tags: ${
        rejected.plan.map((item) => `${item.uri}:${item.location.line} ${item.name}`).join("; ")
      }`
    )
  }
  return all.plan.length
}
