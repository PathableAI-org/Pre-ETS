import { startBrowserTracing } from "./shared/browser-tracing.ts"

// Next runs this file after the document loads and before hydration. With no rendered configuration it does nothing.
startBrowserTracing()

// Next calls this at the start of each App Router navigation; it records `Router.transition` only while tracing runs.
export { onRouterTransitionStart } from "./shared/browser-tracing.ts"
