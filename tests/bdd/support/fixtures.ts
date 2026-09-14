export function invalidEnvShape(invalidName: string): unknown {
  switch (invalidName) {
    case "an empty Display Name": {
      return { config: { displayName: "" }, slug: "springfield" }
    }
    case "a numeric Display Name of 42": {
      return { config: { displayName: 42 }, slug: "springfield" }
    }
    case "a whitespace-only Display Name": {
      return { config: { displayName: "   " }, slug: "springfield" }
    }
    case "no Display Name field": {
      return { config: {}, slug: "springfield" }
    }
    default: {
      throw new Error(`Unknown invalid Display Name case: ${invalidName}`)
    }
  }
}
