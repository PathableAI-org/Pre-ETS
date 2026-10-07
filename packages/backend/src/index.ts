import { Console, Effect } from "effect"

Console.log("Hello from backend").pipe(
  Effect.runSync
)
