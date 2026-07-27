import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import {
  evaluateBlockedStopReportDecision,
  executeContinuingAction,
  type ExhaustedSolutionPathReceipt,
} from "../packages/core/src/index.ts"

const exhausted: ExhaustedSolutionPathReceipt = {
  receiptId: "diagnosis:1",
  complete: true,
  canFinalizeFailure: true,
  missingPaths: [],
  evidenceRefs: ["path-review:all"],
  partialResultRefs: ["result:partial"],
  workaroundGuidance: ["Install the required integration and retry."],
}

describe("task1248 terminal blocking decision", () => {
  it("stops for an evidenced permission denial only after safe paths are exhausted", () => {
    expect(evaluateBlockedStopReportDecision({
      goalId: "goal:1",
      exhaustion: exhausted,
      unresolvedItemIds: ["step:write"],
      permissionDenial: {
        permissionKind: "filesystem_write",
        targetRef: "target:workspace",
        decisionSource: "user",
        evidenceRefs: ["approval:denied"],
        safeAlternativePathIds: [],
      },
    })).toMatchObject({
      status: "stop_and_report",
      reasonCode: "permission_denied",
      reportInput: { partialResultRefs: ["result:partial"], unresolvedItemIds: ["step:write"] },
    })
  })

  it("continues when a safe lower-permission path or an unreviewed path remains", () => {
    expect(evaluateBlockedStopReportDecision({
      goalId: "goal:1",
      exhaustion: exhausted,
      unresolvedItemIds: ["step:write"],
      permissionDenial: { permissionKind: "admin", targetRef: "target:host", decisionSource: "policy", evidenceRefs: ["policy:deny"], safeAlternativePathIds: ["tool:read_only"] },
    })).toEqual({ status: "continue", reasonCode: "solution_paths_remaining", remainingPathIds: ["tool:read_only"] })

    expect(evaluateBlockedStopReportDecision({
      goalId: "goal:1",
      exhaustion: { ...exhausted, complete: false, canFinalizeFailure: false, missingPaths: ["direct_answer"] },
      unresolvedItemIds: ["step:write"],
    })).toEqual({ status: "continue", reasonCode: "solution_paths_remaining", remainingPathIds: ["direct_answer"] })
  })

  it("distinguishes recoverable conditions from evidenced concrete impossibility", () => {
    expect(evaluateBlockedStopReportDecision({
      goalId: "goal:1", exhaustion: exhausted, unresolvedItemIds: ["step:remote"],
      impossibility: { reasonCode: "instance_offline", verifiedFacts: ["Target heartbeat is absent."], evidenceRefs: ["fleet:snapshot"], recoverable: true, requiredChanges: ["Bring the target online."] },
    })).toEqual({ status: "blocked_pending_input", reasonCode: "recoverable_condition", requiredChanges: ["Bring the target online."] })

    expect(evaluateBlockedStopReportDecision({
      goalId: "goal:1", exhaustion: exhausted, unresolvedItemIds: ["step:remote"],
      impossibility: { reasonCode: "target_removed", verifiedFacts: ["The target no longer exists."], evidenceRefs: ["fleet:tombstone"], recoverable: false, requiredChanges: [] },
    })).toMatchObject({ status: "stop_and_report", reasonCode: "concrete_impossibility" })
  })

  it("rejects unevidenced impossibility and permission claims", () => {
    expect(() => evaluateBlockedStopReportDecision({
      goalId: "goal:1", exhaustion: exhausted, unresolvedItemIds: ["step:1"],
      impossibility: { reasonCode: "unknown", verifiedFacts: [], evidenceRefs: [], recoverable: false, requiredChanges: [] },
    })).toThrow(/verified facts and evidence/i)
    expect(() => evaluateBlockedStopReportDecision({
      goalId: "goal:1", exhaustion: exhausted, unresolvedItemIds: ["step:1"],
      permissionDenial: { permissionKind: "write", targetRef: "target:1", decisionSource: "operating_system", evidenceRefs: [], safeAlternativePathIds: [] },
    })).toThrow(/requires evidence/i)
  })

  it("does not execute another action after terminal exhaustion", async () => {
    const decision = evaluateBlockedStopReportDecision({ goalId: "goal:1", exhaustion: exhausted, unresolvedItemIds: ["step:1"] })
    const execute = vi.fn(async () => "ran")
    await expect(executeContinuingAction({ decision, execute })).resolves.toMatchObject({ status: "stop_and_report", reasonCode: "solution_paths_exhausted" })
    expect(execute).not.toHaveBeenCalled()
  })

  it("keeps the terminal blocking decision independent from infrastructure", () => {
    const source = readFileSync(new URL("../packages/core/src/contracts/stop-report-decision.ts", import.meta.url), "utf8")
    expect(source).not.toMatch(/process\.env|Date\.now|fetch\(|readFile|writeFile|globalThis/)
  })
})
