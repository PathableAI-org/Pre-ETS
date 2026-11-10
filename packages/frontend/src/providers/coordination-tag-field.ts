/**
 * The hidden form field in which a protected Server Action form submits the tab's observed coordination tag. The
 * action compares it with the request cookie's tag and refuses a stale tab with no effect (research D2). Not a client
 * module, so server actions read the value itself.
 */
export const COORDINATION_TAG_FIELD = "coordinationTag"
