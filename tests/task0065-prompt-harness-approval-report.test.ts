import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  PromptSourceHarnessValidationError,
  writePromptSourceWithHarness,
} from "../packages/core/src/memory/knowbee-md.ts"
import type {
  PromptImprovementApprovalRecord,
  PromptImprovementHarnessInput,
} from "../packages/core/src/memory/prompt-improvement-harness.ts"

const tempDirs: string[] = []

function createPromptFixture(): { root: string; identityPath: string } {
  const root = mkdtempSync(join(tmpdir(), "knowbee-task0065-prompt-harness-"))
  tempDirs.push(root)
  const promptsDir = join(root, "prompts")
  mkdirSync(promptsDir)
  const identityPath = join(promptsDir, "identity.md")
  writeFileSync(identityPath, "# Identity\n\nOriginal identity prompt\n", "utf-8")
  return { root, identityPath }
}

function approvalRecord(overrides: Partial<PromptImprovementApprovalRecord> = {}): PromptImprovementApprovalRecord {
  return {
    approvedBy: "admin:prompt-source-editor",
    approvedAt: "2026-07-04T00:00:00.000Z",
    approvalScope: ["apply_change"],
    targetPromptSources: ["identity:en"],
    targetHarnessSources: [],
    riskAccepted: "medium",
    ...overrides,
  }
}

function harnessInput(overrides: Partial<PromptImprovementHarnessInput> = {}): PromptImprovementHarnessInput {
  return {
    improvementGoal: "Save reviewed identity prompt source.",
    improvementKind: "prompt_source",
    improvingAgentName: "Knowbee",
    improvingAgentType: "main",
    parentReviewerAgentName: "",
    triggerSource: "admin_request",
    targetPromptSources: ["identity:en"],
    activeHarnessVersion: "prompt_improvement.md:sha256:active",
    targetHarnessSources: [],
    agentOwnedPromptScope: ["identity"],
    currentBehavior: "The active prompt source draft differs from the saved prompt source.",
    desiredBehavior: "The reviewed prompt source is saved.",
    userReactionEvidence: ["User explicitly submitted the write route."],
    responseStrategyTarget: "identity",
    harnessChangeScope: [],
    harnessGuardrailsToPreserve: [],
    nonGoals: ["Do not change unrelated prompt sources."],
    allowedChangeScope: ["identity:en"],
    requiredInvariants: ["identity", "safety"],
    requiredTests: ["tests/task0065-prompt-harness-approval-report.test.ts"],
    approvalMode: "admin_required",
    approvalRecord: approvalRecord(),
    rollbackPlan: "Restore identity:en from the generated prompt backup.",
    ...overrides,
  }
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task0065 prompt harness approval and activation report", () => {
  it("rejects approval-required prompt writes without an approval record", () => {
    const { root, identityPath } = createPromptFixture()
    const before = readFileSync(identityPath, "utf-8")

    try {
      writePromptSourceWithHarness({
        workDir: root,
        sourceId: "identity",
        locale: "en",
        content: "# Identity\n\nUnauthorized change\n",
        harnessInput: harnessInput({ approvalRecord: undefined }),
      })
      throw new Error("expected harness validation to fail")
    } catch (error) {
      expect(error).toBeInstanceOf(PromptSourceHarnessValidationError)
      if (error instanceof PromptSourceHarnessValidationError) {
        expect(error.decision).toMatchObject({ state: "blocked", missingFields: ["approvalRecord"] })
        expect(error.validation.issues).toContainEqual(expect.objectContaining({
          code: "approval_record_missing",
          path: "approvalRecord",
        }))
      }
    }

    expect(readFileSync(identityPath, "utf-8")).toBe(before)
  })

  it("rejects approval records that do not approve applying the target source change", () => {
    const { root, identityPath } = createPromptFixture()
    const before = readFileSync(identityPath, "utf-8")

    try {
      writePromptSourceWithHarness({
        workDir: root,
        sourceId: "identity",
        locale: "en",
        content: "# Identity\n\nWrong approval scope\n",
        harnessInput: harnessInput({
          approvalRecord: approvalRecord({
            approvalScope: ["draft"],
            targetPromptSources: ["final_response:en"],
          }),
        }),
      })
      throw new Error("expected harness validation to fail")
    } catch (error) {
      expect(error).toBeInstanceOf(PromptSourceHarnessValidationError)
      if (error instanceof PromptSourceHarnessValidationError) {
        expect(error.validation.issues).toEqual(expect.arrayContaining([
          expect.objectContaining({ code: "approval_scope_missing", path: "approvalRecord.approvalScope" }),
          expect.objectContaining({ code: "approval_target_mismatch", path: "approvalRecord.targetPromptSources" }),
        ]))
      }
    }

    expect(readFileSync(identityPath, "utf-8")).toBe(before)
  })

  it("returns an activation-pending harness report after a valid source write", () => {
    const { root, identityPath } = createPromptFixture()

    const result = writePromptSourceWithHarness({
      workDir: root,
      sourceId: "identity",
      locale: "en",
      content: "# Identity\n\nApproved harness change\n",
      harnessInput: harnessInput(),
    })

    expect(result.harnessValidation.ok).toBe(true)
    expect(result.sourceWriteState).toBe("written")
    expect(result.activationState).toBe("activation_pending")
    expect(result.harnessReport).toMatchObject({
      actor: "Knowbee",
      triggerSource: "admin_request",
      state: "activation_pending",
      targetPromptSources: ["identity:en"],
      changedPromptSources: ["identity:en"],
      riskLevel: "medium",
      approvalRecord: {
        mode: "admin_required",
        required: true,
        granted: true,
        approvedBy: "admin:prompt-source-editor",
      },
      testsRequested: ["tests/task0065-prompt-harness-approval-report.test.ts"],
      activationState: "activation_pending",
      rollbackState: "backup_available",
    })
    expect(result.harnessReport.runId).toMatch(/^prompt-improvement:/u)
    expect(result.harnessReport.rollbackPlan).toContain("backup")
    expect(readFileSync(identityPath, "utf-8")).toContain("Approved harness change")
  })

  it("blocks an actual source write outside the validated target snapshot", () => {
    const { root, identityPath } = createPromptFixture()
    const before = readFileSync(identityPath, "utf-8")

    expect(() => writePromptSourceWithHarness({
      workDir: root,
      sourceId: "identity",
      locale: "ko",
      content: "# Identity\n\nOut-of-scope change\n",
      harnessInput: harnessInput(),
    })).toThrow(PromptSourceHarnessValidationError)

    try {
      writePromptSourceWithHarness({
        workDir: root,
        sourceId: "identity",
        locale: "ko",
        content: "# Identity\n\nOut-of-scope change\n",
        harnessInput: harnessInput(),
      })
    } catch (error) {
      expect(error).toBeInstanceOf(PromptSourceHarnessValidationError)
      if (error instanceof PromptSourceHarnessValidationError) {
        expect(error.validation.issues).toContainEqual(expect.objectContaining({
          code: "source_write_target_mismatch",
          path: "sourceId",
        }))
      }
    }
    expect(readFileSync(identityPath, "utf-8")).toBe(before)
  })
})
