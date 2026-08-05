import { describe, expect, it, vi } from "vitest"
import { applySafetyRiskDecision, evaluateSafetyRisk } from "../packages/core/src/index.ts"

describe("task1249 safety risk application", () => {
  it("executes only below the stop threshold", async () => {
    const execute = vi.fn(async () => "done")
    const result = await applySafetyRiskDecision({
      decision: evaluateSafetyRisk({ riskKind: "read", severity: "low", affectedActionRef: "action:1", evidenceRefs: ["risk:1"], mitigationAvailable: false, approvalEligible: false, requiredMitigations: [] }),
      execute,
      requestMitigationOrApproval: vi.fn(),
      stopRun: vi.fn(),
    })
    expect(result).toEqual({ status: "executed", result: "done" })
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it("requests approval without executing an approvable high-risk action", async () => {
    const execute = vi.fn()
    const request = vi.fn()
    const stop = vi.fn()
    const result = await applySafetyRiskDecision({
      decision: evaluateSafetyRisk({ riskKind: "write", severity: "high", affectedActionRef: "action:2", evidenceRefs: ["risk:2"], mitigationAvailable: false, approvalEligible: true, requiredMitigations: ["Approve the write."] }),
      execute,
      requestMitigationOrApproval: request,
      stopRun: stop,
    })
    expect(result).toMatchObject({ status: "blocked_pending_input" })
    expect(request).toHaveBeenCalledWith(["Approve the write."])
    expect(execute).not.toHaveBeenCalled()
    expect(stop).not.toHaveBeenCalled()
  })

  it("stops without executing a non-mitigable critical action", async () => {
    const execute = vi.fn()
    const stop = vi.fn()
    const result = await applySafetyRiskDecision({
      decision: evaluateSafetyRisk({ riskKind: "destructive", severity: "critical", affectedActionRef: "action:3", evidenceRefs: ["risk:3"], mitigationAvailable: false, approvalEligible: false, requiredMitigations: [] }),
      execute,
      requestMitigationOrApproval: vi.fn(),
      stopRun: stop,
    })
    expect(result).toEqual({ status: "stopped", reasonCode: "safety_risk", evidenceRefs: ["risk:3"] })
    expect(stop).toHaveBeenCalledWith({ reasonCode: "safety_risk", evidenceRefs: ["risk:3"] })
    expect(execute).not.toHaveBeenCalled()
  })
})
