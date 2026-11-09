import { When } from "@cucumber/cucumber"

import type { AppWorld } from "../support/world.ts"

import { FETCH_METADATA, requestSiteWith } from "../support/server.ts"

/**
 * A same-origin in-page activity communication as a tab sends it: JSON naming the kind and a coordination tag. The
 * tag is synthetic; without a usable session no tag can match, and the outcome must not depend on it.
 */
When(
  "a visitor communicates {string} activity at {string}",
  async function(this: AppWorld, activity: string, host: string) {
    await requestSiteWith(this, {
      body: Buffer.from(JSON.stringify({ activity, coordinationTag: "synthetic-tag" })),
      headers: {
        ...FETCH_METADATA.application,
        "content-type": "application/json",
        Origin: `https://${host}`,
        "sec-fetch-site": "same-origin"
      },
      host,
      method: "POST",
      path: "/session/activity"
    })
  }
)
