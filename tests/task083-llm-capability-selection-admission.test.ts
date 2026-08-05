import { describe, expect, it } from "vitest"
import {
  type LlmCapabilitySelectionDecision,
  admitLlmCapabilitySelection,
  createLlmCapabilitySelectionReceipt,
  runLlmCapabilitySelectionProvider,
} from "../packages/core/src/contracts/llm-capability-selection.ts"
import type { CanonicalPlanPolicyInput } from "../packages/core/src/runs/canonical-plan-policy.ts"

const fingerprint = `sha256:${"a".repeat(64)}` as const

function capabilitySnapshot(): CanonicalPlanPolicyInput["capabilitySnapshot"] {
  return {
    snapshotId: "capability-snapshot:run-83",
    fingerprint,
    bindings: [
      { capabilityId: "action:run_task", targetId: "agent:knowbee", risk: "safe" },
      { capabilityId: "web.search", targetId: "agent:research", risk: "safe" },
      {
        capabilityId: "filesystem.write",
        targetId: "agent:local",
        risk: "approval_required",
      },
    ],
    exclusions: [
      {
        capabilityId: "catalog.finance",
        targetId: "agent:finance",
        reasonCodes: ["runtime_connection_unavailable"],
      },
    ],
  }
}

function decision(
  overrides: Partial<LlmCapabilitySelectionDecision> = {},
): LlmCapabilitySelectionDecision {
  return {
    schemaVersion: 1,
    runId: "run-83",
    capabilitySnapshotId: "capability-snapshot:run-83",
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
        reason: "The binding can write files after approval.",
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
        reason: "The binding can retrieve direct current evidence.",
      },
    ],
    selectedBinding: { capabilityId: "web.search", targetId: "agent:research" },
    reason: "Web search provides current evidence without a side effect.",
    ...overrides,
  }
}

function admit(
  selection = decision(),
  overrides: Partial<Parameters<typeof admitLlmCapabilitySelection>[0]> = {},
) {
  return admitLlmCapabilitySelection({
    runId: "run-83",
    userMethodSpecified: false,
    externalTransferAllowed: true,
    maxCost: "high",
    failedStrategyFingerprints: [],
    capabilitySnapshot: capabilitySnapshot(),
    decision: selection,
    receipt: createLlmCapabilitySelectionReceipt({
      receiptId: "receipt:selection:83",
      decision: selection,
    }),
    ...overrides,
  })
}

describe("Task 083 LLM capability selection admission", () => {
  it("gives the LLM provider only current executable non-action bindings and binds its decision", async () => {
    const providerInputs: unknown[] = []
    const result = await runLlmCapabilitySelectionProvider({
      receiptId: "receipt:selection:provider",
      runId: "run-83",
      capabilitySnapshot: capabilitySnapshot(),
      provider: {
        selectCapability: (input) => {
          providerInputs.push(input)
          return decision()
        },
      },
    })

    expect(providerInputs).toEqual([
      {
        runId: "run-83",
        capabilitySnapshotId: "capability-snapshot:run-83",
        capabilitySnapshotFingerprint: fingerprint,
        executableBindings: [
          {
            capabilityId: "filesystem.write",
            targetId: "agent:local",
            risk: "approval_required",
          },
          { capabilityId: "web.search", targetId: "agent:research", risk: "safe" },
        ],
        candidateContexts: [],
      },
    ])
    expect(
      admitLlmCapabilitySelection({
        runId: "run-83",
        userMethodSpecified: false,
        externalTransferAllowed: true,
        maxCost: "high",
        failedStrategyFingerprints: [],
        capabilitySnapshot: capabilitySnapshot(),
        ...result,
      }),
    ).toMatchObject({ status: "allowed", receiptId: "receipt:selection:provider" })
  })

  it("allows an LLM decision that compares every current executable binding and selects one exact safe binding", () => {
    expect(admit()).toEqual({
      status: "allowed",
      receiptId: "receipt:selection:83",
      selectedBinding: { capabilityId: "web.search", targetId: "agent:research", risk: "safe" },
    })
  })

  it("rejects a catalog or exclusion entry that has no current executable binding", () => {
    const selection = decision({
      comparedBindings: [
        { capabilityId: "catalog.finance", targetId: "agent:finance" },
        { capabilityId: "filesystem.write", targetId: "agent:local" },
        { capabilityId: "web.search", targetId: "agent:research" },
      ],
      selectedBinding: { capabilityId: "catalog.finance", targetId: "agent:finance" },
    })

    expect(admit(selection)).toMatchObject({
      status: "rejected",
      reasonCodes: expect.arrayContaining([
        "executable_candidates_mismatch",
        "selected_binding_unavailable",
      ]),
    })
  })

  it("rejects an incomplete or invented comparison set", () => {
    const incomplete = decision({
      comparedBindings: [{ capabilityId: "web.search", targetId: "agent:research" }],
    })
    expect(admit(incomplete)).toMatchObject({
      status: "rejected",
      reasonCodes: ["executable_candidates_mismatch"],
    })

    const invented = decision({
      comparedBindings: [
        { capabilityId: "filesystem.write", targetId: "agent:local" },
        { capabilityId: "web.search", targetId: "agent:research" },
        { capabilityId: "web.search", targetId: "agent:invented" },
      ],
    })
    expect(admit(invented)).toMatchObject({
      status: "rejected",
      reasonCodes: ["executable_candidates_mismatch"],
    })
  })

  it("rejects stale scope metadata and a receipt bound to a different decision", () => {
    const wrongSnapshot = decision({ capabilitySnapshotId: "capability-snapshot:stale" })
    expect(admit(wrongSnapshot)).toMatchObject({
      status: "rejected",
      reasonCodes: ["snapshot_scope_mismatch"],
    })

    const original = decision()
    const changed = decision({ reason: "Changed after the LLM provider returned." })
    expect(
      admitLlmCapabilitySelection({
        runId: "run-83",
        userMethodSpecified: false,
        externalTransferAllowed: true,
        maxCost: "high",
        failedStrategyFingerprints: [],
        capabilitySnapshot: capabilitySnapshot(),
        decision: changed,
        receipt: createLlmCapabilitySelectionReceipt({
          receiptId: "receipt:selection:83",
          decision: original,
        }),
      }),
    ).toMatchObject({ status: "rejected", reasonCodes: ["selection_receipt_mismatch"] })
  })

  it("returns approval_required instead of treating a risky binding as executable", () => {
    const selection = decision({
      selectedBinding: { capabilityId: "filesystem.write", targetId: "agent:local" },
    })
    expect(admit(selection)).toEqual({
      status: "approval_required",
      receiptId: "receipt:selection:83",
      selectedBinding: {
        capabilityId: "filesystem.write",
        targetId: "agent:local",
        risk: "approval_required",
      },
    })
  })

  it("does not use the unspecified-method comparison path when the user named a method", () => {
    expect(admit(decision(), { userMethodSpecified: true })).toMatchObject({
      status: "rejected",
      reasonCodes: ["user_method_constraint_requires_policy_path"],
    })
  })
})
