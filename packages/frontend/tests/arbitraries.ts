import { Arbitrary, Schema } from "effect"

import { TenantAlias } from "../src/lib/tenant/index.ts"

// Configured tenant file names, not free-form external input.
export const TenantAliasArb = Arbitrary.schema(Schema.Literals([
  "north-school",
  "shelbyville",
  "springfield"
])).pipe(Arbitrary.map(Schema.decodeSync(TenantAlias)))

const booleanArb = Arbitrary.schema(Schema.Boolean)

/** One case choice per character. `true` uppercases that character and shrinks back to `false`. */
export const MixedCase = <A extends string>(characters: Arbitrary.Arbitrary<A>): Arbitrary.Arbitrary<string> =>
  characters.pipe(
    Arbitrary.flatMap((value) =>
      Arbitrary.array(booleanArb, { maxLength: value.length, minLength: value.length }).pipe(
        Arbitrary.map((flags) => {
          let mixed = ""
          for (let index = 0; index < value.length; index++) {
            const character = value.charAt(index)
            mixed += flags[index] ? character.toUpperCase() : character
          }
          return mixed
        })
      )
    )
  )
