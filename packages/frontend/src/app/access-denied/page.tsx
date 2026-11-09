import { forbidden } from "next/navigation"

export const dynamic = "force-dynamic"

/** The proxy's rewrite target for a tenant mismatch on a document; renders the forbidden presentation with 403. */
export default function AccessDeniedPage(): never {
  forbidden()
}
