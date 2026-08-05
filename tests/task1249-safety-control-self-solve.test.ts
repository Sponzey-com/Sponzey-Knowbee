import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import {
  evaluateSafetyRisk,
  evaluateSelfSolveBeforeStop,
  evaluateUserExecutionControl,
  executeAfterControlDecision,
} from "../packages/core/src/index.ts"

describe("task1249 safety, user control, and self-solve decisions", () => {
  it("stops an evidenced non-mitigable high risk and holds an approvable risk pending", () => {
    expect(evaluateSafetyRisk({ riskKind: "destructive_write", severity: "critical", affectedActionRef: "action:1", evidenceRefs: ["policy:risk"], mitigationAvailable: false, approvalEligible: false, requiredMitigations: [] })).toEqual({ status: "stop_and_report", reasonCode: "safety_risk", evidenceRefs: ["policy:risk"] })
    expect(evaluateSafetyRisk({ riskKind: "privileged_write", severity: "high", affectedActionRef: "action:2", evidenceRefs: ["policy:approval"], mitigationAvailable: false, approvalEligible: true, requiredMitigations: ["Obtain explicit approval."] })).toEqual({ status: "blocked_pending_input", reasonCode: "mitigation_or_approval_required", requiredActions: ["Obtain explicit approval."] })
  })

  it("rejects an unevidenced safety claim", () => {
    expect(() => evaluateSafetyRisk({ riskKind: "unknown", severity: "critical", affectedActionRef: "action:1", evidenceRefs: [], mitigationAvailable: false, approvalEligible: false, requiredMitigations: [] })).toThrow(/requires evidence/i)
  })

  it("applies exact fresh cancel and redirect commands", () => {
    expect(evaluateUserExecutionControl({ commandId: "cmd:1", command: "cancel", targetRunId: "run:1", currentRunId: "run:1", actorRef: "user:1", sequence: 2, lastAppliedSequence: 1 })).toEqual({ status: "cancelled", reasonCode: "user_cancelled", commandId: "cmd:1" })
    expect(evaluateUserExecutionControl({ commandId: "cmd:2", command: "redirect", targetRunId: "run:1", currentRunId: "run:1", actorRef: "user:1", sequence: 3, lastAppliedSequence: 2, newGoalRef: "goal:new" })).toEqual({ status: "redirected", reasonCode: "user_redirected", commandId: "cmd:2", newGoalRef: "goal:new" })
  })

  it("ignores wrong-target, stale, and duplicate control commands", () => {
    expect(evaluateUserExecutionControl({ commandId: "cmd:1", command: "cancel", targetRunId: "run:other", currentRunId: "run:1", actorRef: "user:1", sequence: 2, lastAppliedSequence: 1 })).toEqual({ status: "ignored", reasonCode: "wrong_target" })
    expect(evaluateUserExecutionControl({ commandId: "cmd:2", command: "cancel", targetRunId: "run:1", currentRunId: "run:1", actorRef: "user:1", sequence: 2, lastAppliedSequence: 2 })).toEqual({ status: "ignored", reasonCode: "stale_or_duplicate" })
  })

  it("prevents exhaustion while direct answer or planning remains available", () => {
    expect(evaluateSelfSolveBeforeStop([
      { path: "direct_answer", outcome: "available", reasonCode: "explanation_possible", evidenceRefs: ["diagnosis:1"] },
      { path: "plan", outcome: "reviewed_unavailable", reasonCode: "no_plan_needed", evidenceRefs: ["plan-review:1"] },
    ])).toEqual({ status: "continue", reasonCode: "self_solve_available", path: "direct_answer" })
  })

  it("allows exhaustion only after both self-solve paths have evidence", () => {
    expect(evaluateSelfSolveBeforeStop([
      { path: "direct_answer", outcome: "reviewed_unavailable", reasonCode: "external_action_required", evidenceRefs: ["diagnosis:1"] },
      { path: "plan", outcome: "attempted_failed", reasonCode: "plan_did_not_complete", evidenceRefs: ["plan-run:1"] },
    ])).toMatchObject({ status: "eligible_for_exhaustion", evidenceRefs: ["diagnosis:1", "plan-run:1"] })
    expect(() => evaluateSelfSolveBeforeStop([{ path: "direct_answer", outcome: "reviewed_unavailable", reasonCode: "external", evidenceRefs: ["diagnosis:1"] }])).toThrow(/plan/i)
  })

  it("does not execute after a safety stop or user cancellation", async () => {
    const execute = vi.fn(async () => "ran")
    const stop = evaluateSafetyRisk({ riskKind: "destructive", severity: "high", affectedActionRef: "action:1", evidenceRefs: ["risk:1"], mitigationAvailable: false, approvalEligible: false, requiredMitigations: [] })
    await expect(executeAfterControlDecision({ decision: stop, execute })).resolves.toMatchObject({ status: "stop_and_report" })
    const cancel = evaluateUserExecutionControl({ commandId: "cmd:1", command: "cancel", targetRunId: "run:1", currentRunId: "run:1", actorRef: "user:1", sequence: 1, lastAppliedSequence: 0 })
    await expect(executeAfterControlDecision({ decision: cancel, execute })).resolves.toMatchObject({ status: "cancelled" })
    expect(execute).not.toHaveBeenCalled()
  })

  it("keeps the decisions independent from infrastructure", () => {
    const source = readFileSync(new URL("../packages/core/src/contracts/safety-control-self-solve.ts", import.meta.url), "utf8")
    expect(source).not.toMatch(/from ["']|process\.env|Date\.now|fetch\(|readFile|writeFile|globalThis/)
  })
})
