import { describe, expect, it, vi } from "vitest"
import {
  authorizeHarnessApplication,
  authorizeHarnessSourceMutation,
  executeAuthorizedHarnessApplication,
  executeAuthorizedHarnessSourceMutation,
  type HarnessGuardrailSnapshotEntry,
} from "../packages/core/src/memory/harness-source-authorization.ts"
import { REQUIRED_HARNESS_GUARDRAILS } from "../packages/core/src/memory/prompt-improvement-harness.ts"

const now = Date.UTC(2026, 6, 15)
const fixtureRef = "tests/task1357-harness-guardrail-authorization.test.ts"

function preserved(): HarnessGuardrailSnapshotEntry[] {
  return REQUIRED_HARNESS_GUARDRAILS.map((guardrail) => ({ guardrail, disposition: "preserved" }))
}

function application(overrides: Partial<Parameters<typeof authorizeHarnessApplication>[0]> = {}) {
  return authorizeHarnessApplication({
    declaredRisk: "high",
    approvedRisk: "high",
    baselineGuardrails: preserved(),
    proposedGuardrails: preserved(),
    ...overrides,
  })
}

describe("task1357 harness application authorization", () => {
  it("applies only a complete preserved snapshot with high-risk approval", async () => {
    const apply = vi.fn(async () => "activated")
    await expect(executeAuthorizedHarnessApplication({ decision: application(), apply }))
      .resolves.toEqual({ status: "applied", result: "activated" })
    expect(apply).toHaveBeenCalledOnce()
  })

  it.each(REQUIRED_HARNESS_GUARDRAILS)("blocks weakened required guardrail %s before apply", async (guardrail) => {
    const apply = vi.fn()
    const proposed = preserved().map((entry) => entry.guardrail === guardrail
      ? { ...entry, disposition: "weakened" as const }
      : entry)
    const decision = application({ proposedGuardrails: proposed })
    expect(decision).toEqual({ status: "blocked", reasonCode: "proposed_guardrail_weakened", guardrail })
    await executeAuthorizedHarnessApplication({ decision, apply })
    expect(apply).not.toHaveBeenCalled()
  })

  it.each(REQUIRED_HARNESS_GUARDRAILS)("blocks removed required guardrail %s before apply", async (guardrail) => {
    const apply = vi.fn()
    const decision = application({ proposedGuardrails: preserved().filter((entry) => entry.guardrail !== guardrail) })
    expect(decision).toEqual({ status: "blocked", reasonCode: "proposed_guardrail_missing", guardrail })
    await executeAuthorizedHarnessApplication({ decision, apply })
    expect(apply).not.toHaveBeenCalled()
  })

  it.each(["low", "medium"] as const)("rejects declared %s risk for every harness application", async (declaredRisk) => {
    const apply = vi.fn()
    const decision = application({ declaredRisk })
    expect(decision).toEqual({ status: "blocked", reasonCode: "harness_risk_downgrade_forbidden" })
    await executeAuthorizedHarnessApplication({ decision, apply })
    expect(apply).not.toHaveBeenCalled()
  })

  it.each([undefined, "low", "medium"] as const)("rejects non-high approval receipt %s", async (approvedRisk) => {
    const apply = vi.fn()
    const decision = application({ approvedRisk })
    expect(decision).toEqual({ status: "blocked", reasonCode: "high_risk_approval_required" })
    await executeAuthorizedHarnessApplication({ decision, apply })
    expect(apply).not.toHaveBeenCalled()
  })

  it("authorizes the exact independently scoped harness test fixture writer", async () => {
    const decision = authorizeHarnessSourceMutation({
      source: { sourceKind: "test_fixture", sourceRef: fixtureRef, baselineVersion: "git:abc1234", baselineChecksum: "abcdef12" },
      userRequest: { requestId: "request:user:fixture", requester: "user:owner", requesterType: "user", requestedSourceRefs: [fixtureRef], requestedAt: now - 100, expiresAt: now + 100 },
      approval: { approvalId: "approval:fixture", approvedBy: "admin:owner", approvedSourceRefs: [fixtureRef], approvedAt: now - 50, expiresAt: now + 100 },
      now,
    })
    const write = vi.fn(async () => "written")
    await expect(executeAuthorizedHarnessSourceMutation({ decision, writerKind: "test_fixture", write }))
      .resolves.toEqual({ status: "written", result: "written" })
    expect(write).toHaveBeenCalledOnce()
  })

  it("does not let fixture authorization invoke another harness writer", async () => {
    const decision = authorizeHarnessSourceMutation({
      source: { sourceKind: "test_fixture", sourceRef: fixtureRef, baselineVersion: "git:abc1234", baselineChecksum: "abcdef12" },
      userRequest: { requestId: "request:user:fixture", requester: "user:owner", requesterType: "user", requestedSourceRefs: [fixtureRef], requestedAt: now - 100, expiresAt: now + 100 },
      approval: { approvalId: "approval:fixture", approvedBy: "admin:owner", approvedSourceRefs: [fixtureRef], approvedAt: now - 50, expiresAt: now + 100 },
      now,
    })
    const write = vi.fn()
    await expect(executeAuthorizedHarnessSourceMutation({ decision, writerKind: "harness_core", write }))
      .resolves.toEqual({ status: "blocked", reasonCode: "writer_kind_mismatch" })
    expect(write).not.toHaveBeenCalled()
  })
})
