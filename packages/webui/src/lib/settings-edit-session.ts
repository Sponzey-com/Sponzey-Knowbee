export type SettingsEditSessionStatus =
  | "clean"
  | "dirty"
  | "confirming"
  | "saving"
  | "save_failed"
  | "discarded"

export interface SettingsEditSession {
  status: SettingsEditSessionStatus
  pendingDestination: string | null
}

export type SettingsEditSessionEvent =
  | { type: "EDIT" }
  | { type: "NAVIGATE_REQUESTED"; destination: string }
  | { type: "STAY" }
  | { type: "DISCARD_AND_LEAVE" }
  | { type: "SAVE_REQUESTED" }
  | { type: "SAVE_SUCCEEDED" }
  | { type: "SAVE_FAILED" }
  | { type: "AUTHORITATIVE_RELOADED"; matchesDraft: boolean }

export type SettingsEditSessionEffect = "none" | "confirm_navigation" | "navigate"

export interface SettingsEditSessionTransition {
  session: SettingsEditSession
  effect: SettingsEditSessionEffect
}

export function createSettingsEditSession(): SettingsEditSession {
  return { status: "clean", pendingDestination: null }
}

function result(
  session: SettingsEditSession,
  effect: SettingsEditSessionEffect = "none",
): SettingsEditSessionTransition {
  return { session, effect }
}

export function transitionSettingsEditSession(
  session: SettingsEditSession,
  event: SettingsEditSessionEvent,
): SettingsEditSessionTransition {
  switch (event.type) {
    case "EDIT":
      if (["clean", "dirty", "save_failed"].includes(session.status)) {
        return result({ status: "dirty", pendingDestination: null })
      }
      return result(session)
    case "NAVIGATE_REQUESTED":
      if (session.status === "clean" || session.status === "discarded") {
        return result({ status: session.status, pendingDestination: event.destination }, "navigate")
      }
      if (session.status === "dirty" || session.status === "save_failed") {
        return result(
          { status: "confirming", pendingDestination: event.destination },
          "confirm_navigation",
        )
      }
      return result(session)
    case "STAY":
      return session.status === "confirming"
        ? result({ status: "dirty", pendingDestination: null })
        : result(session)
    case "DISCARD_AND_LEAVE":
      return session.status === "confirming" && session.pendingDestination
        ? result(
            { status: "discarded", pendingDestination: session.pendingDestination },
            "navigate",
          )
        : result(session)
    case "SAVE_REQUESTED":
      return session.status === "dirty" || session.status === "save_failed"
        ? result({ status: "saving", pendingDestination: null })
        : result(session)
    case "SAVE_SUCCEEDED":
      return session.status === "saving" ? result(session) : result(session)
    case "SAVE_FAILED":
      return session.status === "saving"
        ? result({ status: "save_failed", pendingDestination: null })
        : result(session)
    case "AUTHORITATIVE_RELOADED":
      if (session.status !== "saving") return result(session)
      return event.matchesDraft
        ? result(createSettingsEditSession())
        : result({ status: "save_failed", pendingDestination: null })
  }
}
