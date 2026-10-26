const stub = new URL("./fixture-stubs.ts", import.meta.url)

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "next/navigation" || specifier === "next/server" || specifier === "server-only") {
    return { shortCircuit: true, url: stub.href }
  }
  return nextResolve(specifier, context)
}
