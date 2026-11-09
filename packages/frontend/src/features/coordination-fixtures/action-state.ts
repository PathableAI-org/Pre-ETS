export type FixtureActionState =
  | { readonly _tag: "Denied"; readonly message: string }
  | { readonly _tag: "Ready" }
  | { readonly _tag: "Recorded"; readonly message: string }

export const initialFixtureActionState: FixtureActionState = { _tag: "Ready" }
