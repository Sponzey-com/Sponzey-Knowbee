import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import {
  applyExactApprovedSource,
  authorizeExactSourceApproval,
  type ApprovalSourceDescriptor,
  type ExactSourceApprovalRequest,
} from "../packages/core/src/contracts/exact-source-approval.ts"

const now = Date.UTC(2026, 6, 15, 4)
const proposal = "proposal:1362"
const sourceSet = "sources:1362"
const sources: ApprovalSourceDescriptor[] = [
  { sourceKind: "prompt_source_file", sourceRef: "prompts/system.md", baselineVersion: "git:abc1234", baselineChecksum: "aaaaaaaa", proposedChecksum: "bbbbbbbb" },
  { sourceKind: "persistent_prompt_record", sourceRef: "prompt-record:agent-main:identity:v2", baselineVersion: "record:v1", baselineChecksum: "cccccccc", proposedChecksum: "dddddddd" },
  { sourceKind: "harness_source_file", sourceRef: "packages/core/src/memory/prompt-improvement-harness.ts#state-machine", baselineVersion: "git:def5678", baselineChecksum: "eeeeeeee", proposedChecksum: "ffffffff" },
]

function request(targetSources = sources): ExactSourceApprovalRequest {
  return {
    approvalId: "approval:1362",
    proposalFingerprint: proposal,
    sourceSetFingerprint: sourceSet,
    targetSources,
    changeSummary: "Update exact prompt sources.",
    riskLevel: "high",
    invariantsAffected: ["identity", "approval"],
    testsToRun: ["prompt-regression", "rollback"],
    rollbackPlan: "Restore every baseline checksum.",
    activationMethod: "restart",
    decision: "approved",
    approvedBy: "user:owner",
    issuedAt: now - 100,
    expiresAt: now + 100,
  }
}

function decision(overrides: Partial<Parameters<typeof authorizeExactSourceApproval>[0]> = {}) {
  return authorizeExactSourceApproval({
    request: request(),
    expectedProposalFingerprint: proposal,
    expectedSourceSetFingerprint: sourceSet,
    proposalSources: sources,
    now,
    ...overrides,
  })
}

describe("task1362 exact source approval", () => {
  it.each(sources)("accepts exact named source $sourceRef", async (source) => {
    const apply = vi.fn(async () => source.sourceRef)
    await expect(applyExactApprovedSource({ decision: decision(), source, apply }))
      .resolves.toEqual({ status: "applied", result: source.sourceRef })
    expect(apply).toHaveBeenCalledWith(source)
  })

  it.each([
    "prompts/*.md",
    "prompts/",
    "prompts/../system.md",
    "prompt-record:*",
    "packages/core/src/memory/",
  ])("blocks non-exact source reference %s", (sourceRef) => {
    const invalid = [{ ...sources[0], sourceRef }]
    expect(decision({ request: request(invalid), proposalSources: invalid }))
      .toEqual({ status: "blocked", reasonCode: "source_ref_not_exact" })
  })

  it("blocks duplicate named sources", () => {
    expect(decision({ request: request([sources[0], sources[0]]), proposalSources: [sources[0], sources[0]] }))
      .toEqual({ status: "blocked", reasonCode: "source_duplicate" })
  })

  it.each(["changeSummary", "rollbackPlan", "approvedBy"] as const)("requires approval request field %s", (field) => {
    expect(decision({ request: { ...request(), [field]: "" } })).toEqual({ status: "blocked", reasonCode: "approval_request_invalid" })
  })

  it("requires invariants and tests in the approval request", () => {
    expect(decision({ request: { ...request(), invariantsAffected: [] } })).toEqual({ status: "blocked", reasonCode: "approval_request_invalid" })
    expect(decision({ request: { ...request(), testsToRun: [] } })).toEqual({ status: "blocked", reasonCode: "approval_request_invalid" })
  })

  it("compares proposal and approval source sets independent of order", () => {
    expect(decision({ request: request([...sources].reverse()) })).toMatchObject({ status: "authorized", targetSources: expect.arrayContaining(sources) })
  })

  it.each([
    { approvedSources: sources.slice(0, 2) },
    { approvedSources: [...sources, { sourceKind: "prompt_source_file", sourceRef: "prompts/user.md", baselineVersion: "git:1234567", baselineChecksum: "11111111", proposedChecksum: "22222222" } as const] },
    { approvedSources: sources.map((source, index) => index === 0 ? { ...source, proposedChecksum: "99999999" } : source) },
    { approvedSources: sources.map((source, index) => index === 0 ? { ...source, baselineVersion: "git:other12" } : source) },
  ])("blocks approval source-set expansion or mismatch", ({ approvedSources }) => {
    expect(decision({ request: request(approvedSources) })).toEqual({ status: "blocked", reasonCode: "source_set_mismatch" })
  })

  it("does not reuse one source approval for another source writer", async () => {
    const oneSource = sources[0]
    const oneDecision = decision({ request: request([oneSource]), proposalSources: [oneSource] })
    const apply = vi.fn()
    await expect(applyExactApprovedSource({ decision: oneDecision, source: sources[1], apply }))
      .resolves.toEqual({ status: "blocked", reasonCode: "source_not_approved" })
    expect(apply).not.toHaveBeenCalled()
  })

  it("blocks proposal and source-set fingerprint mismatch", () => {
    expect(decision({ request: { ...request(), proposalFingerprint: "proposal:other" } })).toEqual({ status: "blocked", reasonCode: "proposal_scope_mismatch" })
    expect(decision({ request: { ...request(), sourceSetFingerprint: "sources:other" } })).toEqual({ status: "blocked", reasonCode: "source_set_fingerprint_mismatch" })
  })

  it("uses only injected source descriptors", () => {
    const source = readFileSync(new URL("../packages/core/src/contracts/exact-source-approval.ts", import.meta.url), "utf8")
    expect(source).not.toMatch(/process\.env|Date\.now|readFile|writeFile|fetch\(|createLogger|loadPrompt|globalThis/u)
  })
})
