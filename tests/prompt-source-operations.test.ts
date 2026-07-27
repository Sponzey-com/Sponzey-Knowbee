import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  buildPromptSourceContentDiff,
  checkPromptSourceLocaleParity,
  dryRunPromptSourceAssembly,
  loadPromptSourceRegistry,
  PromptSourceHarnessValidationError,
  rollbackPromptSourceBackup,
  writePromptSourceWithHarness,
  writePromptSourceWithBackup,
} from "../packages/core/src/memory/knowbee-md.ts"
import type {
  PromptImprovementApprovalRecord,
  PromptImprovementHarnessInput,
} from "../packages/core/src/memory/prompt-improvement-harness.ts"

const tempDirs: string[] = []

function createPromptFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "knowbee-prompt-ops-"))
  tempDirs.push(root)
  const promptsDir = join(root, "prompts")
  mkdirSync(promptsDir)
  for (const [filename, title] of [
    ["definitions.md", "Definitions"],
    ["identity.md", "Identity"],
    ["user.md", "User"],
    ["soul.md", "Soul"],
    ["planner.md", "Planner"],
    ["knowbee-execution.md", "Knowbee Execution Decision Policy"],
    ["memory_policy.md", "Memory Policy"],
    ["tool_policy.md", "Tool Policy"],
    ["recovery_policy.md", "Recovery Policy"],
    ["topology_executor_policy.md", "Topology Executor Policy"],
    ["completion_policy.md", "Completion Policy"],
    ["output_policy.md", "Output Policy"],
    ["channel.md", "Channel Policy"],
    ["bootstrap.md", "Bootstrap"],
  ] as const) {
    writeFileSync(join(promptsDir, filename), `# ${title}\n\n## 기준\n\n${filename} content\n`, "utf-8")
  }
  return root
}

function approvalRecord(overrides: Partial<PromptImprovementApprovalRecord> = {}): PromptImprovementApprovalRecord {
  return {
    approvedBy: "user:prompt-source-editor",
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
    improvementGoal: "Clarify identity prompt behavior.",
    improvementKind: "prompt_source",
    improvingAgentName: "노비",
    improvingAgentType: "main",
    parentReviewerAgentName: "",
    triggerSource: "user_request",
    targetPromptSources: ["identity:en"],
    activeHarnessVersion: "prompt_improvement.md:sha256:test",
    targetHarnessSources: [],
    agentOwnedPromptScope: ["identity"],
    currentBehavior: "Identity source needs a concise rule.",
    desiredBehavior: "Identity source contains the concise rule.",
    userReactionEvidence: ["User explicitly requested prompt update."],
    responseStrategyTarget: "identity",
    harnessChangeScope: [],
    harnessGuardrailsToPreserve: [],
    nonGoals: ["Do not change tool policy."],
    allowedChangeScope: ["identity:en"],
    requiredInvariants: ["identity", "user_language"],
    requiredTests: ["tests/prompt-source-operations.test.ts"],
    approvalMode: "user_required",
    approvalRecord: approvalRecord(),
    rollbackPlan: "Restore identity:en from backup:identity:v1.",
    ...overrides,
  }
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("prompt source operations", () => {
  it("builds prompt diffs and dry-run assembly order without executing a run", () => {
    const root = createPromptFixture()
    const diff = buildPromptSourceContentDiff("# A\nold\n", "# A\nnew\nadded\n")

    expect(diff.changed).toBe(true)
    expect(diff.lines).toEqual(expect.arrayContaining([
      { kind: "changed", beforeLine: 2, afterLine: 2, before: "old", after: "new" },
      { kind: "added", afterLine: 3, after: "added" },
    ]))

    const dryRun = dryRunPromptSourceAssembly(root)
    expect(dryRun.assembly?.snapshot.sources.map((source) => source.sourceId)).toEqual([
      "definitions",
      "identity",
      "user",
      "tool_policy",
      "memory_policy",
      "soul",
      "planner",
      "knowbee_execution",
      "recovery_policy",
      "topology_executor_policy",
      "completion_policy",
      "output_policy",
      "channel",
    ])
    expect(dryRun.sourceOrder[0]).toMatchObject({ sourceId: "definitions", locale: "en" })
    expect(dryRun.totalChars).toBeGreaterThan(0)
  })

  it("writes prompt source changes with backup and rolls back to the previous checksum", () => {
    const root = createPromptFixture()
    const promptPath = join(root, "prompts", "identity.md")
    const beforeContent = readFileSync(promptPath, "utf-8")

    const writeResult = writePromptSourceWithBackup({
      workDir: root,
      sourceId: "identity",
      locale: "en",
      content: "# Identity\n\n## Rules\n\nUser edited copy\n",
    })

    expect(writeResult.backup).toBeTruthy()
    expect(writeResult.source.checksum).toBe(writeResult.diff.afterChecksum)
    expect(writeResult.diff.beforeChecksum).not.toBe(writeResult.diff.afterChecksum)
    expect(writeResult.backup?.backupPath && existsSync(writeResult.backup.backupPath)).toBe(true)
    expect(readFileSync(promptPath, "utf-8")).toContain("User edited copy")

    const rollback = rollbackPromptSourceBackup({
      sourcePath: writeResult.backup!.sourcePath,
      backupPath: writeResult.backup!.backupPath,
    })

    expect(rollback.restoredChecksum).toBe(writeResult.diff.beforeChecksum)
    expect(rollback.previousChecksum).toBe(writeResult.diff.afterChecksum)
    expect(readFileSync(promptPath, "utf-8")).toBe(beforeContent)
  })

  it("gates prompt source writes with harness validation", () => {
    const root = createPromptFixture()
    const promptPath = join(root, "prompts", "identity.md")
    const beforeContent = readFileSync(promptPath, "utf-8")

    expect(() => writePromptSourceWithHarness({
      workDir: root,
      sourceId: "identity",
      locale: "en",
      content: "# Identity\n\n## Rules\n\nInvalid write\n",
      harnessInput: { improvementKind: "prompt_source" },
    })).toThrow(PromptSourceHarnessValidationError)
    expect(readFileSync(promptPath, "utf-8")).toBe(beforeContent)

    const mutableSourceAudit: unknown[] = []
    const result = writePromptSourceWithHarness({
      workDir: root,
      sourceId: "identity",
      locale: "en",
      content: "# Identity\n\n## Rules\n\nHarness-approved copy\n",
      harnessInput: harnessInput(),
      recordMutableSourceAudit: (record) => mutableSourceAudit.push(record),
    })

    expect(result.harnessValidation.ok).toBe(true)
    expect(result.sourceWriteState).toBe("written")
    expect(result.activationState).toBe("activation_pending")
    expect(result.backup).toBeTruthy()
    expect(result.harnessReport.baselineCapture.sourceChecksums).toEqual([
      { sourceRef: "identity:en", beforeChecksum: result.diff.beforeChecksum },
    ])
    expect(result.harnessReport.baselineCapture.activeHarnessVersion).toBe("prompt_improvement.md:sha256:test")
    expect(result.harnessReport.baselineCapture.rollbackTarget).toBe(result.backup?.backupPath)
    expect(mutableSourceAudit).toEqual([expect.objectContaining({
      event: "prompt_improvement.mutable_source_execution",
      sourceKind: "prompt_registry_record",
      sourceRef: "identity:en",
      writerKind: "prompt_registry_record",
      decision: "applied",
      reasonCode: null,
    })])
    expect(readFileSync(promptPath, "utf-8")).toContain("Harness-approved copy")
  })

  it("rejects unsafe source writes and reports locale parity gaps", () => {
    const root = createPromptFixture()
    expect(() => writePromptSourceWithBackup({
      workDir: root,
      sourceId: "identity",
      locale: "en",
      content: "# identity\n\napi_key = sk-abcdefghijklmnopqrstuvwxyz123456",
    })).toThrow(/secret-like/iu)

    rmSync(join(root, "prompts", "planner.md"))
    const parity = checkPromptSourceLocaleParity(root)
    expect(parity.ok).toBe(false)
    expect(parity.issues).toContainEqual({
      sourceId: "planner",
      code: "missing_locale",
      locale: "en",
      message: "planner is missing English source",
    })
    expect(loadPromptSourceRegistry(root).some((source) => source.sourceId === "identity")).toBe(true)
  })

  it("rejects actual ambiguous, overloaded, and duplicate prompt content before writing", () => {
    const root = createPromptFixture()
    const promptPath = join(root, "prompts", "identity.md")
    const beforeContent = readFileSync(promptPath, "utf-8")
    const invalidContents = [
      "# Identity\n\n- Handle requests appropriately.\n",
      `# Identity\n\n- ${"x".repeat(301)}\n`,
      "# Identity\n\n- Use the configured agent name.\n- Use the configured agent name.\n",
    ]

    for (const content of invalidContents) {
      expect(() => writePromptSourceWithHarness({
        workDir: root,
        sourceId: "identity",
        locale: "en",
        content,
        harnessInput: harnessInput(),
      })).toThrow(/prompt source quality validation failed/iu)
      expect(readFileSync(promptPath, "utf-8")).toBe(beforeContent)
    }
  })
})
