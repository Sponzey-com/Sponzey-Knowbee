import { describe, expect, it } from "vitest"
import {
  type CapabilitySelectionSnapshot,
  type LlmCapabilitySelectionDecision,
  admitLlmCapabilitySelection,
  createLlmCapabilitySelectionReceipt,
  runLlmCapabilitySelectionProvider,
} from "../packages/core/src/contracts/llm-capability-selection.ts"
import { projectCanonicalCapabilitySnapshot } from "../packages/core/src/runs/canonical-capability-snapshot.ts"
import { yeonjangBrowserFocusTool } from "../packages/core/src/tools/builtin/yeonjang.ts"

const fingerprint = `sha256:${"f".repeat(64)}` as const

const registry = {
  generatedAt: 100,
  agents: [],
  teams: [],
  membershipEdges: [],
  diagnostics: [],
}

function focusSelectionSnapshot(): CapabilitySelectionSnapshot {
  const projection = projectCanonicalCapabilitySnapshot({
    actionCapabilityIds: [],
    registry,
    tools: [yeonjangBrowserFocusTool],
    source: "telegram",
    snapshotAt: 100,
    runtimeHealthObservations: [
      {
        capabilityId: "yeonjang_browser_focus",
        targetId: "yeonjang:studio-mac",
        status: "ready",
        observedAt: 100,
        expiresAt: 200,
        reasonCodes: [],
      },
    ],
  })
  return {
    snapshotId: "capability-snapshot:browser-focus:144",
    fingerprint,
    bindings: projection.bindings,
    exclusions: projection.exclusions,
  }
}

function missingTargetSnapshot(): CapabilitySelectionSnapshot {
  const projection = projectCanonicalCapabilitySnapshot({
    actionCapabilityIds: [],
    registry,
    tools: [yeonjangBrowserFocusTool],
    source: "telegram",
    snapshotAt: 100,
    runtimeHealthObservations: [],
  })
  return {
    snapshotId: "capability-snapshot:browser-focus:144",
    fingerprint,
    bindings: projection.bindings,
    exclusions: projection.exclusions,
  }
}

function focusDecision(
  overrides: Partial<LlmCapabilitySelectionDecision> = {},
): LlmCapabilitySelectionDecision {
  return {
    schemaVersion: 1,
    runId: "run-144",
    capabilitySnapshotId: "capability-snapshot:browser-focus:144",
    capabilitySnapshotFingerprint: fingerprint,
    comparedBindings: [
      { capabilityId: "yeonjang_browser_focus", targetId: "yeonjang:studio-mac" },
    ],
    bindingAssessments: [
      {
        capabilityId: "yeonjang_browser_focus",
        targetId: "yeonjang:studio-mac",
        roleFit: "fit",
        permission: "approval_required",
        sideEffect: "external",
        evidenceQuality: "direct",
        dataExposure: "local_private",
        externalTransfer: false,
        cost: "low",
        strategyFingerprint: "strategy:browser-focus:yeonjang-studio-mac:v1",
        changedFromFailedStrategies: true,
        reason: "The connected Yeonjang target exposes browser.focus and can focus the requested browser after approval and post-check.",
      },
    ],
    selectedBinding: {
      capabilityId: "yeonjang_browser_focus",
      targetId: "yeonjang:studio-mac",
    },
    reason: "Use the connected Yeonjang browser focus capability instead of asking the user to perform the action manually.",
    ...overrides,
  }
}

describe("Task 144 Yeonjang browser.focus capability selection", () => {
  it("lets LLM selection choose yeonjang_browser_focus from a ready runtime capability snapshot", async () => {
    const providerInputs: unknown[] = []
    const snapshot = focusSelectionSnapshot()
    const selectionContext = {
      goal: "Focus the browser on the connected studio Mac.",
      constraints: ["Use the exact ready Yeonjang target."],
      completionCriteria: ["The target browser receives focus."],
      failedStrategyFingerprints: [],
    }
    const result = await runLlmCapabilitySelectionProvider({
      receiptId: "receipt:selection:browser-focus:144",
      runId: "run-144",
      capabilitySnapshot: snapshot,
      selectionContext,
      provider: {
        selectCapability: (input) => {
          providerInputs.push(input)
          return focusDecision()
        },
      },
    })

    expect(providerInputs).toEqual([
      {
        runId: "run-144",
        capabilitySnapshotId: "capability-snapshot:browser-focus:144",
        capabilitySnapshotFingerprint: fingerprint,
        selectionContext,
        executableBindings: [
          {
            capabilityId: "yeonjang_browser_focus",
            targetId: "yeonjang:studio-mac",
            risk: "approval_required",
          },
        ],
        candidateContexts: [],
      },
    ])
    expect(
      admitLlmCapabilitySelection({
        runId: "run-144",
        userMethodSpecified: false,
        externalTransferAllowed: false,
        maxCost: "low",
        failedStrategyFingerprints: [],
        capabilitySnapshot: snapshot,
        ...result,
      }),
    ).toEqual({
      status: "approval_required",
      receiptId: "receipt:selection:browser-focus:144",
      selectedBinding: {
        capabilityId: "yeonjang_browser_focus",
        targetId: "yeonjang:studio-mac",
        risk: "approval_required",
      },
    })
  })

  it("does not create an executable focus candidate when exact Yeonjang runtime target is missing", async () => {
    const snapshot = missingTargetSnapshot()

    expect(snapshot.bindings).toEqual([])
    expect(snapshot.exclusions).toEqual([
      {
        capabilityId: "yeonjang_browser_focus",
        targetId: "agent:knowbee",
        reasonCodes: ["runtime_health_observation_missing"],
      },
    ])
    await expect(
      runLlmCapabilitySelectionProvider({
        receiptId: "receipt:selection:browser-focus:missing-target",
        runId: "run-144",
        capabilitySnapshot: snapshot,
        selectionContext: {
          goal: "Focus the browser.",
          constraints: [],
          completionCriteria: ["The browser receives focus."],
          failedStrategyFingerprints: [],
        },
        provider: {
          selectCapability: () => focusDecision(),
        },
      }),
    ).rejects.toThrow("Executable capability snapshot has no selection candidates.")
  })

  it("rejects repeating the same failed browser.focus strategy without a changed strategy", () => {
    const snapshot = focusSelectionSnapshot()
    const decision = focusDecision({
      bindingAssessments: [
        {
          ...focusDecision().bindingAssessments[0],
          changedFromFailedStrategies: false,
        },
      ],
    })

    expect(
      admitLlmCapabilitySelection({
        runId: "run-144",
        userMethodSpecified: false,
        externalTransferAllowed: false,
        maxCost: "low",
        failedStrategyFingerprints: ["strategy:browser-focus:yeonjang-studio-mac:v1"],
        capabilitySnapshot: snapshot,
        decision,
        receipt: createLlmCapabilitySelectionReceipt({
          receiptId: "receipt:selection:browser-focus:repeated",
          decision,
        }),
      }),
    ).toMatchObject({
      status: "rejected",
      reasonCodes: ["failed_strategy_reselected"],
    })
  })
})
