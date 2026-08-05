export type AuditAccessRole = "audit_reader" | "administrator"
export type AuditAccessPurpose = "incident_review" | "quality_review" | "security_review"
export type AuditAccessOperation =
  | "view"
  | "export"
  | "cleanup_preview"
  | "cleanup_delete"
  | "promote_error_corpus"

export interface AuditAccessPrincipal {
  readonly principalRef: string
  readonly role: string
  readonly runIds: readonly string[]
  readonly requestGroupIds: readonly string[]
  readonly scopeRefs?: readonly string[]
}

export interface AuditAccessRequest {
  readonly principal: AuditAccessPrincipal | null
  readonly purpose: string | undefined
  readonly operation: AuditAccessOperation
  readonly runId?: string
  readonly requestGroupId?: string
  readonly scopeRef?: string
}

export type AuditAccessReasonCode =
  | "audit_access_allowed"
  | "audit_principal_missing"
  | "audit_role_denied"
  | "audit_operation_denied"
  | "audit_purpose_invalid"
  | "audit_scope_missing"
  | "audit_scope_denied"

export interface AuditAccessDecision {
  readonly allowed: boolean
  readonly reasonCode: AuditAccessReasonCode
}

const ALLOWED_ROLES = new Set<AuditAccessRole>(["audit_reader", "administrator"])
const ALLOWED_PURPOSES = new Set<AuditAccessPurpose>([
  "incident_review",
  "quality_review",
  "security_review",
])

function normalized(value: string | undefined): string | undefined {
  const result = value?.trim()
  return result || undefined
}

export function decideAuditAccess(input: AuditAccessRequest): AuditAccessDecision {
  if (!input.principal?.principalRef.trim()) {
    return { allowed: false, reasonCode: "audit_principal_missing" }
  }
  if (!ALLOWED_ROLES.has(input.principal.role as AuditAccessRole)) {
    return { allowed: false, reasonCode: "audit_role_denied" }
  }
  const mutation = input.operation !== "view" && input.operation !== "export"
  if (mutation && input.principal.role !== "administrator") {
    return { allowed: false, reasonCode: "audit_operation_denied" }
  }
  const purpose = normalized(input.purpose)
  if (!purpose || !ALLOWED_PURPOSES.has(purpose as AuditAccessPurpose)) {
    return { allowed: false, reasonCode: "audit_purpose_invalid" }
  }
  if (mutation && purpose !== "security_review") {
    return { allowed: false, reasonCode: "audit_purpose_invalid" }
  }
  const runId = normalized(input.runId)
  const requestGroupId = normalized(input.requestGroupId)
  const scopeRef = normalized(input.scopeRef)
  if (!runId && !requestGroupId && !scopeRef) {
    return { allowed: false, reasonCode: "audit_scope_missing" }
  }
  const allowsRun =
    !runId ||
    input.principal.runIds.includes(runId) ||
    (input.principal.role === "administrator" && input.principal.runIds.includes("*"))
  const allowsRequestGroup =
    !requestGroupId ||
    input.principal.requestGroupIds.includes(requestGroupId) ||
    (input.principal.role === "administrator" && input.principal.requestGroupIds.includes("*"))
  const allowsScope =
    !scopeRef ||
    input.principal.scopeRefs?.includes(scopeRef) === true ||
    (input.principal.role === "administrator" && input.principal.scopeRefs?.includes("*") === true)
  if (!allowsRun || !allowsRequestGroup || !allowsScope) {
    return { allowed: false, reasonCode: "audit_scope_denied" }
  }
  return { allowed: true, reasonCode: "audit_access_allowed" }
}

export interface AuditAccessReceipt {
  readonly schemaVersion: "audit-access-v2"
  readonly principalRef: string | null
  readonly role: string | null
  readonly purpose: string | null
  readonly operation: AuditAccessOperation
  readonly runId: string | null
  readonly requestGroupId: string | null
  readonly scopeRef: string | null
  readonly result: "allowed" | "denied"
  readonly reasonCode: AuditAccessReasonCode
  readonly at: number
}

export function createAuditAccessReceipt(
  input: AuditAccessRequest,
  decision: AuditAccessDecision,
  at: number,
): AuditAccessReceipt {
  return Object.freeze({
    schemaVersion: "audit-access-v2",
    principalRef: normalized(input.principal?.principalRef) ?? null,
    role: normalized(input.principal?.role) ?? null,
    purpose: normalized(input.purpose) ?? null,
    operation: input.operation,
    runId: normalized(input.runId) ?? null,
    requestGroupId: normalized(input.requestGroupId) ?? null,
    scopeRef: normalized(input.scopeRef) ?? null,
    result: decision.allowed ? "allowed" : "denied",
    reasonCode: decision.reasonCode,
    at,
  })
}
