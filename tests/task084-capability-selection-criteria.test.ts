import { describe, expect, it } from "vitest"
import {
  type LlmCapabilitySelectionDecision,
  admitLlmCapabilitySelection,
  createLlmCapabilitySelectionReceipt,
} from "../packages/core/src/contracts/llm-capability-selection.ts"

const fingerprint = `sha256:${"b".repeat(64)}` as const

function decision(
  overrides: Partial<LlmCapabilitySelectionDecision> = {},
): LlmCapabilitySelectionDecision {
  return {
    schemaVersion: 1,
    runId: "run-84",
    capabilitySnapshotId: "snapshot-84",
    capabilitySnapshotFingerprint: fingerprint,
    comparedBindings: [
      { capabilityId: "filesystem.write", targetId: "agent:local" },
      { capabilityId: "web.search", targetId: "agent:research" },
    ],
    bindingAssessments: [
      {
        capabilityId: "filesystem.write",
        targetId: "agent:local",
        roleFit: "partial",
        permission: "approval_required",
        sideEffect: "write",
        evidenceQuality: "direct",
        dataExposure: "local_private",
        externalTransfer: false,
        cost: "low",
        strategyFingerprint: "strategy:filesystem-write:v1",
        changedFromFailedStrategies: true,
        reason: "Can write the result but requires approval.",
      },
      {
        capabilityId: "web.search",
        targetId: "agent:research",
        roleFit: "fit",
        permission: "allowed",
        sideEffect: "read",
        evidenceQuality: "direct",
        dataExposure: "external_private",
        externalTransfer: true,
        cost: "low",
        strategyFingerprint: "strategy:web-search:v1",
        changedFromFailedStrategies: true,
        reason: "Can retrieve current source evidence without mutation.",
      },
    ],
    selectedBinding: { capabilityId: "web.search", targetId: "agent:research" },
    reason: "Select the role-fit read path with direct evidence.",
    ...overrides,
  }
}

function admit(selection: LlmCapabilitySelectionDecision) {
  return admitLlmCapabilitySelection({
    runId: "run-84",
    userMethodSpecified: false,
    externalTransferAllowed: true,
    maxCost: "high",
    failedStrategyFingerprints: [],
    capabilitySnapshot: {
      snapshotId: "snapshot-84",
      fingerprint,
      bindings: [
        {
          capabilityId: "filesystem.write",
          targetId: "agent:local",
          risk: "approval_required",
        },
        { capabilityId: "web.search", targetId: "agent:research", risk: "safe" },
      ],
    },
    decision: selection,
    receipt: createLlmCapabilitySelectionReceipt({
      receiptId: "receipt:selection:84",
      decision: selection,
    }),
  })
}

describe("Task 084 capability selection criteria", () => {
  it("admits a safe selection only after every executable binding has a complete assessment", () => {
    expect(admit(decision())).toMatchObject({
      status: "allowed",
      selectedBinding: { capabilityId: "web.search", targetId: "agent:research" },
    })
  })

  it("rejects missing, duplicate, or invented binding assessments", () => {
    const complete = decision()
    const firstAssessment = complete.bindingAssessments[0]
    const secondAssessment = complete.bindingAssessments[1]
    if (!firstAssessment || !secondAssessment)
      throw new Error("Complete assessment fixture is invalid.")
    expect(
      admit(decision({ bindingAssessments: complete.bindingAssessments.slice(1) })),
    ).toMatchObject({
      status: "rejected",
      reasonCodes: ["binding_assessments_mismatch"],
    })
    expect(
      admit(decision({ bindingAssessments: [...complete.bindingAssessments, firstAssessment] })),
    ).toMatchObject({ status: "rejected", reasonCodes: ["binding_assessments_mismatch"] })
    expect(
      admit(
        decision({
          bindingAssessments: [
            ...complete.bindingAssessments,
            {
              ...secondAssessment,
              targetId: "agent:invented",
            },
          ],
        }),
      ),
    ).toMatchObject({ status: "rejected", reasonCodes: ["binding_assessments_mismatch"] })
  })

  it("rejects an LLM permission assessment that contradicts trusted snapshot risk", () => {
    const complete = decision()
    expect(
      admit(
        decision({
          bindingAssessments: complete.bindingAssessments.map((assessment) =>
            assessment.capabilityId === "filesystem.write"
              ? { ...assessment, permission: "allowed" }
              : assessment,
          ),
        }),
      ),
    ).toMatchObject({
      status: "rejected",
      reasonCodes: ["binding_assessment_snapshot_mismatch"],
    })
  })

  it("rejects a selected role-unfit or permission-denied binding", () => {
    const complete = decision()
    for (const patch of [{ roleFit: "unfit" as const }, { permission: "denied" as const }]) {
      expect(
        admit(
          decision({
            bindingAssessments: complete.bindingAssessments.map((assessment) =>
              assessment.capabilityId === "web.search" ? { ...assessment, ...patch } : assessment,
            ),
          }),
        ),
      ).toMatchObject({ status: "rejected" })
    }
  })

  it("keeps an assessed approval-required selection out of the allowed state", () => {
    expect(
      admit(
        decision({
          selectedBinding: { capabilityId: "filesystem.write", targetId: "agent:local" },
        }),
      ),
    ).toMatchObject({ status: "approval_required" })
  })
})
