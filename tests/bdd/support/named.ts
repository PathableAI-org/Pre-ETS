import assert from "node:assert/strict"

import type { AppWorld } from "./world.ts"

/**
 * One step file's named entries for each scenario, such as its signed-in sessions, kept in a module-level `WeakMap`
 * keyed by the world, so another file reaches them only through the owning file's steps. `missing` words the failure
 * when a step asks for a name no earlier step has added.
 */
export const namedEntries = <A>(missing: (name: string) => string) => {
  const scenarios = new WeakMap<AppWorld, Map<string, A>>()
  const entriesOf = (world: AppWorld): Map<string, A> => {
    const named = scenarios.get(world) ?? new Map<string, A>()
    scenarios.set(world, named)
    return named
  }
  return {
    get: (world: AppWorld, name: string): A => {
      const entry = entriesOf(world).get(name)
      assert.ok(entry, missing(name))
      return entry
    },
    set: (world: AppWorld, name: string, entry: A): void => {
      entriesOf(world).set(name, entry)
    }
  }
}
