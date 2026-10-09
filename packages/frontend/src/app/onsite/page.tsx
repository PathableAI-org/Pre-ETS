import { notFound } from "next/navigation"

import { OnsitePrototype } from "./onsite-prototype.tsx"

export const dynamic = "force-dynamic"

export default function OnsitePage() {
  if (process.env.NODE_ENV !== "development" || process.env.PRE_ETS_ONSITE_PROTOTYPE !== "1") {
    notFound()
  }

  return <OnsitePrototype />
}
