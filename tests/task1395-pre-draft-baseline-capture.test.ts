import { describe, expect, it, vi } from "vitest"
import {
  PROMPT_IMPROVEMENT_BASELINE_ROLLBACK_SOURCE_TYPES,
  REQUIRED_PROMPT_IMPROVEMENT_REGRESSION_AREAS,
  authorizePromptImprovementBaselineCapture,
  draftFromAuthorizedPromptImprovementBaseline,
  type PromptImprovementBaselineCaptureInput,
} from "../packages/core/src/contracts/prompt-improvement-baseline-capture.ts"
import { REQUIRED_HARNESS_GUARDRAILS } from "../packages/core/src/memory/prompt-improvement-harness.ts"

const checksum = (character: string) => `sha256:${character.repeat(64)}`

function promptInput(): PromptImprovementBaselineCaptureInput {
  return {
    runId: "run:baseline:1",
    actor: "마당쇠",
    triggerSource: "user_request",
    changeKind: "prompt",
    capturedAt: 100,
    draftRequestedAt: 101,
    targetPromptSources: ["prompt:identity"],
    targetHarnessSources: [],
    sourceBaselines: [{
      sourceRef: "prompt:identity",
      sourceKind: "prompt",
      baselineVersion: "identity:v4",
      beforeChecksum: checksum("a"),
      summary: "Defines the main-agent identity and self-name boundary.",
      summarySourceRefs: ["prompt:identity"],
      capturedAt: 100,
      sourceLastModifiedAt: 99,
      evidenceRef: "evidence:source:identity:v4",
    }],
    activeHarness: {
      version: "harness:v9",
      checksum: checksum("b"),
      controllingChecksum: checksum("b"),
      capturedAt: 100,
      evidenceRef: "evidence:harness:v9",
    },
    affectedAreas: ["identity", "prompt_activation"],
    invariantSnapshots: [
      { area: "identity", invariantRef: "invariant:identity:v2", evidenceRef: "evidence:invariant:identity:v2" },
      { area: "prompt_activation", invariantRef: "invariant:activation:v3", evidenceRef: "evidence:invariant:activation:v3" },
    ],
    regressionTests: [
      { area: "identity", testRef: "tests/main-agent-identity.test.ts", evidenceRef: "evidence:test:identity" },
      { area: "prompt_activation", testRef: "tests/prompt-activation.test.ts", evidenceRef: "evidence:test:activation" },
    ],
    harnessGuardrails: [],
    activationState: "unchanged",
    rollbackTargets: [{
      targetSourceRef: "prompt:identity",
      targetBaselineVersion: "identity:v4",
      targetBaselineChecksum: checksum("a"),
      sourceType: "prompt_registry_version",
      sourceRef: "prompt-registry:identity:v4",
      executorId: "rollback:prompt-registry",
      verificationMethod: "registry_readback",
      evidenceRef: "evidence:rollback:identity:v4",
    }],
  }
}

function harnessInput(): PromptImprovementBaselineCaptureInput {
  const input = promptInput()
  return {
    ...input,
    changeKind: "harness",
    targetPromptSources: [],
    targetHarnessSources: ["harness:state-machine"],
    sourceBaselines: [{
      ...input.sourceBaselines[0]!,
      sourceRef: "harness:state-machine",
      sourceKind: "harness",
      baselineVersion: "harness-state-machine:v9",
      beforeChecksum: checksum("c"),
      summary: "Defines recursive-improvement states, events, and transitions.",
      summarySourceRefs: ["harness:state-machine"],
      evidenceRef: "evidence:source:harness-state-machine:v9",
    }],
    affectedAreas: [...REQUIRED_PROMPT_IMPROVEMENT_REGRESSION_AREAS],
    invariantSnapshots: REQUIRED_PROMPT_IMPROVEMENT_REGRESSION_AREAS.map((area) => ({
      area,
      invariantRef: `invariant:${area}:current`,
      evidenceRef: `evidence:invariant:${area}:current`,
    })),
    regressionTests: REQUIRED_PROMPT_IMPROVEMENT_REGRESSION_AREAS.map((area) => ({
      area,
      testRef: `tests/regression-${area}.test.ts`,
      evidenceRef: `evidence:test:${area}`,
    })),
    harnessGuardrails: REQUIRED_HARNESS_GUARDRAILS.map((guardrail) => ({
      guardrail,
      currentRuleRef: `harness-rule:${guardrail}:v9`,
      evidenceRef: `evidence:harness-rule:${guardrail}:v9`,
    })),
    rollbackTargets: [{
      ...input.rollbackTargets[0]!,
      targetSourceRef: "harness:state-machine",
      targetBaselineVersion: "harness-state-machine:v9",
      targetBaselineChecksum: checksum("c"),
      sourceType: "source_control_revision",
      sourceRef: "git:abc1234",
      executorId: "rollback:git",
      verificationMethod: "checksum_compare",
      evidenceRef: "evidence:rollback:harness-state-machine:v9",
    }],
  }
}

describe("task1395 pre-draft recursive-improvement baseline capture", () => {
  it("authorizes and freezes an exact prompt-source baseline before drafting", () => {
    const input = promptInput()
    const decision = authorizePromptImprovementBaselineCapture(input)

    expect(decision).toMatchObject({
      status: "authorized",
      receipt: {
        state: "baseline_captured",
        changeKind: "prompt",
        targetPromptSources: ["prompt:identity"],
        targetHarnessSources: [],
      },
    })
    if (decision.status !== "authorized") throw new Error(decision.reasonCode)
    expect(Object.isFrozen(decision.receipt)).toBe(true)
    expect(Object.isFrozen(decision.receipt.sourceBaselines)).toBe(true)
    expect(Object.isFrozen(decision.receipt.sourceBaselines[0])).toBe(true)
    input.sourceBaselines[0]!.summary = "mutated"
    expect(decision.receipt.sourceBaselines[0]!.summary).not.toBe("mutated")
  })

  it("authorizes a harness baseline only with the complete current guardrail snapshot", () => {
    const decision = authorizePromptImprovementBaselineCapture(harnessInput())
    expect(decision).toMatchObject({
      status: "authorized",
      receipt: {
        changeKind: "harness",
        targetHarnessSources: ["harness:state-machine"],
        harnessGuardrails: expect.arrayContaining(
          REQUIRED_HARNESS_GUARDRAILS.map((guardrail) => expect.objectContaining({ guardrail })),
        ),
      },
    })
  })

  it.each([
    ["missing target", (input: PromptImprovementBaselineCaptureInput) => { input.sourceBaselines = [] }, "source_baseline_coverage_invalid"],
    ["duplicate target", (input: PromptImprovementBaselineCaptureInput) => { input.sourceBaselines.push({ ...input.sourceBaselines[0]! }) }, "source_baseline_coverage_invalid"],
    ["extra target", (input: PromptImprovementBaselineCaptureInput) => { input.sourceBaselines.push({ ...input.sourceBaselines[0]!, sourceRef: "prompt:other", summarySourceRefs: ["prompt:other"] }) }, "source_baseline_coverage_invalid"],
    ["unrelated summary", (input: PromptImprovementBaselineCaptureInput) => { input.sourceBaselines[0]!.summarySourceRefs = ["prompt:identity", "prompt:other"] }, "source_summary_scope_invalid"],
    ["post-capture source write", (input: PromptImprovementBaselineCaptureInput) => { input.sourceBaselines[0]!.sourceLastModifiedAt = 101 }, "source_checksum_not_pre_write"],
    ["capture after draft", (input: PromptImprovementBaselineCaptureInput) => { input.draftRequestedAt = 100 }, "baseline_not_before_draft"],
  ])("blocks %s", (_name, mutate, reasonCode) => {
    const input = promptInput()
    mutate(input)
    expect(authorizePromptImprovementBaselineCapture(input)).toEqual({ status: "blocked", reasonCode })
  })

  it.each([
    ["missing harness", (input: PromptImprovementBaselineCaptureInput) => { input.activeHarness = undefined as never }, "active_harness_missing"],
    ["mismatched controlling checksum", (input: PromptImprovementBaselineCaptureInput) => { input.activeHarness.controllingChecksum = checksum("d") }, "active_harness_mismatch"],
    ["late harness capture", (input: PromptImprovementBaselineCaptureInput) => { input.activeHarness.capturedAt = 101 }, "active_harness_not_pre_draft"],
  ])("blocks an invalid active-harness baseline: %s", (_name, mutate, reasonCode) => {
    const input = promptInput()
    mutate(input)
    expect(authorizePromptImprovementBaselineCapture(input)).toEqual({ status: "blocked", reasonCode })
  })

  it("keeps harness-only fields out of prompt changes", () => {
    const input = promptInput()
    input.targetHarnessSources = ["harness:state-machine"]
    expect(authorizePromptImprovementBaselineCapture(input)).toEqual({
      status: "blocked", reasonCode: "harness_fields_not_allowed",
    })
  })

  it("captures only the unchanged pre-draft activation state", () => {
    const input = promptInput()
    ;(input as { activationState: string }).activationState = "activated"
    expect(authorizePromptImprovementBaselineCapture(input)).toEqual({
      status: "blocked", reasonCode: "activation_state_invalid",
    })
  })

  it("requires every current harness guardrail exactly once", () => {
    const missing = harnessInput()
    missing.harnessGuardrails.pop()
    expect(authorizePromptImprovementBaselineCapture(missing)).toEqual({
      status: "blocked", reasonCode: "harness_guardrail_coverage_invalid",
    })

    const duplicate = harnessInput()
    duplicate.harnessGuardrails.push({ ...duplicate.harnessGuardrails[0]! })
    expect(authorizePromptImprovementBaselineCapture(duplicate)).toEqual({
      status: "blocked", reasonCode: "harness_guardrail_coverage_invalid",
    })
  })

  it.each(["invariantSnapshots", "regressionTests"] as const)("requires exact affected-area coverage in %s", (field) => {
    const input = promptInput()
    input[field] = input[field].slice(1) as never
    expect(authorizePromptImprovementBaselineCapture(input)).toEqual({
      status: "blocked",
      reasonCode: field === "invariantSnapshots"
        ? "invariant_coverage_invalid"
        : "regression_test_coverage_invalid",
    })
  })

  it("derives the four pre-draft rollback types without weakening the broader rollback policy", () => {
    expect(PROMPT_IMPROVEMENT_BASELINE_ROLLBACK_SOURCE_TYPES).toEqual([
      "source_control_revision",
      "prompt_registry_version",
      "timestamped_backup_file",
      "reverse_patch",
    ])
  })

  it("requires exactly one rollback target for every exact source baseline", () => {
    const missing = promptInput()
    missing.rollbackTargets = []
    expect(authorizePromptImprovementBaselineCapture(missing)).toEqual({
      status: "blocked", reasonCode: "rollback_target_coverage_invalid",
    })

    const duplicate = promptInput()
    duplicate.rollbackTargets.push({ ...duplicate.rollbackTargets[0]! })
    expect(authorizePromptImprovementBaselineCapture(duplicate)).toEqual({
      status: "blocked", reasonCode: "rollback_target_coverage_invalid",
    })
  })

  it.each([
    ["release artifact", (input: PromptImprovementBaselineCaptureInput) => {
      input.rollbackTargets[0]!.sourceType = "release_artifact_version"
      input.rollbackTargets[0]!.sourceRef = "release:v0.3.0"
    }, "rollback_source_not_allowed"],
    ["baseline mismatch", (input: PromptImprovementBaselineCaptureInput) => { input.rollbackTargets[0]!.targetBaselineChecksum = checksum("f") }, "rollback_baseline_mismatch"],
    ["missing executor", (input: PromptImprovementBaselineCaptureInput) => { input.rollbackTargets[0]!.executorId = "" }, "rollback_executor_missing"],
    ["missing verification", (input: PromptImprovementBaselineCaptureInput) => { input.rollbackTargets[0]!.verificationMethod = "" }, "rollback_verification_missing"],
    ["missing evidence", (input: PromptImprovementBaselineCaptureInput) => { input.rollbackTargets[0]!.evidenceRef = "" }, "rollback_evidence_missing"],
  ])("blocks an unusable rollback target: %s", (_name, mutate, reasonCode) => {
    const input = promptInput()
    mutate(input)
    expect(authorizePromptImprovementBaselineCapture(input)).toEqual({ status: "blocked", reasonCode })
  })

  it("does not invoke proposal drafting without an authorized immutable receipt", async () => {
    const draft = vi.fn(async () => ({ proposalId: "proposal:1" }))
    const blocked = authorizePromptImprovementBaselineCapture({ ...promptInput(), sourceBaselines: [] })
    await expect(draftFromAuthorizedPromptImprovementBaseline({ decision: blocked, draft })).resolves.toEqual({
      status: "blocked", reasonCode: "baseline_not_authorized",
    })
    expect(draft).not.toHaveBeenCalled()

    const authorized = authorizePromptImprovementBaselineCapture(promptInput())
    await expect(draftFromAuthorizedPromptImprovementBaseline({ decision: authorized, draft })).resolves.toEqual({
      status: "drafted", result: { proposalId: "proposal:1" }, baseline: expect.objectContaining({ state: "baseline_captured" }),
    })
    expect(draft).toHaveBeenCalledTimes(1)
  })

  it("keeps the domain contract free of ambient environment, clock, and I/O access", async () => {
    const source = await import("node:fs/promises").then(({ readFile }) =>
      readFile("packages/core/src/contracts/prompt-improvement-baseline-capture.ts", "utf8"))
    expect(source).not.toMatch(/process\.env|Date\.now|readFile|writeFile|fetch\(|getDb\(/)
  })
})
