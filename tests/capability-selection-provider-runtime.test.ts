import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import type { AIChunk, AIProvider, ChatParams } from "../packages/core/src/ai/types.ts"
import type {
  LlmCapabilitySelectionAttemptProvider,
  LlmCapabilitySelectionDecision,
  LlmCapabilitySelectionProviderInput,
  LlmCapabilitySelectionSchemaRepairProvider,
} from "../packages/core/src/contracts/llm-capability-selection.ts"
import {
  createFileBackedCapabilitySelectionProvider,
  selectCapabilitySelectionPromptSources,
} from "../packages/core/src/orchestration/prompt-policy-adapter.ts"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"
import { createRuntimeCapabilitySelectionProvider } from "../packages/core/src/runs/capability-selection-provider-runtime.ts"

const roots: string[] = []

function decision(input: LlmCapabilitySelectionProviderInput): LlmCapabilitySelectionDecision {
  const selected = input.executableBindings[0]!
  return {
    schemaVersion: 1,
    runId: input.runId,
    capabilitySnapshotId: input.capabilitySnapshotId,
    capabilitySnapshotFingerprint: input.capabilitySnapshotFingerprint,
    comparedBindings: input.executableBindings.map(({ capabilityId, targetId }) => ({
      capabilityId,
      targetId,
    })),
    bindingAssessments: input.executableBindings.map((binding, index) => ({
      capabilityId: binding.capabilityId,
      targetId: binding.targetId,
      roleFit: index === 0 ? "fit" : "unfit",
      permission: binding.risk === "safe" ? "allowed" : "approval_required",
      sideEffect: "none",
      evidenceQuality: "indirect",
      dataExposure: "public",
      externalTransfer: true,
      cost: "low",
      strategyFingerprint: `${binding.capabilityId}:v2`,
      changedFromFailedStrategies: true,
      reason: index === 0 ? "Matches the requested current-information goal." : "Does not match.",
    })),
    selectedBinding: {
      capabilityId: selected.capabilityId,
      targetId: selected.targetId,
    },
    reason: "The selected capability best satisfies the structured goal.",
  }
}

class FakeProvider implements AIProvider {
  readonly id = "fake"
  readonly supportedModels = ["fake-model"]
  readonly calls: ChatParams[] = []

  maxContextTokens(): number {
    return 16_000
  }

  async *chat(params: ChatParams): AsyncGenerator<AIChunk> {
    this.calls.push(params)
    const payload = JSON.parse(String(params.messages[0]?.content)) as {
      input?: LlmCapabilitySelectionProviderInput
      repair?: { subject: LlmCapabilitySelectionProviderInput }
    }
    const input = payload.input ?? payload.repair?.subject
    if (!input) throw new Error("structured capability input missing")
    yield { type: "text_delta", delta: JSON.stringify(decision(input)) }
  }
}

function promptRoot(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "knowbee-capability-selection-"))
  roots.push(root)
  mkdirSync(join(root, "prompts"))
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(root, "prompts", name), content)
  }
  return root
}

function completePromptRoot(): string {
  return promptRoot({
    "capability_selection.md": "# Capability Selection\n\nCAPABILITY_SELECTION_MARKER\n",
    "capability_selection_json_instruction_user.md":
      "# Capability Selection JSON Instruction\n\n## Value\nReturn the exact selection JSON object.\n",
  })
}

const selectionInput: LlmCapabilitySelectionProviderInput = {
  runId: "run-selection-1",
  capabilitySnapshotId: "snapshot-selection-1",
  capabilitySnapshotFingerprint: `sha256:${"a".repeat(64)}`,
  selectionContext: {
    goal: "Find the current market price.",
    constraints: ["Use public information."],
    completionCriteria: ["Return a current value with source evidence."],
    failedStrategyFingerprints: ["skill:web-research:v1"],
  },
  executableBindings: [
    { capabilityId: "skill:web-research", targetId: "agent:main", risk: "safe" },
    { capabilityId: "skill:files", targetId: "agent:main", risk: "approval_required" },
  ],
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop() ?? "", { recursive: true, force: true })
})

describe("capability selection provider runtime", () => {
  it("creates one provider from explicit startup inputs", () => {
    const selected: LlmCapabilitySelectionAttemptProvider &
      LlmCapabilitySelectionSchemaRepairProvider = {
      attemptCapabilitySelection: async (input) => ({
        status: "completed",
        output: decision(input),
      }),
      repairCapabilitySelection: async (input) => ({
        status: "completed",
        output: decision(input.subject),
      }),
    }
    const aiProvider = new FakeProvider()

    expect(
      createRuntimeCapabilitySelectionProvider({
        provider: aiProvider,
        model: "fake-model",
        workDir: "/workspace",
        factory: (input) => {
          expect(input).toEqual({
            provider: aiProvider,
            model: "fake-model",
            workDir: "/workspace",
            maxTokens: 12_288,
            deadlineMs: 180_000,
            maxVisibleTextBytes: 65_536,
          })
          return selected
        },
      }),
    ).toEqual({
      status: "ready",
      capabilitySelectionProvider: selected,
      fieldDebugEvent: "runtime_capability_selection_provider:ready",
    })
  })

  it("returns closed skipped and redacted unavailable results", () => {
    expect(createRuntimeCapabilitySelectionProvider({ workDir: "/workspace" })).toMatchObject({
      status: "skipped",
      reasonCode: "provider_missing",
    })
    expect(
      createRuntimeCapabilitySelectionProvider({
        provider: new FakeProvider(),
        model: " ",
        workDir: "/workspace",
      }),
    ).toMatchObject({ status: "skipped", reasonCode: "model_missing" })

    const failed = createRuntimeCapabilitySelectionProvider({
      provider: new FakeProvider(),
      model: "fake-model",
      workDir: "/workspace",
      factory: () => {
        throw new Error("token=secret capability prompt missing")
      },
    })
    expect(failed).toMatchObject({
      status: "unavailable",
      reasonCode: "capability_selection_provider_factory_failed",
    })
    expect(failed.fieldDebugEvent).not.toContain("secret")
  })

  it("uses the dedicated English prompt and structured selection context", async () => {
    const root = completePromptRoot()
    const sources = selectCapabilitySelectionPromptSources({
      sources: loadPromptSourceRegistry(root),
      locale: "en",
    })
    expect(sources.map((source) => source.sourceId)).toEqual(["capability_selection"])

    const provider = new FakeProvider()
    const adapter = createFileBackedCapabilitySelectionProvider({
      provider,
      model: "fake-model",
      workDir: root,
      maxTokens: 12_288,
      deadlineMs: 180_000,
      maxVisibleTextBytes: 65_536,
      observabilityContext: { runId: selectionInput.runId },
    })
    expect(await adapter.attemptCapabilitySelection(selectionInput)).toEqual({
      status: "completed",
      output: decision(selectionInput),
    })

    expect(provider.calls).toHaveLength(1)
    expect(provider.calls[0]?.system).toContain("CAPABILITY_SELECTION_MARKER")
    expect(provider.calls[0]?.observability).toMatchObject({
      stage: "planning",
      operationCode: "capability_selection",
    })
    expect(provider.calls[0]?.maxTokens).toBe(12_288)
    expect(provider.calls[0]?.signal).toBeInstanceOf(AbortSignal)
    const payload = JSON.parse(String(provider.calls[0]?.messages[0]?.content))
    expect(payload).toMatchObject({
      kind: "capability_selection",
      instruction: "Return the exact selection JSON object.",
      input: {
        selectionContext: selectionInput.selectionContext,
        executableBindings: selectionInput.executableBindings,
      },
    })
  })

  it("does not expose malformed model output through the adapter result", async () => {
    const root = completePromptRoot()
    const provider = new FakeProvider()
    provider.chat = async function* (params: ChatParams): AsyncGenerator<AIChunk> {
      this.calls.push(params)
      yield { type: "text_delta", delta: "secret malformed response" }
    }
    const adapter = createFileBackedCapabilitySelectionProvider({
      provider,
      model: "fake-model",
      workDir: root,
    })

    const result = await adapter.attemptCapabilitySelection(selectionInput)

    expect(result).toEqual({
      status: "invalid_output",
      reasonCode: "invalid_json",
    })
    expect(JSON.stringify(result)).not.toContain("secret malformed response")
  })

  it("sends schema repair as a distinct structured LLM operation", async () => {
    const root = completePromptRoot()
    const provider = new FakeProvider()
    const adapter = createFileBackedCapabilitySelectionProvider({
      provider,
      model: "fake-model",
      workDir: root,
      maxTokens: 12_288,
      deadlineMs: 180_000,
      maxVisibleTextBytes: 65_536,
      observabilityContext: { runId: selectionInput.runId },
    })

    await adapter.repairCapabilitySelection({
      subject: selectionInput,
      invalidOutput: { schemaVersion: 1 },
      validationReasonCodes: ["run_id_required"],
      repairAttemptNumber: 1,
    })

    const call = provider.calls[0]
    const payload = JSON.parse(String(call?.messages[0]?.content))
    expect(payload).toMatchObject({
      kind: "capability_selection_schema_repair",
      repair: {
        validationReasonCodes: ["run_id_required"],
        repairAttemptNumber: 1,
      },
    })
    expect(call?.observability?.operationCode).toBe("capability_selection_schema_repair")
  })

  it("fails closed when the dedicated system prompt source is missing", () => {
    const root = promptRoot({
      "capability_selection_json_instruction_user.md":
        "# Capability Selection JSON Instruction\n\n## Value\nReturn JSON.\n",
    })
    expect(() =>
      createFileBackedCapabilitySelectionProvider({
        provider: new FakeProvider(),
        model: "fake-model",
        workDir: root,
      }),
    ).toThrow(/capability selection prompt sources missing: capability_selection/iu)
  })
})
