"use client"

import { createContext, type ReactNode, useContext } from "react"

export interface IdleConfirmHarnessSnapshot {
  readonly lastOutcomeLabel: string
  readonly nextTimerFireAtMs: null | number
  readonly runConfirmNow: () => void
}

const IdleConfirmHarnessContext = createContext<IdleConfirmHarnessSnapshot | null>(
  null
)

export function IdleConfirmHarnessProvider({
  children,
  value
}: {
  readonly children: ReactNode
  readonly value: IdleConfirmHarnessSnapshot
}) {
  return (
    <IdleConfirmHarnessContext.Provider value={value}>
      {children}
    </IdleConfirmHarnessContext.Provider>
  )
}

export function useIdleConfirmHarness(): IdleConfirmHarnessSnapshot | null {
  return useContext(IdleConfirmHarnessContext)
}
