import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { writePromptSourceWithHarness } from "../packages/core/src/memory/knowbee-md.ts"
import type {
  PromptImprovementApprovalRecord,
  PromptImprovementHarnessInput,
} from "../packages/core/src/memory/prompt-improvement-harness.ts"

const tempDirs: string[] = []

function createPromptFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "knowbee-task0305-prompt-baseline-"))
  tempDirs.push(root)
  const promptsDir = join(root, "prompts")
  mkdirSync(promptsDir)
  writeFileSync(join(promptsDir, "identity.md"), "# Identity\n\nOriginal identity prompt\n", "utf-8")
  return root
}

function approvalRecord(): PromptImprovementApprovalRecord {
  return {
    approvedBy: "user:baseline-capture-test",
    approvedAt: "2026-07-04T00:00:00.000Z",
    approvalScope: ["apply_change"],
    targetPromptSources: ["identity:en"],
    targetHarnessSources: [],
    riskAccepted: "medium",
  }
}

function harnessInput(): PromptImprovementHarnessInput {
  return {
    improvementGoal: "Capture prompt baseline before writing identity.",
    improvementKind: "prompt_source",
    improvingAgentName: "노비",
    improvingAgentType: "main",
    parentReviewerAgentName: "",
    triggerSource: "user_request",
    targetPromptSources: ["identity:en"],
    activeHarnessVersion: "prompt_improvement.md:sha256:baseline-test",
    targetHarnessSources: [],
    agentOwnedPromptScope: ["identity"],
    currentBehavior: "Identity prompt currently contains the original behavior.",
    desiredBehavior: "Identity prompt contains the approved update.",
    userReactionEvidence: ["User explicitly requested the baseline capture test."],
    responseStrategyTarget: "identity",
    harnessChangeScope: [],
    harnessGuardrailsToPreserve: [],
    nonGoals: ["Do not change other prompt sources."],
    allowedChangeScope: ["identity:en"],
    requiredInvariants: ["identity", "prompt_visibility"],
    requiredTests: ["tests/task0305-prompt-harness-baseline-capture.test.ts"],
    approvalMode: "user_required",
    approvalRecord: approvalRecord(),
    rollbackPlan: "Restore prompts/final_response.md from backup:final_response:v1.",
  }
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task0305 prompt harness baseline capture", () => {
  it("records pre-write checksum, active harness version, tests, invariants, and rollback target", () => {
    const root = createPromptFixture()
    const result = writePromptSourceWithHarness({
      workDir: root,
      sourceId: "identity",
      locale: "en",
      content: "# Identity\n\nApproved identity update\n",
      harnessInput: harnessInput(),
    })

    const baseline = result.harnessReport.baselineCapture
    expect(baseline).toMatchObject({
      runId: result.harnessReport.runId,
      actor: "노비",
      triggerSource: "user_request",
      targetPromptSources: ["identity:en"],
      activeHarnessVersion: "prompt_improvement.md:sha256:baseline-test",
      targetHarnessSources: [],
      currentPromptSummary: "Identity prompt currently contains the original behavior.",
      knownRegressionTests: ["tests/task0305-prompt-harness-baseline-capture.test.ts"],
      currentInvariants: ["identity", "prompt_visibility"],
      activationState: "activation_pending",
    })
    expect(baseline.sourceChecksums).toEqual([{ sourceRef: "identity:en", beforeChecksum: result.diff.beforeChecksum }])
    expect(baseline.rollbackTarget).toBe(result.backup?.backupPath)
    expect(baseline.rollbackTarget && existsSync(baseline.rollbackTarget)).toBe(true)
    expect(readFileSync(result.backup!.backupPath, "utf-8")).toContain("Original identity prompt")
  })
})
