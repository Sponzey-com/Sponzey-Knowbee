import { describe, expect, it } from "vitest"
import type {
  CapabilitySelectionDecisionTraceRecordInput,
  CapabilitySelectionDecisionTraceSink,
} from "../packages/core/src/contracts/capability-selection-decision-trace.ts"
import type {
  LlmCapabilitySelectionAttemptProvider,
  LlmCapabilitySelectionDecision,
  LlmCapabilitySelectionSchemaRepairProvider,
} from "../packages/core/src/contracts/llm-capability-selection.ts"
import { executeCapabilitySelection } from "../packages/core/src/runs/capability-selection-use-case.ts"

const snapshot = {
  snapshotId: "selection:run-3",
  fingerprint: `sha256:${"a".repeat(64)}` as const,
  bindings: [
    { capabilityId: "skill:web-research", targetId: "agent:main", risk: "safe" as const },
    { capabilityId: "skill:files", targetId: "agent:main", risk: "approval_required" as const },
  ],
}

const selectionContext = {
  goal: "Find current public information.",
  constraints: ["Use an enabled capability."],
  completionCriteria: ["Return verified current information."],
  failedStrategyFingerprints: [] as string[],
}

function decision(): LlmCapabilitySelectionDecision {
  return {
    schemaVersion: 1,
    runId: "run-3",
    capabilitySnapshotId: snapshot.snapshotId,
    capabilitySnapshotFingerprint: snapshot.fingerprint,
    comparedBindings: snapshot.bindings.map(({ capabilityId, targetId }) => ({
      capabilityId,
      targetId,
    })),
    bindingAssessments: [
      {
        capabilityId: "skill:web-research",
        targetId: "agent:main",
        roleFit: "fit",
        permission: "allowed",
        sideEffect: "none",
        evidenceQuality: "indirect",
        dataExposure: "public",
        externalTransfer: true,
        cost: "low",
        strategyFingerprint: "web-research:v1",
        changedFromFailedStrategies: true,
        reason: "Current public information is required.",
      },
      {
        capabilityId: "skill:files",
        targetId: "agent:main",
        roleFit: "unfit",
        permission: "approval_required",
        sideEffect: "write",
        evidenceQuality: "direct",
        dataExposure: "local_private",
        externalTransfer: false,
        cost: "none",
        strategyFingerprint: "files:v1",
        changedFromFailedStrategies: true,
        reason: "Local files do not provide current public information.",
      },
    ],
    selectedBinding: {
      capabilityId: "skill:web-research",
      targetId: "agent:main",
    },
    reason: "Web research is the best fitting executable capability.",
  }
}

function provider(
  select: () => LlmCapabilitySelectionDecision,
): LlmCapabilitySelectionAttemptProvider {
  return {
    attemptCapabilitySelection: () => ({
      status: "completed",
      output: select(),
    }),
  }
}

function traceSink(records: CapabilitySelectionDecisionTraceRecordInput[]): CapabilitySelectionDecisionTraceSink {
  return {
    record: (input) => {
      records.push(input)
      return { status: "stored", traceId: `trace:${records.length}` }
    },
  }
}

describe("capability selection use case", () => {
  it("returns the admitted exact binding after the provider compares the whole snapshot", async () => {
    const traces: CapabilitySelectionDecisionTraceRecordInput[] = []
    const result = await executeCapabilitySelection({
      runId: "run-3",
      receiptId: "selection-receipt:run-3",
      capabilitySnapshot: snapshot,
      selectionContext,
      provider: provider(decision),
      traceSink: traceSink(traces),
      userMethodSpecified: false,
      externalTransferAllowed: true,
      maxCost: "high",
    })

    expect(result).toEqual({
      status: "allowed",
      receiptId: "selection-receipt:run-3",
      decisionTraceId: "trace:1",
      selectedBinding: {
        capabilityId: "skill:web-research",
        targetId: "agent:main",
        risk: "safe",
      },
    })
    expect(traces).toEqual([
      {
        runId: "run-3",
        decisionReceiptId: "selection-receipt:run-3",
        reasonCode: "capability_selection_allowed",
        detail: {
          terminalStatus: "allowed",
          attemptCount: 1,
          attemptKinds: ["initial"],
          validationReasonCodes: [],
          admissionReasonCodes: [],
          strategyFingerprints: ["files:v1", "web-research:v1"],
        },
      },
    ])
  })

  it("returns typed rejection for a malformed or incomplete model decision", async () => {
    const malformed = decision()
    malformed.comparedBindings = [malformed.comparedBindings[0]!]
    const traces: CapabilitySelectionDecisionTraceRecordInput[] = []

    const result = await executeCapabilitySelection({
      runId: "run-3",
      receiptId: "selection-receipt:run-3",
      capabilitySnapshot: snapshot,
      selectionContext,
      provider: provider(() => malformed),
      traceSink: traceSink(traces),
      userMethodSpecified: false,
      externalTransferAllowed: true,
      maxCost: "high",
    })

    expect(result).toEqual({
      status: "rejected",
      reasonCodes: ["executable_candidates_mismatch"],
      decisionTraceId: "trace:1",
      strategyFingerprints: ["files:v1", "web-research:v1"],
    })
    expect(traces[0]).toMatchObject({
      reasonCode: "capability_selection_rejected",
      detail: {
        terminalStatus: "rejected",
        admissionReasonCodes: ["executable_candidates_mismatch"],
      },
    })
  })

  it("does not expose a provider error through its unavailable result", async () => {
    const result = await executeCapabilitySelection({
      runId: "run-3",
      receiptId: "selection-receipt:run-3",
      capabilitySnapshot: snapshot,
      selectionContext,
      provider: {
        attemptCapabilitySelection: () => ({
          status: "failed",
          reasonCode: "provider_failed",
        }),
      },
      userMethodSpecified: false,
      externalTransferAllowed: true,
      maxCost: "high",
    })

    expect(result).toEqual({
      status: "failed",
      reasonCode: "capability_selection_provider_failed",
      attemptCount: 1,
    })
    expect(JSON.stringify(result)).not.toContain("secret provider payload")
  })

  it("rejects an incomplete selection context before calling the provider", async () => {
    let calls = 0
    const result = await executeCapabilitySelection({
      runId: "run-3",
      receiptId: "selection-receipt:run-3",
      capabilitySnapshot: snapshot,
      selectionContext: {
        ...selectionContext,
        goal: " ",
      },
      provider: {
        attemptCapabilitySelection: () => {
          calls += 1
          return { status: "completed", output: decision() }
        },
      },
      userMethodSpecified: false,
      externalTransferAllowed: true,
      maxCost: "high",
    })

    expect(result).toEqual({
      status: "failed",
      reasonCode: "capability_selection_context_invalid",
      attemptCount: 0,
    })
    expect(calls).toBe(0)
  })

  it("repairs a structurally invalid model value once before admission", async () => {
    let repairCalls = 0
    const traces: CapabilitySelectionDecisionTraceRecordInput[] = []
    const repairProvider: LlmCapabilitySelectionSchemaRepairProvider = {
      repairCapabilitySelection: (input) => {
        repairCalls += 1
        expect(input).toMatchObject({
          repairAttemptNumber: 1,
          validationReasonCodes: expect.arrayContaining(["run_id_required"]),
        })
        return { status: "completed", output: decision() }
      },
    }

    const result = await executeCapabilitySelection({
      runId: "run-3",
      receiptId: "selection-receipt:run-3",
      capabilitySnapshot: snapshot,
      selectionContext,
      provider: {
        attemptCapabilitySelection: () => ({
          status: "completed",
          output: { schemaVersion: 1 },
        }),
      },
      repairProvider,
      traceSink: traceSink(traces),
      userMethodSpecified: false,
      externalTransferAllowed: true,
      maxCost: "high",
    })

    expect(result).toMatchObject({ status: "allowed" })
    expect(repairCalls).toBe(1)
    expect(traces[0]).toMatchObject({
      reasonCode: "capability_selection_allowed",
      detail: {
        attemptCount: 2,
        attemptKinds: ["initial", "repair"],
        validationReasonCodes: expect.arrayContaining(["run_id_required"]),
      },
    })
  })

  it("fails closed when the required decision trace cannot be stored", async () => {
    const result = await executeCapabilitySelection({
      runId: "run-3",
      receiptId: "selection-receipt:run-3",
      capabilitySnapshot: snapshot,
      selectionContext,
      provider: provider(decision),
      traceSink: {
        record: () => ({ status: "failed", reasonCode: "trace_storage_failed" }),
      },
      userMethodSpecified: false,
      externalTransferAllowed: true,
      maxCost: "high",
    })

    expect(result).toEqual({
      status: "failed",
      reasonCode: "capability_selection_trace_failed",
      attemptCount: 1,
    })
  })

  it("returns typed invalid output after the single repair is exhausted", async () => {
    let repairCalls = 0
    const result = await executeCapabilitySelection({
      runId: "run-3",
      receiptId: "selection-receipt:run-3",
      capabilitySnapshot: snapshot,
      selectionContext,
      provider: {
        attemptCapabilitySelection: () => ({
          status: "invalid_output",
          reasonCode: "invalid_json",
        }),
      },
      repairProvider: {
        repairCapabilitySelection: () => {
          repairCalls += 1
          return {
            status: "invalid_output",
            reasonCode: "json_object_required",
          }
        },
      },
      userMethodSpecified: false,
      externalTransferAllowed: true,
      maxCost: "high",
    })

    expect(result).toEqual({
      status: "failed",
      reasonCode: "capability_selection_invalid_output",
      validationReasonCodes: ["json_object_required"],
      attemptCount: 2,
    })
    expect(repairCalls).toBe(1)
  })

  it.each([
    ["provider_failed", "capability_selection_provider_failed", "failed"],
    ["timed_out", "capability_selection_timed_out", "failed"],
    ["output_limit_exceeded", "capability_selection_output_limit_exceeded", "failed"],
    ["cancelled", "capability_selection_cancelled", "cancelled"],
  ] as const)("preserves the %s attempt result", async (attemptReason, reasonCode, status) => {
    const result = await executeCapabilitySelection({
      runId: "run-3",
      receiptId: "selection-receipt:run-3",
      capabilitySnapshot: snapshot,
      selectionContext,
      provider: {
        attemptCapabilitySelection: () =>
          attemptReason === "cancelled"
            ? { status: "cancelled", reasonCode: attemptReason }
            : { status: "failed", reasonCode: attemptReason },
      },
      userMethodSpecified: false,
      externalTransferAllowed: true,
      maxCost: "high",
    })

    expect(result).toEqual({ status, reasonCode, attemptCount: 1 })
  })
})
