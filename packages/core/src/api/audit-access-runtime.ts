import type { FastifyRequest } from "fastify"
import { insertAuditLog } from "../db/index.js"
import { createLogger } from "../logger/index.js"
import {
  type AuditAccessOperation,
  type AuditAccessPrincipal,
  type AuditAccessReceipt,
  createAuditAccessReceipt,
  decideAuditAccess,
} from "../security/audit-access.js"
import { getApiAuthenticationPrincipal } from "./middleware/auth.js"

const log = createLogger("api:audit-access")

export interface AuditAccessRecordResult {
  readonly recorded: boolean
  readonly reasonCode?: "audit_access_record_failed"
}

export interface AuditAccessRuntimeDependencies {
  resolvePrincipal(request: FastifyRequest): AuditAccessPrincipal | null
  recordAccess?(receipt: AuditAccessReceipt): AuditAccessRecordResult
  now?(): number
}

function recordAuditAccess(receipt: AuditAccessReceipt): AuditAccessRecordResult {
  try {
    insertAuditLog({
      timestamp: receipt.at,
      session_id: null,
      run_id: receipt.runId,
      request_group_id: receipt.requestGroupId,
      channel: null,
      source: "audit",
      tool_name: `audit_access_${receipt.operation}`,
      params: JSON.stringify(receipt),
      output: null,
      result: receipt.result,
      duration_ms: null,
      approval_required: 0,
      approved_by: receipt.principalRef,
      error_code: receipt.reasonCode,
    })
    return { recorded: true }
  } catch {
    return { recorded: false, reasonCode: "audit_access_record_failed" }
  }
}

export const AUTHENTICATED_API_AUDIT_DEPENDENCIES: AuditAccessRuntimeDependencies = Object.freeze({
  resolvePrincipal(request: FastifyRequest): AuditAccessPrincipal | null {
    const principal = getApiAuthenticationPrincipal(request)
    if (!principal) return null
    return Object.freeze({
      principalRef: principal.principalRef,
      role: principal.role,
      runIds: Object.freeze(["*"]),
      requestGroupIds: Object.freeze(["*"]),
      scopeRefs: Object.freeze(["instance:local"]),
    })
  },
})

export interface AuditAccessRuntimeOutcome {
  readonly allowed: boolean
  readonly reasonCode: string
}

export function authorizeAndRecordAuditAccess(input: {
  request: FastifyRequest
  purpose: string | undefined
  operation: AuditAccessOperation
  runId?: string
  requestGroupId?: string
  scopeRef?: string
  dependencies?: AuditAccessRuntimeDependencies
}): AuditAccessRuntimeOutcome {
  const dependencies = input.dependencies ?? AUTHENTICATED_API_AUDIT_DEPENDENCIES
  const accessRequest = {
    principal: dependencies.resolvePrincipal(input.request),
    purpose: input.purpose,
    operation: input.operation,
    ...(input.runId ? { runId: input.runId } : {}),
    ...(input.requestGroupId ? { requestGroupId: input.requestGroupId } : {}),
    ...(input.scopeRef ? { scopeRef: input.scopeRef } : {}),
  }
  const decision = decideAuditAccess(accessRequest)
  const receipt = createAuditAccessReceipt(
    accessRequest,
    decision,
    dependencies.now?.() ?? Date.now(),
  )
  const recordAccess = dependencies.recordAccess ?? recordAuditAccess
  let recordResult: AuditAccessRecordResult
  try {
    recordResult = recordAccess(receipt)
  } catch {
    recordResult = { recorded: false, reasonCode: "audit_access_record_failed" }
  }
  if (!recordResult.recorded) {
    log.debug(
      `Audit access receipt storage unavailable: ${recordResult.reasonCode ?? "audit_access_record_failed"}`,
    )
    if (decision.allowed) return { allowed: false, reasonCode: "audit_access_record_failed" }
  }
  return decision
}

export function auditAccessHttpFailure(outcome: AuditAccessRuntimeOutcome): {
  statusCode: 403 | 503
  body: { error: "audit_access_denied" | "audit_access_unavailable"; reasonCode: string }
} {
  return outcome.reasonCode === "audit_access_record_failed"
    ? {
        statusCode: 503,
        body: { error: "audit_access_unavailable", reasonCode: outcome.reasonCode },
      }
    : {
        statusCode: 403,
        body: { error: "audit_access_denied", reasonCode: outcome.reasonCode },
      }
}
