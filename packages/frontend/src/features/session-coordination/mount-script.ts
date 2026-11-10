import type { SessionCoordinationSnapshot } from "@pathableai/pre-ets-frontend-services"

import { CHANNEL, CURRENT_KEY, ENDED_KEY } from "./tab-channel.ts"

/** Hides the protected content before paint when the inline script finds this document's session already ended. */
export const PROTECTED_CONTENT_ATTRIBUTE = "data-protected-content"
export const ENDED_DOCUMENT_STYLE = `html[data-session-ended] [${PROTECTED_CONTENT_ATTRIBUTE}]{display:none}`

/**
 * Source of the inline script rendered before the protected content (research D14, R3, R9). It runs when the document
 * is parsed, before hydration: if the snapshot's tag is in the ended record it marks the document ended; otherwise it
 * writes the current-session hint and broadcasts the server snapshot so other tabs adopt a document-entry renewal.
 * The snapshot carries no identity or reference; `<` is escaped so it cannot close the script element.
 */
export const mountScriptSource = (snapshot: SessionCoordinationSnapshot): string => {
  const data = JSON.stringify({ channel: CHANNEL, current: CURRENT_KEY, ended: ENDED_KEY, snapshot }).replaceAll(
    "<",
    "\\u003c"
  )
  return `(function(d){var s=d.snapshot,t=s.coordinationTag;try{var e=JSON.parse(localStorage.getItem(d.ended)||"null");`
    + `if(e&&Array.isArray(e.coordinationTags)&&e.coordinationTags.indexOf(t)>=0){`
    + `document.documentElement.setAttribute("data-session-ended","");return}}catch(_){}`
    + `try{localStorage.setItem(d.current,JSON.stringify({coordinationTag:t}))}catch(_){}`
    + `try{var c=new BroadcastChannel(d.channel);c.postMessage({type:"renewed",coordinationTag:t,`
    + `localDeadline:Date.now()+s.idleDeadlineEpochMilliseconds-s.serverTimeEpochMilliseconds,`
    + `observedAtEpochMilliseconds:s.observedAtEpochMilliseconds,warningLeadMinutes:s.warningLeadMinutes});`
    + `c.postMessage({type:"session-current",coordinationTag:t});c.close()}catch(_){}})(${data})`
}
