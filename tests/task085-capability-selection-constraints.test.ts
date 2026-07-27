import { describe, expect, it } from "vitest"
import {
  type LlmCapabilitySelectionDecision,
  admitLlmCapabilitySelection,
  createLlmCapabilitySelectionReceipt,
} from "../packages/core/src/contracts/llm-capability-selection.ts"

const fingerprint = `sha256:${"c".repeat(64)}` as const

function decision(
  overrides: Partial<LlmCapabilitySelectionDecision> = {},
): LlmCapabilitySelectionDecision {
  return {
    schemaVersion: 1,
    runId: "run-85",
    capabilitySnapshotId: "snapshot-85",
    capabilitySnapshotFingerprint: fingerprint,
    comparedBindings: [
      { capabilityId: "local.search", targetId: "agent:local" },
      { capabilityId: "web.search", targetId: "agent:web" },
    ],
    bindingAssessments: [
      {
        capabilityId: "local.search",
        targetId: "agent:local",
        roleFit: "fit",
        permission: "allowed",
        sideEffect: "read",
        evidenceQuality: "indirect",
        dataExposure: "local_private",
        externalTransfer: false,
        cost: "none",
        strategyFingerprint: "strategy:local-index:v1",
        changedFromFailedStrategies: true,
        reason: "Local search preserves private data but has indirect evidence.",
      },
      {
        capabilityId: "web.search",
        targetId: "agent:web",
        roleFit: "fit",
        permission: "allowed",
        sideEffect: "external",
        evidenceQuality: "direct",
        dataExposure: "external_private",
        externalTransfer: true,
        cost: "low",
        strategyFingerprint: "strategy:web-direct:v1",
        changedFromFailedStrategies: true,
        reason: "Web search provides direct evidence with bounded external transfer.",
      },
    ],
    selectedBinding: { capabilityId: "local.search", targetId: "agent:local" },
    reason: "Select the local path under the current privacy constraint.",
    ...overrides,
  }
}

function admit(
  selection: LlmCapabilitySelectionDecision,
  overrides: Partial<Parameters<typeof admitLlmCapabilitySelection>[0]> = {},
) {
  return admitLlmCapabilitySelection({
    runId: "run-85",
    userMethodSpecified: false,
    externalTransferAllowed: false,
    maxCost: "low",
    failedStrategyFingerprints: [],
    capabilitySnapshot: {
      snapshotId: "snapshot-85",
      fingerprint,
      bindings: [
        { capabilityId: "local.search", targetId: "agent:local", risk: "safe" },
        { capabilityId: "web.search", targetId: "agent:web", risk: "safe" },
      ],
    },
    decision: selection,
    receipt: createLlmCapabilitySelectionReceipt({
      receiptId: "receipt:selection:85",
      decision: selection,
    }),
    ...overrides,
  })
}

describe("Task 085 capability selection constraints", () => {
  it("does not infer selection from executable candidate or assessment order", () => {
    const original = decision()
    const reordered = decision({
      comparedBindings: [...original.comparedBindings].reverse(),
      bindingAssessments: [...original.bindingAssessments].reverse(),
    })
    expect(admit(original)).toMatchObject({
      status: "allowed",
      selectedBinding: original.selectedBinding,
    })
    expect(admit(reordered)).toMatchObject({
      status: "allowed",
      selectedBinding: original.selectedBinding,
    })
  })

  it("rejects selected external transfer or public exposure without explicit permission", () => {
    const external = decision({
      selectedBinding: { capabilityId: "web.search", targetId: "agent:web" },
    })
    expect(admit(external)).toMatchObject({
      status: "rejected",
      reasonCodes: ["external_transfer_not_allowed"],
    })

    const base = decision()
    const publicExposure = decision({
      bindingAssessments: base.bindingAssessments.map((assessment) =>
        assessment.capabilityId === "local.search"
          ? { ...assessment, dataExposure: "public" }
          : assessment,
      ),
    })
    expect(admit(publicExposure)).toMatchObject({
      status: "rejected",
      reasonCodes: ["external_transfer_not_allowed"],
    })
  })

  it("rejects a selected capability above the explicit cost limit", () => {
    const base = decision()
    const expensive = decision({
      bindingAssessments: base.bindingAssessments.map((assessment) =>
        assessment.capabilityId === "local.search" ? { ...assessment, cost: "high" } : assessment,
      ),
    })
    expect(admit(expensive, { maxCost: "low" })).toMatchObject({
      status: "rejected",
      reasonCodes: ["selection_cost_limit_exceeded"],
    })
  })

  it("rejects a selected strategy that repeats a failed fingerprint", () => {
    expect(
      admit(decision(), { failedStrategyFingerprints: ["strategy:local-index:v1"] }),
    ).toMatchObject({
      status: "rejected",
      reasonCodes: ["failed_strategy_reselected"],
    })
  })

  it("admits a materially changed strategy with a new fingerprint", () => {
    expect(
      admit(decision(), { failedStrategyFingerprints: ["strategy:local-index:failed"] }),
    ).toMatchObject({ status: "allowed" })
  })
})
