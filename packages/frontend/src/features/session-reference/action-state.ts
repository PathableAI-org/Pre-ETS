export type ReferenceActionState =
  | { readonly _tag: "Denied"; readonly message: string }
  | { readonly _tag: "Ready" }
  | { readonly _tag: "Succeeded"; readonly message: string }

export const initialReferenceActionState: ReferenceActionState = { _tag: "Ready" }
