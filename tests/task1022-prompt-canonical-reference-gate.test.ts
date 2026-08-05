import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  GOAL_REVIEW_GATE_REQUIRED_KEYS,
  validateGoalReviewGateReport,
  type GoalReviewGateReport,
} from "../packages/core/src/contracts/goal-review-gate.ts"
import { ensurePromptSourceFiles } from "../packages/core/src/memory/knowbee-md.ts"
import { runPromptSourceRegression } from "../packages/core/src/memory/prompt-regression.ts"

const tempDirs: string[] = []

function item(key: string): GoalReviewGateReport["promptSources"][number] {
  return {
    key,
    passed: true,
    evidenceRefs: [`evidence:${key}`],
  }
}

function completeReport(): GoalReviewGateReport {
  return {
    documentStructure: GOAL_REVIEW_GATE_REQUIRED_KEYS.documentStructure.map((key) => item(key)),
    behaviorInvariants: GOAL_REVIEW_GATE_REQUIRED_KEYS.behaviorInvariants.map((key) => item(key)),
    promptSources: GOAL_REVIEW_GATE_REQUIRED_KEYS.promptSources.map((key) => item(key)),
    harness: GOAL_REVIEW_GATE_REQUIRED_KEYS.harness.map((key) => item(key)),
    operations: GOAL_REVIEW_GATE_REQUIRED_KEYS.operations.map((key) => item(key)),
  }
}

function createSeededPromptRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "knowbee-task1022-prompt-reference-"))
  tempDirs.push(root)
  ensurePromptSourceFiles(root)
  return root
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task1022 prompt canonical reference gate", () => {
  it("requires prompt canonical reference evidence in GOAL review reports", () => {
    expect(GOAL_REVIEW_GATE_REQUIRED_KEYS.promptSources).toContain("prompt_canonical_reference")

    const report = completeReport()
    report.promptSources = report.promptSources
      .filter((gate) => gate.key !== "prompt_canonical_reference")

    const result = validateGoalReviewGateReport(report)

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "review_gate_missing",
      category: "promptSources",
      key: "prompt_canonical_reference",
      path: "promptSources.prompt_canonical_reference",
    }))
  })

  it("fails prompt regression when a module copies another module's detailed rule instead of referencing it", () => {
    const root = createSeededPromptRoot()
    const plannerPath = join(root, "prompts", "planner.md")
    writeFileSync(
      plannerPath,
      [
        readFileSync(plannerPath, "utf-8"),
        "Organize settings around user tasks and outcomes, not internal module names, database fields, graph schemas, or runtime implementation boundaries.",
      ].join("\n"),
      "utf-8",
    )

    const result = runPromptSourceRegression(root, { locales: ["en"] })

    expect(result.ok).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "ui_policy_detail_outside_ui_policy",
        sourceId: "planner",
        locale: "en",
      }),
    ]))
  })
})
