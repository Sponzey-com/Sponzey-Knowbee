import { describe, expect, it, vi } from "vitest"
import type { LlmCapabilitySelectionProviderInput } from "../packages/core/src/contracts/llm-capability-selection.ts"
import {
  type CanonicalCapabilitySelectionInput,
  authorizeCanonicalCapabilitySelection,
} from "../packages/core/src/runs/canonical-capability-selection.ts"

const canonicalSnapshot = {
  snapshotId: "capability-snapshot:run-selection",
  fingerprint: `sha256:${"a".repeat(64)}` as const,
  bindings: [
    { capabilityId: "web_search", targetId: "agent:main", risk: "safe" as const },
    { capabilityId: "web_fetch", targetId: "agent:main", risk: "safe" as const },
    { capabilityId: "memory_search", targetId: "agent:main", risk: "safe" as const },
  ],
  exclusions: [],
}

function baseInput(): CanonicalCapabilitySelectionInput {
  return {
    runId: "run-selection",
    ownerAgentId: "agent:main",
    canonicalSnapshot,
    methodConstraints: {
      requestedMethods: [],
      exclusiveMethods: [],
    },
    selectionContext: {
      goal: "Find the current market price.",
      constraints: ["Use public information."],
      completionCriteria: ["Return a current value with source evidence."],
      failedStrategyFingerprints: [],
    },
    skillDefinitions: [
      {
        capabilityId: "skill:web-research",
        toolNames: ["web_search", "web_fetch"],
      },
    ],
    skillBindings: [
      {
        capabilityId: "skill:web-research",
        targetId: "agent:main",
        status: "enabled",
        risk: "safe",
        sourceSupported: true,
      },
    ],
    instructionSkills: [],
    instructionSkillFindings: [],
    externalTransferAllowed: true,
    maxCost: "high",
  }
}

function selectionDecision(input: LlmCapabilitySelectionProviderInput) {
  return {
    schemaVersion: 1 as const,
    runId: input.runId,
    capabilitySnapshotId: input.capabilitySnapshotId,
    capabilitySnapshotFingerprint: input.capabilitySnapshotFingerprint,
    comparedBindings: input.executableBindings.map(({ capabilityId, targetId }) => ({
      capabilityId,
      targetId,
    })),
    bindingAssessments: input.executableBindings.map((binding) => ({
      capabilityId: binding.capabilityId,
      targetId: binding.targetId,
      roleFit: binding.capabilityId === "skill:web-research" ? "fit" as const : "unfit" as const,
      permission: "allowed" as const,
      sideEffect: "read" as const,
      evidenceQuality: "direct" as const,
      dataExposure: "public" as const,
      externalTransfer: binding.capabilityId === "skill:web-research",
      cost: "low" as const,
      strategyFingerprint: `${binding.capabilityId}:initial`,
      changedFromFailedStrategies: true,
      reason: "Assessed against the structured request.",
    })),
    selectedBinding: {
      capabilityId: "skill:web-research",
      targetId: "agent:main",
    },
    reason: "Web research is required for current public information.",
  }
}

describe("canonical capability selection", () => {
  it("selects from the projected executable snapshot before execution", async () => {
    const selectCapability = vi.fn(
      async (input: LlmCapabilitySelectionProviderInput) => selectionDecision(input),
    )

    const result = await authorizeCanonicalCapabilitySelection({
      ...baseInput(),
      provider: {
        attemptCapabilitySelection: async (input) => ({
          status: "completed",
          output: await selectCapability(input),
        }),
      },
    })

    expect(result).toEqual({
      ok: true,
      mode: "selected",
      capabilitySnapshotFingerprint: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
      admission: {
        status: "allowed",
        receiptId: "receipt:capability-selection:run-selection",
        selectedBinding: {
          capabilityId: "skill:web-research",
          targetId: "agent:main",
          risk: "safe",
        },
      },
      selectedCandidateContext: {
        kind: "tool_bundle_skill",
        capabilityId: "skill:web-research",
        targetId: "agent:main",
        toolNames: ["web_fetch", "web_search"],
      },
    })
    expect(selectCapability).toHaveBeenCalledOnce()
    expect(selectCapability.mock.calls[0]?.[0].executableBindings).toEqual([
      { capabilityId: "memory_search", targetId: "agent:main", risk: "safe" },
      { capabilityId: "skill:web-research", targetId: "agent:main", risk: "safe" },
    ])
  })

  it("preserves the canonical policy path when the user specified a method", async () => {
    const selectCapability = vi.fn()
    const input = baseInput()
    input.methodConstraints.requestedMethods = ["web_search"]

    const result = await authorizeCanonicalCapabilitySelection({
      ...input,
      provider: {
        attemptCapabilitySelection: async (input) => ({
          status: "completed",
          output: await selectCapability(input),
        }),
      },
    })

    expect(result).toEqual({ ok: true, mode: "explicit_method" })
    expect(selectCapability).not.toHaveBeenCalled()
  })

  it("lets the LLM compare an instruction Skill with a Tool bundle and select the instruction", async () => {
    const selectCapability = vi.fn(async (input: LlmCapabilitySelectionProviderInput) => {
      const base = selectionDecision(input)
      return {
        ...base,
        bindingAssessments: input.executableBindings.map((binding) => ({
          capabilityId: binding.capabilityId,
          targetId: binding.targetId,
          roleFit:
            binding.capabilityId === "skill:ui-guidance" ? ("fit" as const) : ("unfit" as const),
          permission: "allowed" as const,
          sideEffect: "none" as const,
          evidenceQuality: "direct" as const,
          dataExposure: "none" as const,
          externalTransfer: false,
          cost: "none" as const,
          strategyFingerprint: `${binding.capabilityId}:instruction-comparison`,
          changedFromFailedStrategies: true,
          reason: "Assessed from the LLM candidate context.",
        })),
        selectedBinding: {
          capabilityId: "skill:ui-guidance",
          targetId: "agent:main",
        },
        reason: "The instruction Skill matches the requested UI review.",
      }
    })
    const result = await authorizeCanonicalCapabilitySelection({
      ...baseInput(),
      instructionSkills: [
        {
          capabilityId: "skill:ui-guidance",
          targetId: "agent:main",
          risk: "safe",
          content: "Review the interface for clarity and accessibility.",
          checksum: `sha256:${"b".repeat(64)}`,
        },
      ],
      provider: {
        attemptCapabilitySelection: async (input) => ({
          status: "completed",
          output: await selectCapability(input),
        }),
      },
    })

    expect(selectCapability.mock.calls[0]?.[0].candidateContexts).toEqual([
      {
        kind: "instruction_skill",
        capabilityId: "skill:ui-guidance",
        targetId: "agent:main",
        content: "Review the interface for clarity and accessibility.",
        checksum: `sha256:${"b".repeat(64)}`,
      },
      {
        kind: "tool_bundle_skill",
        capabilityId: "skill:web-research",
        targetId: "agent:main",
        toolNames: ["web_fetch", "web_search"],
      },
    ])
    expect(result).toMatchObject({
      ok: true,
      mode: "selected",
      admission: {
        status: "allowed",
        selectedBinding: {
          capabilityId: "skill:ui-guidance",
          targetId: "agent:main",
        },
      },
      selectedCandidateContext: {
        kind: "instruction_skill",
        capabilityId: "skill:ui-guidance",
        targetId: "agent:main",
        content: "Review the interface for clarity and accessibility.",
        checksum: `sha256:${"b".repeat(64)}`,
      },
    })
  })

  it("fails closed when free selection has no runtime provider", async () => {
    const result = await authorizeCanonicalCapabilitySelection(baseInput())

    expect(result).toEqual({
      ok: false,
      reasonCode: "capability_selection_provider_unavailable",
    })
  })
})
