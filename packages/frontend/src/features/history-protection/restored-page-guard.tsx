"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

/**
 * Makes history traversal reach the server: a page restored from the back-forward cache reloads, and a `popstate`
 * refreshes the route, so the protection gate decides again. Renders nothing and reads no session state.
 */
export function RestoredPageGuard(): null {
  const router = useRouter()
  useEffect(() => {
    const reloadRestoredPage = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload()
    }
    const refreshAfterTraversal = () => {
      router.refresh()
    }
    window.addEventListener("pageshow", reloadRestoredPage)
    window.addEventListener("popstate", refreshAfterTraversal)
    return () => {
      window.removeEventListener("pageshow", reloadRestoredPage)
      window.removeEventListener("popstate", refreshAfterTraversal)
    }
  }, [router])
  return null
}
