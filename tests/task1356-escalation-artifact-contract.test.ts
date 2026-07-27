import { describe, expect, it, vi } from "vitest"
import {
  executeValidatedEscalationArtifact,
  validatePromptImprovementEscalationArtifact,
  type CodeChangeProposalArtifact,
  type EscalationTestPlanArtifact,
  type PromptInvestigationArtifact,
} from "../packages/core/src/memory/prompt-improvement-escalation.ts"

const base = { workPackageId: "work:1356", ownerAgentName: "노비", artifactFingerprint: "sha256:artifact", predecessorFingerprint: null }
const investigation: PromptInvestigationArtifact = {
  ...base, stage: "prompt_investigation", observedBehavior: "Retry transition is absent.", promptEvidence: ["trace:run:42"],
  limitationReason: "The prompt is parsed correctly; runtime code ignores it.", affectedPromptSources: ["prompts/recovery_policy.md"],
}
const proposal: CodeChangeProposalArtifact = {
  ...base, stage: "code_change_proposal", predecessorFingerprint: investigation.artifactFingerprint,
  exactCodeBoundary: ["packages/core/src/runs/retry.ts"], changeIntent: "Honor the parsed retry decision.", risk: "medium",
  rollbackPlan: "Revert commit:retry-v2.", approvalRequired: true,
}
const testPlan: EscalationTestPlanArtifact = {
  ...base, stage: "test_plan", predecessorFingerprint: proposal.artifactFingerprint,
  implementationScope: ["packages/core/src/runs/retry.ts"], originalFailure: "No retry transition.", expectedBehavior: "One bounded retry occurs.",
  regressionCommands: ["pnpm test tests/retry.test.ts"], rollbackVerification: "Re-run the failure fixture after rollback.",
}

function validate(artifact: Partial<PromptInvestigationArtifact | CodeChangeProposalArtifact | EscalationTestPlanArtifact>, predecessor: string | null, scope?: string[]) {
  return validatePromptImprovementEscalationArtifact({ artifact, expectedWorkPackageId: "work:1356", expectedOwnerAgentName: "노비", expectedPredecessorFingerprint: predecessor, approvedImplementationScope: scope })
}

describe("task1356 escalation artifact contract", () => {
  it("validates a complete prompt investigation report", () => {
    expect(validate(investigation, null)).toMatchObject({ status: "ready", artifact: { stage: "prompt_investigation", affectedPromptSources: ["prompts/recovery_policy.md"] } })
  })

  it("validates a code proposal only after the verified investigation fingerprint", () => {
    expect(validate(proposal, investigation.artifactFingerprint)).toMatchObject({ status: "ready", artifact: { stage: "code_change_proposal", approvalRequired: true } })
    expect(validate(proposal, "sha256:other")).toEqual({ status: "blocked", reasonCode: "artifact_lineage_mismatch" })
  })

  it("validates a test plan only for the exact approved implementation scope", () => {
    expect(validate(testPlan, proposal.artifactFingerprint, proposal.exactCodeBoundary)).toMatchObject({ status: "ready", artifact: { stage: "test_plan" } })
    expect(validate(testPlan, proposal.artifactFingerprint, ["packages/core/src/runs/other.ts"]))
      .toEqual({ status: "blocked", reasonCode: "artifact_scope_invalid" })
  })

  it.each([
    [{ ...investigation, promptEvidence: [] }, null],
    [{ ...proposal, rollbackPlan: "" }, investigation.artifactFingerprint],
    [{ ...testPlan, regressionCommands: [] }, proposal.artifactFingerprint],
  ] as const)("blocks incomplete escalation artifact before downstream execution", async (artifact, predecessor) => {
    const execute = vi.fn()
    const decision = validate(artifact, predecessor, proposal.exactCodeBoundary)
    expect(decision).toEqual({ status: "blocked", reasonCode: "artifact_required_field_missing" })
    await expect(executeValidatedEscalationArtifact({ decision, execute })).resolves.toEqual(decision)
    expect(execute).not.toHaveBeenCalled()
  })
})
