import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import {
  applyRiskApprovedPromptChange,
  authorizeRiskBasedPromptChange,
  type ApprovalAuditReceipt,
  type PromptChangeRisk,
  type RiskApprovalRequestReceipt,
  type RiskApprovalResponseReceipt,
} from "../packages/core/src/contracts/risk-approval-audit.ts"

const now = Date.UTC(2026, 6, 15, 5)
const proposal = "proposal:1363"
const sourceSet = "sources:1363"

function request(risk: PromptChangeRisk = "medium"): RiskApprovalRequestReceipt {
  return {
    requestId: `request:${risk}:1363`,
    proposalFingerprint: proposal,
    sourceSetFingerprint: sourceSet,
    risk,
    state: "pending",
    requestedBy: "agent:main",
    requestedAt: now - 100,
    expiresAt: now + 100,
  }
}

function response(risk: PromptChangeRisk = "medium"): RiskApprovalResponseReceipt {
  return {
    requestId: request(risk).requestId,
    proposalFingerprint: proposal,
    sourceSetFingerprint: sourceSet,
    outcome: "approved",
    actorId: "user:owner",
    respondedAt: now - 50,
  }
}

function audit(risk: PromptChangeRisk = "medium"): ApprovalAuditReceipt {
  return {
    correlationId: `audit:${risk}:1363`,
    requestId: request(risk).requestId,
    proposalFingerprint: proposal,
    sourceSetFingerprint: sourceSet,
    risk,
    decision: "approved",
    actorId: "user:owner",
    recordedAt: now - 25,
  }
}

function decision(risk: PromptChangeRisk, overrides: Partial<Parameters<typeof authorizeRiskBasedPromptChange>[0]> = {}) {
  return authorizeRiskBasedPromptChange({
    risk,
    expectedProposalFingerprint: proposal,
    expectedSourceSetFingerprint: sourceSet,
    request: request(risk),
    response: response(risk),
    audit: audit(risk),
    now,
    ...overrides,
  })
}

describe("task1363 risk approval and audit", () => {
  it("does not require this explicit approval flow for low risk", () => {
    expect(authorizeRiskBasedPromptChange({ risk: "low", expectedProposalFingerprint: proposal, expectedSourceSetFingerprint: sourceSet, now }))
      .toEqual({ status: "not_required", risk: "low" })
  })

  it.each(["medium", "high"] as const)("requires a pending approval request before %s-risk apply", async (risk) => {
    const apply = vi.fn()
    const denied = decision(risk, { request: undefined })
    expect(denied).toEqual({ status: "blocked", reasonCode: "approval_request_missing" })
    await applyRiskApprovedPromptChange({ decision: denied, apply })
    expect(apply).not.toHaveBeenCalled()
  })

  it.each(["medium", "high"] as const)("applies %s risk only with exact approval and audit lineage", async (risk) => {
    const apply = vi.fn(async () => "applied")
    const approved = decision(risk)
    await expect(applyRiskApprovedPromptChange({ decision: approved, apply })).resolves.toEqual({ status: "applied", result: "applied" })
    expect(apply).toHaveBeenCalledWith(expect.objectContaining({ risk, auditCorrelationId: `audit:${risk}:1363` }))
  })

  it.each([
    ["denied", "approval_denied"],
    ["timeout", "approval_timeout"],
    ["ambiguous", "approval_ambiguous"],
  ] as const)("keeps %s response blocked", async (outcome, reasonCode) => {
    const apply = vi.fn()
    const denied = decision("high", { response: { ...response("high"), outcome } })
    expect(denied).toEqual({ status: "blocked", reasonCode })
    await applyRiskApprovedPromptChange({ decision: denied, apply })
    expect(apply).not.toHaveBeenCalled()
  })

  it("blocks missing, malformed, mismatched, and duplicate approval audit", async () => {
    const apply = vi.fn()
    const cases = [
      decision("high", { audit: undefined }),
      decision("high", { audit: { ...audit("high"), correlationId: "" } }),
      decision("high", { audit: { ...audit("high"), sourceSetFingerprint: "sources:other" } }),
      decision("high", { existingAuditCorrelationIds: [audit("high").correlationId] }),
    ]
    expect(cases).toEqual([
      { status: "blocked", reasonCode: "approval_audit_missing" },
      { status: "blocked", reasonCode: "approval_audit_invalid" },
      { status: "blocked", reasonCode: "approval_audit_scope_mismatch" },
      { status: "blocked", reasonCode: "approval_audit_duplicate" },
    ])
    for (const denied of cases) await applyRiskApprovedPromptChange({ decision: denied, apply })
    expect(apply).not.toHaveBeenCalled()
  })

  it("blocks expired request and response scope mismatch", () => {
    expect(decision("medium", { request: { ...request("medium"), expiresAt: now } }))
      .toEqual({ status: "blocked", reasonCode: "approval_request_expired" })
    expect(decision("medium", { response: { ...response("medium"), proposalFingerprint: "proposal:other" } }))
      .toEqual({ status: "blocked", reasonCode: "approval_response_scope_mismatch" })
  })

  it("uses an injected audit receipt instead of logger, database, or environment access", () => {
    const source = readFileSync(new URL("../packages/core/src/contracts/risk-approval-audit.ts", import.meta.url), "utf8")
    expect(source).not.toMatch(/process\.env|Date\.now|readFile|writeFile|fetch\(|createLogger|insertAudit|database|globalThis/u)
  })
})
