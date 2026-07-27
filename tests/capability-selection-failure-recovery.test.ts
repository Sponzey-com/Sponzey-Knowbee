import { describe, expect, it } from "vitest"
import type {
  CapabilitySelectionDecisionTraceRecordInput,
  CapabilitySelectionDecisionTraceSink,
} from "../packages/core/src/contracts/capability-selection-decision-trace.ts"
import type {
  LlmCapabilitySelectionDecision,
  LlmCapabilitySelectionProviderInput,
} from "../packages/core/src/contracts/llm-capability-selection.ts"
import { authorizeCanonicalCapabilitySelection } from "../packages/core/src/runs/canonical-capability-selection.ts"
import { executeCapabilitySelection } from "../packages/core/src/runs/capability-selection-use-case.ts"

const fingerprint = `sha256:${"a".repeat(64)}` as const
const snapshot = {
  snapshotId: "selection:run-recovery",
  fingerprint,
  bindings: [
    { capabilityId: "skill:web", targetId: "agent:main", risk: "safe" as const },
  ],
}
const selectionContext = {
  goal: "Find current public information.",
  constraints: ["Use an enabled capability."],
  completionCriteria: ["Return verified current information."],
  failedStrategyFingerprints: [] as string[],
}

function rejectedDecision(): LlmCapabilitySelectionDecision {
  return {
    schemaVersion: 1,
    runId: "run-recovery",
    capabilitySnapshotId: snapshot.snapshotId,
    capabilitySnapshotFingerprint: fingerprint,
    comparedBindings: [{ capabilityId: "skill:web", targetId: "agent:main" }],
    bindingAssessments: [{
      capabilityId: "skill:web",
      targetId: "agent:main",
      roleFit: "fit",
      permission: "denied",
      sideEffect: "read",
      evidenceQuality: "direct",
      dataExposure: "public",
      externalTransfer: true,
      cost: "low",
      strategyFingerprint: "strategy:web:current:v1",
      changedFromFailedStrategies: true,
      reason: "The binding cannot currently execute.",
    }],
    selectedBinding: {
      capabilityId: "skill:web",
      targetId: "agent:main",
    },
    reason: "The only candidate is currently denied.",
  }
}

function traceSink(
  records: CapabilitySelectionDecisionTraceRecordInput[],
): CapabilitySelectionDecisionTraceSink {
  return {
    record: (input) => {
      records.push(input)
      return { status: "stored", traceId: "trace-recovery-1" }
    },
  }
}

describe("capability selection failure recovery", () => {
  it("returns the trace reference and attempted strategy fingerprints with rejection evidence", async () => {
    const records: CapabilitySelectionDecisionTraceRecordInput[] = []

    const result = await executeCapabilitySelection({
      runId: "run-recovery",
      receiptId: "receipt:capability-selection:run-recovery",
      capabilitySnapshot: snapshot,
      selectionContext,
      provider: {
        attemptCapabilitySelection: () => ({
          status: "completed",
          output: rejectedDecision(),
        }),
      },
      traceSink: traceSink(records),
      userMethodSpecified: false,
      externalTransferAllowed: true,
      maxCost: "high",
    })

    expect(result).toEqual({
      status: "rejected",
      reasonCodes: [
        "binding_assessment_snapshot_mismatch",
        "selected_binding_permission_denied",
      ],
      decisionTraceId: "trace-recovery-1",
      strategyFingerprints: ["strategy:web:current:v1"],
    })
  })

  it("preserves recovery evidence through the canonical selection boundary", async () => {
    const records: CapabilitySelectionDecisionTraceRecordInput[] = []

    const result = await authorizeCanonicalCapabilitySelection({
      runId: "run-recovery",
      ownerAgentId: "agent:main",
      canonicalSnapshot: {
        snapshotId: "capability-snapshot:run-recovery",
        fingerprint,
        bindings: [
          { capabilityId: "web_search", targetId: "agent:main", risk: "safe" },
        ],
        exclusions: [],
      },
      methodConstraints: {
        requestedMethods: [],
        exclusiveMethods: [],
      },
      selectionContext,
      skillDefinitions: [{
        capabilityId: "skill:web",
        toolNames: ["web_search"],
      }],
      skillBindings: [{
        capabilityId: "skill:web",
        targetId: "agent:main",
        status: "enabled",
        risk: "safe",
        sourceSupported: true,
      }],
      instructionSkills: [],
      instructionSkillFindings: [],
      provider: {
        attemptCapabilitySelection: (input: LlmCapabilitySelectionProviderInput) => {
          const decision = rejectedDecision()
          return {
            status: "completed",
            output: {
              ...decision,
              capabilitySnapshotId: input.capabilitySnapshotId,
              capabilitySnapshotFingerprint: input.capabilitySnapshotFingerprint,
            },
          }
        },
      },
      traceSink: traceSink(records),
      externalTransferAllowed: true,
      maxCost: "high",
    })

    expect(result).toEqual({
      ok: false,
      reasonCode: "capability_selection_rejected",
      rejectionReasonCodes: [
        "binding_assessment_snapshot_mismatch",
        "selected_binding_permission_denied",
      ],
      decisionTraceId: "trace-recovery-1",
      strategyFingerprints: ["strategy:web:current:v1"],
    })
  })

  it("rejects reentry when the LLM selects an unchanged failed strategy", async () => {
    const result = await executeCapabilitySelection({
      runId: "run-recovery",
      receiptId: "receipt:capability-selection:run-recovery",
      capabilitySnapshot: snapshot,
      selectionContext: {
        ...selectionContext,
        failedStrategyFingerprints: ["strategy:web:current:v1"],
      },
      provider: {
        attemptCapabilitySelection: () => {
          const decision = rejectedDecision()
          decision.bindingAssessments[0] = {
            ...decision.bindingAssessments[0]!,
            permission: "allowed",
            changedFromFailedStrategies: false,
          }
          return { status: "completed", output: decision }
        },
      },
      userMethodSpecified: false,
      externalTransferAllowed: true,
      maxCost: "high",
    })

    expect(result).toMatchObject({
      status: "rejected",
      reasonCodes: expect.arrayContaining([
        "failed_strategy_reselected",
      ]),
    })
  })
})
