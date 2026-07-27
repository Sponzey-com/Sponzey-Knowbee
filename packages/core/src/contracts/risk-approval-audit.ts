export type PromptChangeRisk = "low" | "medium" | "high"
export type ApprovalResponseOutcome = "approved" | "denied" | "timeout" | "ambiguous"

export interface RiskApprovalRequestReceipt {
  requestId: string
  proposalFingerprint: string
  sourceSetFingerprint: string
  risk: PromptChangeRisk
  state: "pending"
  requestedBy: string
  requestedAt: number
  expiresAt: number
}

export interface RiskApprovalResponseReceipt {
  requestId: string
  proposalFingerprint: string
  sourceSetFingerprint: string
  outcome: ApprovalResponseOutcome
  actorId: string
  respondedAt: number
}

export interface ApprovalAuditReceipt {
  correlationId: string
  requestId: string
  proposalFingerprint: string
  sourceSetFingerprint: string
  risk: PromptChangeRisk
  decision: "approved"
  actorId: string
  recordedAt: number
}

export type RiskApprovalDecision =
  | { status: "not_required"; risk: "low" }
  | {
      status: "authorized"
      requestId: string
      proposalFingerprint: string
      sourceSetFingerprint: string
      risk: "medium" | "high"
      auditCorrelationId: string
    }
  | {
      status: "blocked"
      reasonCode:
        | "approval_request_missing"
        | "approval_request_invalid"
        | "approval_request_expired"
        | "approval_response_missing"
        | "approval_response_scope_mismatch"
        | "approval_denied"
        | "approval_timeout"
        | "approval_ambiguous"
        | "approval_audit_missing"
        | "approval_audit_invalid"
        | "approval_audit_scope_mismatch"
        | "approval_audit_duplicate"
    }

function exact(value: string): string {
  return value.trim()
}

export function authorizeRiskBasedPromptChange(input: {
  risk: PromptChangeRisk
  expectedProposalFingerprint: string
  expectedSourceSetFingerprint: string
  request?: RiskApprovalRequestReceipt
  response?: RiskApprovalResponseReceipt
  audit?: ApprovalAuditReceipt
  existingAuditCorrelationIds?: readonly string[]
  now: number
}): RiskApprovalDecision {
  if (input.risk === "low") return { status: "not_required", risk: "low" }
  const request = input.request
  if (!request) return { status: "blocked", reasonCode: "approval_request_missing" }
  if (!exact(request.requestId) || !exact(request.requestedBy)
    || request.state !== "pending" || request.risk !== input.risk
    || !Number.isSafeInteger(request.requestedAt) || !Number.isSafeInteger(request.expiresAt)
    || !Number.isSafeInteger(input.now) || request.requestedAt > input.now
    || request.proposalFingerprint !== input.expectedProposalFingerprint
    || request.sourceSetFingerprint !== input.expectedSourceSetFingerprint) {
    return { status: "blocked", reasonCode: "approval_request_invalid" }
  }
  if (request.expiresAt <= input.now) return { status: "blocked", reasonCode: "approval_request_expired" }
  const response = input.response
  if (!response) return { status: "blocked", reasonCode: "approval_response_missing" }
  if (response.requestId !== request.requestId
    || response.proposalFingerprint !== request.proposalFingerprint
    || response.sourceSetFingerprint !== request.sourceSetFingerprint
    || !exact(response.actorId)
    || !Number.isSafeInteger(response.respondedAt)
    || response.respondedAt < request.requestedAt
    || response.respondedAt > input.now) {
    return { status: "blocked", reasonCode: "approval_response_scope_mismatch" }
  }
  if (response.outcome === "denied") return { status: "blocked", reasonCode: "approval_denied" }
  if (response.outcome === "timeout") return { status: "blocked", reasonCode: "approval_timeout" }
  if (response.outcome === "ambiguous") return { status: "blocked", reasonCode: "approval_ambiguous" }
  const audit = input.audit
  if (!audit) return { status: "blocked", reasonCode: "approval_audit_missing" }
  if (!exact(audit.correlationId) || audit.decision !== "approved"
    || !Number.isSafeInteger(audit.recordedAt) || audit.recordedAt < response.respondedAt || audit.recordedAt > input.now) {
    return { status: "blocked", reasonCode: "approval_audit_invalid" }
  }
  if (audit.requestId !== request.requestId
    || audit.proposalFingerprint !== request.proposalFingerprint
    || audit.sourceSetFingerprint !== request.sourceSetFingerprint
    || audit.risk !== request.risk
    || audit.actorId !== response.actorId) {
    return { status: "blocked", reasonCode: "approval_audit_scope_mismatch" }
  }
  if ((input.existingAuditCorrelationIds ?? []).map(exact).includes(audit.correlationId)) {
    return { status: "blocked", reasonCode: "approval_audit_duplicate" }
  }
  return {
    status: "authorized",
    requestId: request.requestId,
    proposalFingerprint: request.proposalFingerprint,
    sourceSetFingerprint: request.sourceSetFingerprint,
    risk: input.risk,
    auditCorrelationId: audit.correlationId,
  }
}

export async function applyRiskApprovedPromptChange<T>(input: {
  decision: RiskApprovalDecision
  apply: (authorization: Extract<RiskApprovalDecision, { status: "authorized" }>) => Promise<T>
}): Promise<{ status: "applied"; result: T } | Exclude<RiskApprovalDecision, { status: "authorized" }>> {
  if (input.decision.status !== "authorized") return input.decision
  return { status: "applied", result: await input.apply(input.decision) }
}
