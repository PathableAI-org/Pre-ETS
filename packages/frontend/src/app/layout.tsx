import type { Metadata } from "next"
import type { ReactNode } from "react"

import { RestoredPageGuard } from "../features/history-protection.ts"

export const metadata: Metadata = {
  description: "Pre-ETS operations workspace",
  title: "Pre-ETS"
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <RestoredPageGuard />
        {children}
      </body>
    </html>
  )
}
