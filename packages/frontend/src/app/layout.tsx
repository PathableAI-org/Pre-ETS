import type { Metadata } from "next"
import type { ReactNode } from "react"

export const metadata: Metadata = {
  description: "Pre-ETS operations workspace",
  title: "Pre-ETS"
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
