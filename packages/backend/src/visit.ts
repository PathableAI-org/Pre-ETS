import { CreateOnSiteVisit } from "@pathableai/pre-ets-domain"
import { Config, Context, DateTime, Effect, Layer, Redacted, Schema } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { Client } from "pg"

const synthetic = Schema.isStartingWith("synthetic-")
const DevCreateOnSiteVisit = CreateOnSiteVisit.mapFields((fields) => ({
  ...fields,
  coachId: fields.coachId.check(synthetic),
  participantRef: fields.participantRef.check(synthetic),
  tenantId: fields.tenantId.check(synthetic)
}))

export class VisitSaveError extends Schema.TaggedError<VisitSaveError>()("VisitSaveError", {}) {}

export class VisitStore extends Context.Service<VisitStore, {
  insert(input: typeof CreateOnSiteVisit.Type): Effect.Effect<string, VisitSaveError>
}>()("@pathableai/pre-ets-backend/VisitStore") {}

export const VisitStoreLive = Layer.effect(
  VisitStore,
  Effect.gen(function*() {
    const databaseUrl = yield* Config.Redacted("BACKEND_DATABASE_URL")
    const localUrl = yield* Effect.try({
      catch: () => new Error("BACKEND_DATABASE_URL must name a local PostgreSQL server"),
      try: () => new URL(Redacted.value(databaseUrl))
    })
    if (
      !["postgres:", "postgresql:"].includes(localUrl.protocol)
      || !["127.0.0.1", "localhost"].includes(localUrl.hostname)
      || localUrl.searchParams.has("host")
    ) {
      return yield* Effect.fail(new Error("BACKEND_DATABASE_URL must name a local PostgreSQL server"))
    }

    return VisitStore.of({
      insert: Effect.fn("VisitStore.insert")(function*(visit: typeof CreateOnSiteVisit.Type) {
        const client = new Client({ connectionString: Redacted.value(databaseUrl) })
        client.on("error", () => {
          process.stderr.write("Local on-site visit database connection failed\n")
        })
        const result = yield* Effect.tryPromise({
          catch: () => new VisitSaveError({}),
          try: async () => {
            try {
              await client.connect()
              return await client.query<{ id: string }>(
                `INSERT INTO onsite.visit (
                  tenant_id, coach_id, participant_ref, started_at, ended_at,
                  purpose_of_visit, observations, interventions, next_steps
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
                [
                  visit.tenantId,
                  visit.coachId,
                  visit.participantRef,
                  DateTime.formatIso(visit.startedAt),
                  visit.endedAt ? DateTime.formatIso(visit.endedAt) : null,
                  visit.purposeOfVisit ?? null,
                  visit.observations ?? null,
                  visit.interventions ?? null,
                  visit.nextSteps ?? null
                ]
              )
            } finally {
              await client.end().catch(() => undefined)
            }
          }
        })

        const id = result.rows[0]?.id
        if (!id) return yield* new VisitSaveError({})
        return id
      })
    })
  })
)

export const devVisitRoutes = HttpRouter.add(
  "POST",
  "/visits",
  Effect.gen(function*() {
    const visit = yield* HttpServerRequest.schemaBodyJson(DevCreateOnSiteVisit, {
      onExcessProperty: "error"
    }).pipe(Effect.catch(() => Effect.succeed(null)))

    if (visit === null) {
      return HttpServerResponse.jsonUnsafe({ error: "Invalid visit input" }, { status: 400 })
    }

    const store = yield* VisitStore
    return yield* store.insert(visit).pipe(
      Effect.map((id) => HttpServerResponse.jsonUnsafe({ id }, { status: 201 })),
      Effect.catch(() =>
        Effect.logError("Local on-site visit insert failed").pipe(
          Effect.as(HttpServerResponse.jsonUnsafe({ error: "Could not save visit" }, { status: 500 }))
        )
      )
    )
  })
)
