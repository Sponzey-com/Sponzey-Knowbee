import { UiRequestFailure, buildUiRequestFailure } from "../api/request-failure"

export { UiRequestFailure, buildUiRequestFailure }

export type UserRecoveryAction =
  | "refresh_state"
  | "edit_input"
  | "reauthorize"
  | "choose_alternative"
  | "contact_admin"

export type UserRecoveryKind =
  | "authentication"
  | "authorization"
  | "conflict"
  | "invalid_input"
  | "unavailable"
  | "unsupported"
  | "unknown"

export interface UserRecoveryProjection {
  kind: UserRecoveryKind
  reasonCode: string
  messageKey: UserRecoveryKind | "request_failed"
  action: UserRecoveryAction
  actionLabelKey: UserRecoveryAction
}

const CONFLICT_CODES = new Set([
  "mutation_revision_conflict",
  "persisted_revision_mismatch",
  "stale_revision",
])

export function projectUserRecovery(
  failure: unknown,
  operation: "read" | "mutation",
): UserRecoveryProjection {
  const requestFailure = failure instanceof UiRequestFailure ? failure : null
  const status = requestFailure?.status ?? null
  const reasonCode = requestFailure?.reasonCode ?? "request_failed"

  if (status === 401 || reasonCode === "authentication_required") {
    return projection("authentication", reasonCode, "reauthorize")
  }
  if (status === 403 || reasonCode === "permission_denied") {
    return projection("authorization", reasonCode, "contact_admin")
  }
  if (status === 409 || CONFLICT_CODES.has(reasonCode)) {
    return projection("conflict", reasonCode, "refresh_state")
  }
  if (status === 400 || status === 422 || reasonCode === "validation_failed") {
    return projection("invalid_input", reasonCode, "edit_input")
  }
  if (status === 501 || reasonCode === "unsupported_operation") {
    return projection("unsupported", reasonCode, "choose_alternative")
  }
  if (
    status === 502 ||
    status === 503 ||
    status === 504 ||
    reasonCode === "service_unavailable" ||
    reasonCode === "network_unavailable"
  ) {
    return projection("unavailable", reasonCode, "refresh_state")
  }
  return {
    kind: "unknown",
    reasonCode: "request_failed",
    messageKey: "request_failed",
    action: operation === "read" ? "refresh_state" : "contact_admin",
    actionLabelKey: operation === "read" ? "refresh_state" : "contact_admin",
  }
}

function projection(
  kind: Exclude<UserRecoveryKind, "unknown">,
  reasonCode: string,
  action: UserRecoveryAction,
): UserRecoveryProjection {
  return {
    kind,
    reasonCode,
    messageKey: kind,
    action,
    actionLabelKey: action,
  }
}
