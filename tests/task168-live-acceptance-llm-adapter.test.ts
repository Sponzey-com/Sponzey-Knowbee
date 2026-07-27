import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import type { AIChunk, AIProvider, ChatParams } from "../packages/core/src/ai/types.ts"
import type { LoadedPromptSource } from "../packages/core/src/memory/knowbee-md.ts"
import {
  LiveAcceptanceLlmAdapterError,
  createFileBackedLiveAcceptanceLlmPorts,
  selectLiveAcceptancePromptSource,
} from "../packages/core/src/release/live-acceptance-llm-adapter.ts"
import {
  type ExtensionLiveSmokeDiagnosisInput,
  type ExtensionLiveSmokeSelection,
  runExtensionLiveSmokeScenarios,
} from "../packages/core/src/runs/extension-live-smoke-runner.ts"
import type {
  WebRetrievalLiveDiagnosisInput,
  WebRetrievalLivePlanInput,
} from "../packages/core/src/runs/web-retrieval-live-runner.ts"
import { runWebRetrievalLiveScenario } from "../packages/core/src/runs/web-retrieval-live-runner.ts"
import type { WebRetrievalLiveSmokeScenario } from "../packages/core/src/runs/web-retrieval-smoke.ts"
import {
  type YeonjangLiveSmokeDiagnosisInput,
  runYeonjangLiveSmokeScenario,
} from "../packages/core/src/runs/yeonjang-live-smoke-runner.ts"

const roots: string[] = []
const RUN_ID = "live-acceptance:task168"
const SECRET = "sk-task168-super-private-token"
const FINGERPRINT = `sha256:${"a".repeat(64)}` as const
const EVIDENCE_REF = `tool-result:task168:${"b".repeat(64)}`
const SNAPSHOT_AT = Date.parse("2026-07-17T20:30:00.000Z")

class QueueProvider implements AIProvider {
  readonly id = "task168-provider"
  readonly supportedModels = ["task168-model"]
  readonly calls: ChatParams[] = []

  constructor(private readonly outputs: readonly string[]) {}

  maxContextTokens(): number {
    return 16_000
  }

  async *chat(params: ChatParams): AsyncGenerator<AIChunk> {
    this.calls.push(params)
    const output = this.outputs[this.calls.length - 1] ?? "{}"
    yield { type: "text_delta", delta: output.slice(0, Math.ceil(output.length / 2)) }
    yield { type: "text_delta", delta: output.slice(Math.ceil(output.length / 2)) }
    yield { type: "message_stop", usage: { input_tokens: 10, output_tokens: 20 } }
  }
}

function promptRoot(content = "# Live Acceptance Evidence\n\nTASK168_PROMPT_MARKER\n"): string {
  const root = mkdtempSync(join(tmpdir(), "knowbee-task168-prompts-"))
  roots.push(root)
  mkdirSync(join(root, "prompts"))
  writeFileSync(join(root, "prompts", "live_acceptance_evidence.md"), content)
  return root
}

function scenario(): WebRetrievalLiveSmokeScenario {
  return {
    id: "current-fact",
    title: "Current fact",
    request: "현재 값을 확인해줘",
    target: { canonicalName: "target", market: "test-market" },
    freshnessPolicy: "strict_timestamp",
    minimumMethods: ["search", "direct_fetch"],
    completionConditions: ["value and source timestamp match the target"],
  }
}

function webPlanInput(signal: AbortSignal): WebRetrievalLivePlanInput {
  return {
    runId: RUN_ID,
    scenario: scenario(),
    signal,
    candidates: [
      {
        evidenceRef: `tool-result:web-search:${"c".repeat(64)}`,
        sourceUrl: "https://quote.example/current",
        sourceDomain: "quote.example",
        sourceTimestamp: "2026-07-17T19:59:00.000Z",
        fetchedAt: "2026-07-17T19:59:01.000Z",
      },
    ],
    diagnosisPayload: { output: `search result ${SECRET}` },
  }
}

function webDiagnosisInput(signal: AbortSignal): WebRetrievalLiveDiagnosisInput {
  return {
    runId: RUN_ID,
    scenario: scenario(),
    signal,
    evidenceRef: EVIDENCE_REF,
    requestedTargetFingerprint: FINGERPRINT,
    diagnosisPayload: { output: `current result ${SECRET}` },
  }
}

function extensionDiagnosisInput(signal: AbortSignal): ExtensionLiveSmokeDiagnosisInput {
  return {
    runId: RUN_ID,
    signal,
    evidenceRef: EVIDENCE_REF,
    scenario: {
      id: "live-acceptance:skill",
      capability: "skill",
      expectedAgentId: "agent:release",
      expectedBindingId: "binding:release:skill",
      expectedCatalogId: "skill:release",
      expectedToolName: "release_read",
      readOnly: true,
    },
    diagnosisPayload: { output: `skill result ${SECRET}` },
  }
}

function yeonjangDiagnosisInput(signal: AbortSignal): YeonjangLiveSmokeDiagnosisInput {
  return {
    runId: RUN_ID,
    signal,
    evidenceRef: EVIDENCE_REF,
    scenario: {
      id: "live-acceptance:yeonjang",
      expectedInstanceId: "instance:office",
      expectedSessionId: "session:office:1",
      expectedMethod: "system.info",
      readOnly: true,
    },
    diagnosisPayload: { output: `system info ${SECRET}` },
  }
}

function planReceipt() {
  const candidate = webPlanInput(new AbortController().signal).candidates[0]
  if (!candidate) throw new Error("missing_candidate_fixture")
  return {
    diagnosedBy: "llm",
    status: "selected",
    contextFingerprint: FINGERPRINT,
    selectedEvidenceRef: candidate.evidenceRef,
    selectedSourceUrl: candidate.sourceUrl,
    requestedTargetFingerprint: FINGERPRINT,
  }
}

function diagnosisReceipt(criteria: readonly string[]) {
  return {
    diagnosedBy: "llm",
    status: "complete",
    contextFingerprint: FINGERPRINT,
    criterionKeys: criteria,
    evidenceRefs: [EVIDENCE_REF],
  }
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop() ?? "", { recursive: true, force: true })
})

describe("Task 168 file-backed live acceptance LLM adapter", () => {
  it("keeps prompt instructions, provider resolution, config and environment outside adapter source", () => {
    const source = readFileSync(
      join(process.cwd(), "packages/core/src/release/live-acceptance-llm-adapter.ts"),
      "utf8",
    )

    expect(source).not.toContain("process.env")
    expect(source).not.toContain("getProvider(")
    expect(source).not.toContain("loadConfig")
    expect(source).not.toContain("Return one compact JSON")
    expect(source).not.toContain("Select only a candidate")
  })

  it("uses one external English prompt and calls all four LLM ports with explicit runtime inputs", async () => {
    const provider = new QueueProvider([
      JSON.stringify(planReceipt()),
      JSON.stringify({
        ...diagnosisReceipt(["existence", "accuracy", "freshness", "target_match"]),
        conditionCount: 1,
        targetBinding: {
          status: "verified",
          requestedTargetFingerprint: FINGERPRINT,
          evidenceTargetFingerprint: FINGERPRINT,
        },
      }),
      JSON.stringify(
        diagnosisReceipt(["existence", "accuracy", "target_match", "constraint_compliance"]),
      ),
      JSON.stringify(
        diagnosisReceipt(["existence", "accuracy", "target_match", "constraint_compliance"]),
      ),
    ])
    const controller = new AbortController()
    const ports = createFileBackedLiveAcceptanceLlmPorts({
      provider,
      model: "task168-model",
      workDir: promptRoot(),
      maxTokens: 640,
      observabilityContext: { runId: RUN_ID, requestGroupId: RUN_ID },
    })

    await expect(ports.webPlan(webPlanInput(controller.signal))).resolves.toEqual(planReceipt())
    await expect(ports.webDiagnosis(webDiagnosisInput(controller.signal))).resolves.toEqual(
      expect.objectContaining({ diagnosedBy: "llm", conditionCount: 1 }),
    )
    await expect(
      ports.extensionDiagnosis(extensionDiagnosisInput(controller.signal)),
    ).resolves.toEqual(expect.objectContaining({ diagnosedBy: "llm" }))
    await expect(
      ports.yeonjangDiagnosis(yeonjangDiagnosisInput(controller.signal)),
    ).resolves.toEqual(expect.objectContaining({ diagnosedBy: "llm" }))

    expect(provider.calls).toHaveLength(4)
    expect(provider.calls.every((call) => call.model === "task168-model")).toBe(true)
    expect(provider.calls.every((call) => call.maxTokens === 640)).toBe(true)
    expect(provider.calls.every((call) => call.signal === controller.signal)).toBe(true)
    expect(provider.calls.every((call) => call.system?.includes("TASK168_PROMPT_MARKER"))).toBe(
      true,
    )
    expect(provider.calls.map((call) => call.observability?.operationCode)).toEqual([
      "live_web_source_plan",
      "live_web_result_diagnosis",
      "live_extension_result_diagnosis",
      "live_yeonjang_result_diagnosis",
    ])
    expect(provider.calls.map((call) => call.observability?.stage)).toEqual([
      "planning",
      "review",
      "review",
      "review",
    ])
  })

  it("projects every raw evidence payload as redacted untrusted data", async () => {
    const provider = new QueueProvider([
      JSON.stringify(planReceipt()),
      JSON.stringify(diagnosisReceipt(["existence"])),
      JSON.stringify(diagnosisReceipt(["existence"])),
      JSON.stringify(diagnosisReceipt(["existence"])),
    ])
    const signal = new AbortController().signal
    const ports = createFileBackedLiveAcceptanceLlmPorts({
      provider,
      model: "task168-model",
      workDir: promptRoot(),
    })

    await ports.webPlan(webPlanInput(signal))
    await ports.webDiagnosis(webDiagnosisInput(signal))
    await ports.extensionDiagnosis(extensionDiagnosisInput(signal))
    await ports.yeonjangDiagnosis(yeonjangDiagnosisInput(signal))

    for (const call of provider.calls) {
      const content = call.messages[0]?.content
      expect(typeof content).toBe("string")
      const payload = JSON.parse(String(content)) as Record<string, unknown>
      const serialized = JSON.stringify(payload)
      expect(serialized).toContain("untrusted_external")
      expect(serialized).toContain("data_only")
      expect(serialized).toContain("external_data")
      expect(serialized).toContain("[redacted-secret]")
      expect(serialized).not.toContain(SECRET)
    }
  })

  it("produces receipts accepted by the Web, extension and Yeonjang live runners", async () => {
    const skillSelection: ExtensionLiveSmokeSelection = {
      scenario: extensionDiagnosisInput(new AbortController().signal).scenario,
      params: { probe: "health" },
      authorization: {
        snapshotCapturedAt: SNAPSHOT_AT,
        capability: "skill",
        agentId: "agent:release",
        bindingId: "binding:release:skill",
        catalogId: "skill:release",
        toolName: "release_read",
      },
    }
    const mcpSelection: ExtensionLiveSmokeSelection = {
      scenario: {
        ...skillSelection.scenario,
        id: "live-acceptance:mcp",
        capability: "mcp",
        expectedBindingId: "binding:release:mcp",
        expectedCatalogId: "mcp:release",
        expectedToolName: "mcp_release_read",
      },
      params: { probe: "health" },
      authorization: {
        snapshotCapturedAt: SNAPSHOT_AT,
        capability: "mcp",
        agentId: "agent:release",
        bindingId: "binding:release:mcp",
        catalogId: "mcp:release",
        toolName: "mcp_release_read",
        secretScopeId: "secret:release:mcp",
      },
    }
    const webEvidenceRef = `tool-result:web-fetch:${"d".repeat(64)}`
    const outputs = [
      planReceipt(),
      {
        ...diagnosisReceipt(["existence", "accuracy", "freshness", "target_match"]),
        evidenceRefs: [webEvidenceRef],
        conditionCount: 1,
        targetBinding: {
          status: "verified",
          requestedTargetFingerprint: FINGERPRINT,
          evidenceTargetFingerprint: FINGERPRINT,
        },
      },
      diagnosisReceipt(["existence", "accuracy", "target_match", "constraint_compliance"]),
      diagnosisReceipt(["existence", "accuracy", "target_match", "constraint_compliance"]),
      diagnosisReceipt(["existence", "accuracy", "target_match", "constraint_compliance"]),
    ]
    const provider = new QueueProvider(outputs.map((output) => JSON.stringify(output)))
    const ports = createFileBackedLiveAcceptanceLlmPorts({
      provider,
      model: "task168-model",
      workDir: promptRoot(),
    })
    const signal = new AbortController().signal
    const web = await runWebRetrievalLiveScenario({
      runId: RUN_ID,
      scenario: scenario(),
      search: async () => ({
        candidates: webPlanInput(signal).candidates,
        auditEventId: "audit:web-search:168",
        diagnosisPayload: { output: "search" },
      }),
      plan: ports.webPlan,
      fetch: async () => ({
        evidenceRef: webEvidenceRef,
        sourceDomain: "quote.example",
        sourceTimestamp: "2026-07-17T19:59:00.000Z",
        fetchedAt: "2026-07-17T19:59:01.000Z",
        auditEventId: "audit:web-fetch:168",
        diagnosisPayload: { output: "current value" },
      }),
      diagnose: ports.webDiagnosis,
      signal,
    })
    const extensions = await runExtensionLiveSmokeScenarios({
      runId: RUN_ID,
      selections: [skillSelection, mcpSelection],
      execute: async ({ selection }) => {
        const evidenceRef = EVIDENCE_REF
        return {
          toolExecution: {
            runId: RUN_ID,
            requestGroupId: RUN_ID,
            capability: selection.scenario.capability,
            agentId: selection.scenario.expectedAgentId,
            bindingId: selection.scenario.expectedBindingId,
            catalogId: selection.scenario.expectedCatalogId,
            toolName: selection.scenario.expectedToolName,
            status: "succeeded",
            executionObserved: true,
            evidenceRef,
          },
          auditEventId: `audit:${selection.scenario.capability}:168`,
          diagnosisPayload: { output: "extension result" },
        }
      },
      diagnose: ports.extensionDiagnosis,
      now: () => Date.parse("2026-07-17T20:00:00.000Z"),
      signal,
    })
    const yeonjang = await runYeonjangLiveSmokeScenario({
      runId: RUN_ID,
      selection: {
        scenario: yeonjangDiagnosisInput(signal).scenario,
        instance: {
          instanceId: "instance:office",
          publicName: "Office",
          sessionId: "session:office:1",
          status: "connected",
          observedAt: Date.parse("2026-07-17T19:59:59.000Z"),
          duplicateActiveIdentityCount: 0,
          trustState: "trusted",
          runnableTarget: true,
        },
      },
      execute: async () => ({
        command: {
          runId: RUN_ID,
          requestGroupId: RUN_ID,
          commandId: "command:168",
          instanceId: "instance:office",
          sessionId: "session:office:1",
          method: "system.info",
          readOnly: true,
          deliveryStatus: "acked",
        },
        observedResult: {
          runId: RUN_ID,
          commandId: "command:168",
          instanceId: "instance:office",
          sessionId: "session:office:1",
          status: "observed",
          evidenceRef: EVIDENCE_REF,
        },
        auditEventId: "audit:yeonjang:168",
        diagnosisPayload: { output: "system info" },
      }),
      diagnose: ports.yeonjangDiagnosis,
      maxInstanceAgeMs: 30_000,
      now: () => Date.parse("2026-07-17T20:00:00.000Z"),
      signal,
    })

    expect(web.answerProduced).toBe(true)
    expect(extensions.status).toBe("passed")
    expect(yeonjang.status).toBe("passed")
    expect(provider.calls).toHaveLength(5)
  })

  it("rejects missing, duplicate or non-English prompt selection", () => {
    const valid: LoadedPromptSource = {
      sourceId: "live_acceptance_evidence",
      locale: "en",
      path: "/internal/live_acceptance_evidence.md",
      version: "1",
      priority: 235,
      enabled: true,
      required: false,
      usageScope: "internal",
      checksum: "checksum",
      content: "PROMPT",
    }

    expect(() => selectLiveAcceptancePromptSource([])).toThrowError(
      expect.objectContaining({ code: "live_acceptance_prompt_missing" }),
    )
    expect(() => selectLiveAcceptancePromptSource([valid, { ...valid }])).toThrowError(
      expect.objectContaining({ code: "live_acceptance_prompt_ambiguous" }),
    )
    expect(() => selectLiveAcceptancePromptSource([{ ...valid, locale: "ko" }])).toThrowError(
      expect.objectContaining({ code: "live_acceptance_prompt_missing" }),
    )
  })

  it("returns bounded errors without raw provider output and fails fast on cancellation", async () => {
    const rawOutput = `not-json-${SECRET}`
    const provider = new QueueProvider([rawOutput, "[]"])
    const ports = createFileBackedLiveAcceptanceLlmPorts({
      provider,
      model: "task168-model",
      workDir: promptRoot(),
    })
    const invalid = await ports.webPlan(webPlanInput(new AbortController().signal))

    expect(invalid).toEqual({ liveAcceptanceLlmAdapterError: "invalid_json" })
    expect(JSON.stringify(invalid)).not.toContain(rawOutput)
    expect(JSON.stringify(invalid)).not.toContain(SECRET)
    await expect(ports.webPlan(webPlanInput(new AbortController().signal))).resolves.toEqual({
      liveAcceptanceLlmAdapterError: "json_object_required",
    })

    const controller = new AbortController()
    controller.abort()
    await expect(ports.webPlan(webPlanInput(controller.signal))).rejects.toBeInstanceOf(
      LiveAcceptanceLlmAdapterError,
    )
    expect(provider.calls).toHaveLength(2)
  })
})
