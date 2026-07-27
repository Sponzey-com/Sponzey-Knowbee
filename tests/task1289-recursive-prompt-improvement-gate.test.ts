import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import {
  authorizeRecursivePromptImprovement,
  REQUIRED_HARNESS_REGRESSION_TEST_IDS,
  RECURSIVE_PROMPT_BEHAVIOR_INVARIANTS,
  writeRecursivePromptImprovement,
  type RecursivePromptHarnessGateReceipt,
} from "../packages/core/src/index.ts"

const now = Date.UTC(2026, 6, 14, 21, 0, 0)

function harness(overrides: Partial<RecursivePromptHarnessGateReceipt> = {}): RecursivePromptHarnessGateReceipt {
  return {
    schemaVersion: 1,
    harnessRunId: "harness:run:1",
    proposalFingerprint: "proposal:v1",
    ownershipFingerprint: "ownership:v1",
    invariantReviewFingerprint: "invariants:v1",
    controllingHarnessFingerprint: "harness:active:v1",
    activeHarnessFingerprint: "harness:active:v1",
    state: "approval_wait",
    attempt: 1,
    maxAttempts: 3,
    priorProposalFingerprints: [],
    passedInvariants: [...RECURSIVE_PROMPT_BEHAVIOR_INVARIANTS],
    regressionReceiptRefs: ["test:prompt-regression:v1"],
    changeKind: "prompt_source",
    rollbackRef: "rollback:prompt:v1",
    trigger: {
      requestId: "request:prompt-improvement:1",
      diagnosisReceiptId: "diagnosis:prompt-improvement:1",
      classifiedBy: "llm",
      classification: "explicit_prompt_improvement",
      diagnosedAction: "prompt_improvement_proposal",
      explicitRequest: true,
      targetPromptSourceRefs: ["prompt:workflow"],
      protectedInvariantBypassRequested: false,
    },
    issuedAt: now,
    expiresAt: now + 60_000,
    ...overrides,
  }
}

function harnessChange(overrides: Partial<RecursivePromptHarnessGateReceipt> = {}): RecursivePromptHarnessGateReceipt {
  return harness({
    changeKind: "harness",
    riskLevel: "high",
    harnessRegressionSuite: {
      schemaVersion: 1,
      proposalFingerprint: "proposal:v1",
      status: "passed",
      requiredTestIds: [...REQUIRED_HARNESS_REGRESSION_TEST_IDS],
      passedTestIds: [...REQUIRED_HARNESS_REGRESSION_TEST_IDS],
      sourceFingerprint: "harness:candidate:v2",
    },
    harnessApproval: {
      schemaVersion: 1,
      proposalFingerprint: "proposal:v1",
      decision: "approved",
      scope: "harness_apply",
      approvedBy: "admin:owner",
      issuedAt: now - 1_000,
      expiresAt: now + 30_000,
    },
    ...overrides,
  })
}

function authorize(overrides: Record<string, unknown> = {}) {
  return authorizeRecursivePromptImprovement({
    harness: harness(),
    agentAuthorization: {
      status: "authorized", agentType: "main", proposalFingerprint: "proposal:v1", authorization: "owner_invariant_review",
    },
    behaviorGate: { status: "authorized", proposalFingerprint: "proposal:v1", sourceRefs: ["prompt:system"] },
    sourceApplication: {
      status: "authorized",
      authorization: {
        schemaVersion: 1, status: "source_write_authorized", proposalFingerprint: "proposal:v1",
        impact: "agent_owned_only", sourceSetFingerprint: "sources:v1", sources: [],
      },
    },
    expectedOwnershipFingerprint: "ownership:v1",
    expectedInvariantReviewFingerprint: "invariants:v1",
    now,
    ...overrides,
  })
}

describe("task1289 recursive prompt improvement composite gate", () => {
  it("authorizes main and sub-agent improvements through the same harness gate", () => {
    expect(authorize()).toEqual({
      status: "authorized", harnessRunId: "harness:run:1", proposalFingerprint: "proposal:v1", sourceSetFingerprint: "sources:v1",
    })
    expect(authorize({
      agentAuthorization: {
        status: "authorized", agentType: "sub_agent", proposalFingerprint: "proposal:v1", authorization: "parent_approval",
      },
    })).toMatchObject({ status: "authorized" })
  })

  it("authorizes a harness change only with the complete passing suite and explicit high-risk approval", () => {
    expect(authorize({ harness: harnessChange() })).toMatchObject({ status: "authorized" })
  })

  it.each([
    [harnessChange({ harnessRegressionSuite: undefined }), "harness_regression_suite_missing"],
    [harnessChange({ harnessRegressionSuite: { schemaVersion: 1, proposalFingerprint: "proposal:v1", status: "failed", requiredTestIds: [...REQUIRED_HARNESS_REGRESSION_TEST_IDS], passedTestIds: [], sourceFingerprint: "harness:candidate:v2" } }), "harness_regression_suite_failed"],
    [harnessChange({ harnessRegressionSuite: { schemaVersion: 1, proposalFingerprint: "proposal:v1", status: "passed", requiredTestIds: [...REQUIRED_HARNESS_REGRESSION_TEST_IDS], passedTestIds: REQUIRED_HARNESS_REGRESSION_TEST_IDS.slice(1), sourceFingerprint: "harness:candidate:v2" } }), "harness_regression_suite_incomplete"],
    [harnessChange({ riskLevel: "medium" }), "harness_high_risk_required"],
    [harnessChange({ harnessApproval: undefined }), "harness_explicit_approval_required"],
    [harnessChange({ harnessApproval: { schemaVersion: 1, proposalFingerprint: "proposal:v1", decision: "approved", scope: "harness_apply", approvedBy: "admin:owner", issuedAt: now - 1_000, expiresAt: now - 1 } }), "harness_explicit_approval_required"],
  ] as const)("blocks an unverified harness change %#", (receipt, reasonCode) => {
    expect(authorize({ harness: receipt })).toEqual({ status: "blocked", reasonCode })
  })

  it.each(["casual_chat", "ordinary_task"] as const)(
    "does not start recursive improvement for %s",
    (classification) => {
      expect(authorize({
        harness: harness({
          trigger: {
            requestId: `request:${classification}`,
            diagnosisReceiptId: `diagnosis:${classification}`,
            classifiedBy: "llm",
            classification,
            diagnosedAction: "ordinary_request",
            explicitRequest: false,
            targetPromptSourceRefs: [],
            protectedInvariantBypassRequested: false,
          },
        }),
      })).toEqual({ status: "blocked", reasonCode: "explicit_improvement_trigger_required" })
    },
  )

  it("fails closed when a legacy receipt has no explicit trigger", () => {
    const legacyHarness = harness() as RecursivePromptHarnessGateReceipt & { trigger?: undefined }
    delete legacyHarness.trigger

    expect(authorize({ harness: legacyHarness })).toEqual({
      status: "blocked",
      reasonCode: "improvement_trigger_diagnosis_mismatch",
    })
  })

  it.each([
    [{ diagnosisReceiptId: "" }, "improvement_trigger_diagnosis_mismatch"],
    [{ diagnosedAction: "ordinary_request" }, "improvement_trigger_diagnosis_mismatch"],
    [{ targetPromptSourceRefs: [] }, "improvement_target_required"],
    [{ targetPromptSourceRefs: ["all prompts"] }, "improvement_target_required"],
    [{ classification: "ambiguous_prompt_improvement", diagnosedAction: "ask_clarification", explicitRequest: false, targetPromptSourceRefs: [] }, "explicit_improvement_trigger_required"],
    [{ classification: "protected_invariant_bypass", diagnosedAction: "stop_blocked", protectedInvariantBypassRequested: true }, "protected_invariant_bypass_blocked"],
  ] as const)("blocks an invalid or forbidden improvement trigger %o", (triggerOverrides, reasonCode) => {
    expect(authorize({ harness: harness({ trigger: { ...harness().trigger, ...triggerOverrides } }) })).toEqual({
      status: "blocked",
      reasonCode,
    })
  })

  it.each([
    [{ harness: harness({ controllingHarnessFingerprint: "harness:inactive" }) }, "inactive_harness_control"],
    [{ harness: harness({ attempt: 0 }) }, "attempt_limit_invalid"],
    [{ harness: harness({ attempt: 2, priorProposalFingerprints: ["proposal:v1"] }) }, "proposal_repeat_detected"],
    [{ harness: harness({ expiresAt: now }) }, "harness_receipt_expired"],
    [{ harness: harness({ passedInvariants: RECURSIVE_PROMPT_BEHAVIOR_INVARIANTS.slice(1) }) }, "behavior_invariant_incomplete"],
    [{ harness: harness({ regressionReceiptRefs: [] }) }, "regression_receipt_missing"],
    [{ harness: harness({ rollbackRef: "" }) }, "rollback_missing"],
    [{ agentAuthorization: { status: "blocked", reasonCode: "scope_not_owned" } }, "agent_authorization_blocked"],
    [{ behaviorGate: { status: "blocked", reasonCode: "invariant_not_preserved" } }, "behavior_gate_blocked"],
    [{ sourceApplication: { status: "blocked", reasonCode: "main_review_missing" } }, "source_application_blocked"],
    [{ expectedInvariantReviewFingerprint: "invariants:other" }, "proposal_scope_mismatch"],
  ] as const)("blocks an incomplete or mismatched gate %o", (overrides, reasonCode) => {
    expect(authorize(overrides)).toEqual({ status: "blocked", reasonCode })
  })

  it("treats attempt count as telemetry and relies on changed proposal evidence", () => {
    expect(authorize({ harness: harness({ attempt: 10_000, maxAttempts: 3 }) })).toEqual({
      status: "authorized",
      harnessRunId: "harness:run:1",
      proposalFingerprint: "proposal:v1",
      sourceSetFingerprint: "sources:v1",
    })
    expect(authorize({
      harness: harness({ attempt: 10_000, maxAttempts: 3, priorProposalFingerprints: ["proposal:v1"] }),
    })).toEqual({ status: "blocked", reasonCode: "proposal_repeat_detected" })
  })

  it("does not invoke the write adapter unless every gate is authorized", async () => {
    const write = vi.fn(async () => "saved")
    await expect(writeRecursivePromptImprovement({
      decision: authorize({ behaviorGate: { status: "blocked", reasonCode: "invariant_not_preserved" } }), write,
    })).resolves.toEqual({ status: "blocked", reasonCode: "behavior_gate_blocked" })
    expect(write).not.toHaveBeenCalled()
    await expect(writeRecursivePromptImprovement({ decision: authorize(), write })).resolves.toEqual({ status: "written", result: "saved" })
    expect(write).toHaveBeenCalledTimes(1)
  })

  it("keeps the composite policy independent from adapters and runtime globals", () => {
    const text = readFileSync(new URL("../packages/core/src/contracts/recursive-prompt-improvement-gate.ts", import.meta.url), "utf8")
    expect(text).not.toMatch(/from ["'](?:node:|better-sqlite3|mqtt|openai|@anthropic-ai\/sdk)/)
    expect(text).not.toMatch(/process\.env|Date\.now|fetch\(|readFile|writeFile|globalThis/)
  })
})
