import { hasSession } from "@pathableai/pre-ets-frontend-services"
import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

export default async function HomePage() {
  const present = await hasSession()

  if (!present) redirect("/auth/login")

  // Presence cannot authorize protected rendering until stored sessions and
  // independent request-tenant binding are implemented.
  redirect("/login-unavailable")
}
