import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { AiChatDiagnosisProviderAdapter } from "../packages/core/src/ai/diagnosis-adapter.js"
import { ObservedAIProvider } from "../packages/core/src/ai/observed-provider.js"
import { AIProviderInvocationError } from "../packages/core/src/ai/provider-failure.js"
import { AiChatSolutionPlanProviderAdapter } from "../packages/core/src/ai/solution-plan-adapter.js"
import type { AIChunk, AIProvider, ChatParams } from "../packages/core/src/ai/types.js"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.js"
import { getDb, insertSession } from "../packages/core/src/db/index.js"
import { SqliteLlmInvocationReceiptRepository } from "../packages/core/src/db/llm-invocation-receipt-repository.js"
import type {
  LlmInvocationReceiptAppendResult,
  LlmInvocationReceiptRepository,
} from "../packages/core/src/observability/llm-invocation-receipt-repository.js"
import {
  type LlmInvocationReceipt,
  buildLlmInvocationReceipt,
} from "../packages/core/src/observability/llm-invocation-receipt.js"
import { collectReleaseWindowMetricReport } from "../packages/core/src/release/release-window-metrics-use-case.js"
import { SqliteReleaseMetricRecordPort } from "../packages/core/src/release/sqlite-release-metric-record-port.js"
import { renderFinalResponseText } from "../packages/core/src/runs/final-response-renderer.js"
import { createRootRun } from "../packages/core/src/runs/store.js"
import { type TestDbRuntimeFixture, createTestDbRuntimeFixture } from "./fixtures/runtime-db.js"

class MemoryReceiptRepository implements LlmInvocationReceiptRepository {
  readonly receipts: LlmInvocationReceipt[] = []

  append(receipt: LlmInvocationReceipt): LlmInvocationReceiptAppendResult {
    const existing = this.receipts.find(
      (candidate) =>
        candidate.invocationId === receipt.invocationId && candidate.phase === receipt.phase,
    )
    if (existing) {
      return JSON.stringify(existing) === JSON.stringify(receipt)
        ? { status: "stored", inserted: false }
        : { status: "rejected", reasonCode: "receipt_conflict" }
    }
    this.receipts.push(receipt)
    return { status: "stored", inserted: true }
  }

  list(): readonly LlmInvocationReceipt[] {
    return this.receipts
  }
}

class StubProvider implements AIProvider {
  readonly id = "stub"
  readonly supportedModels = ["stub-model"]
  readonly receivedParams: ChatParams[] = []

  constructor(
    private readonly chunks: readonly AIChunk[],
    private readonly failure?: Error,
  ) {}

  async *chat(params: ChatParams): AsyncGenerator<AIChunk> {
    this.receivedParams.push(params)
    if (this.failure) throw this.failure
    yield* this.chunks
  }

  maxContextTokens(): number {
    return 10_000
  }
}

function observedParams(): ChatParams {
  return {
    model: "stub-model",
    system: "SECRET_SYSTEM_PROMPT",
    messages: [{ role: "user", content: "SECRET_USER_PROMPT https://private.example.test" }],
    observability: {
      runId: "run:task116",
      requestGroupId: "group:task116",
      sessionId: "session:task116",
      stage: "execution",
      operationCode: "agent_round",
    },
  }
}

describe("Task 116 LLM invocation receipt contract", () => {
  it("passes explicit intake and planning correlation through structured LLM adapters", async () => {
    const diagnosisProvider = new StubProvider([
      { type: "text_delta", delta: "{}" },
      { type: "message_stop", usage: { input_tokens: 1, output_tokens: 1 } },
    ])
    const planningProvider = new StubProvider([
      { type: "text_delta", delta: "{}" },
      { type: "message_stop", usage: { input_tokens: 1, output_tokens: 1 } },
    ])
    const correlation = { runId: "run:task116", sessionId: "session:task116" }

    await new AiChatDiagnosisProviderAdapter({
      provider: diagnosisProvider,
      model: "stub-model",
      diagnosisPromptSourceBlock: "diagnosis",
      observabilityContext: correlation,
    }).diagnoseRequest({} as never)
    await new AiChatSolutionPlanProviderAdapter({
      provider: planningProvider,
      model: "stub-model",
      solutionPlanPromptSourceBlock: "planning",
      observabilityContext: correlation,
    }).planSolution({} as never)

    expect(diagnosisProvider.receivedParams[0]?.observability).toEqual({
      ...correlation,
      stage: "intake",
      operationCode: "request_diagnosis",
    })
    expect(planningProvider.receivedParams[0]?.observability).toEqual({
      ...correlation,
      stage: "planning",
      operationCode: "solution_plan",
    })
  })

  it("tags the final user-facing LLM response with its run correlation", async () => {
    const provider = new StubProvider([
      { type: "text_delta", delta: "요청한 작업을 완료했습니다." },
      { type: "message_stop", usage: { input_tokens: 2, output_tokens: 3 } },
    ])

    const rendered = await renderFinalResponseText({
      runId: "run:task116",
      sessionId: "session:task116",
      originalRequest: "작업 결과를 알려줘",
      rawText: "작업 완료",
      textSource: "runtime_deterministic",
      model: "stub-model",
      provider,
      config: DEFAULT_CONFIG,
      workDir: process.cwd(),
      identityContext: {
        promptLocale: "ko",
        mainAgentSelfName: "마당쇠",
        promptContext: "[Trusted Main Agent Identity]\nCurrent main-agent self name: `마당쇠`\n",
      },
    })

    expect(rendered?.text).toBe("요청한 작업을 완료했습니다.")
    expect(provider.receivedParams[0]?.observability).toEqual({
      runId: "run:task116",
      sessionId: "session:task116",
      stage: "final_response",
      operationCode: "final_response",
    })
  })

  it("records one redacted start and completion receipt with bounded usage", async () => {
    const repository = new MemoryReceiptRepository()
    const times = [1_000, 1_250]
    const baseProvider = new StubProvider([
      { type: "text_delta", delta: "SECRET_RESPONSE" },
      { type: "message_stop", usage: { input_tokens: 11, output_tokens: 7 } },
    ])
    const provider = new ObservedAIProvider(baseProvider, {
      repository,
      now: () => times.shift() ?? 1_250,
      idProvider: () => "invocation:task116",
    })

    const chunks: AIChunk[] = []
    for await (const chunk of provider.chat(observedParams())) chunks.push(chunk)

    expect(chunks).toHaveLength(2)
    expect(repository.receipts).toEqual([
      expect.objectContaining({
        schemaVersion: 1,
        invocationId: "invocation:task116",
        phase: "started",
        at: 1_000,
      }),
      expect.objectContaining({
        invocationId: "invocation:task116",
        phase: "completed",
        at: 1_250,
        durationMs: 250,
        inputTokens: 11,
        outputTokens: 7,
      }),
    ])
    expect(JSON.stringify(repository.receipts)).not.toMatch(
      /SECRET_|private\.example|messages|system|response/i,
    )
    expect(baseProvider.receivedParams[0]).not.toHaveProperty("observability")
  })

  it("records a categorical failed terminal receipt without an error message", async () => {
    const repository = new MemoryReceiptRepository()
    const provider = new ObservedAIProvider(
      new StubProvider([], new Error("SECRET_PROVIDER_KEY")),
      {
        repository,
        now: (() => {
          const times = [2_000, 2_090]
          return () => times.shift() ?? 2_090
        })(),
        idProvider: () => "invocation:failed",
      },
    )

    await expect(async () => {
      for await (const _chunk of provider.chat(observedParams())) {
        // The provider fails before yielding.
      }
    }).rejects.toThrow("SECRET_PROVIDER_KEY")

    expect(repository.receipts.at(-1)).toMatchObject({
      phase: "failed",
      durationMs: 90,
      reasonCode: "provider_error",
    })
    expect(JSON.stringify(repository.receipts)).not.toContain("SECRET_PROVIDER_KEY")
  })

  it("preserves a bounded provider failure class without the provider message", async () => {
    const repository = new MemoryReceiptRepository()
    const provider = new ObservedAIProvider(
      new StubProvider(
        [],
        new AIProviderInvocationError("provider_contract_rejected"),
      ),
      {
        repository,
        now: (() => {
          const times = [3_000, 3_040]
          return () => times.shift() ?? 3_040
        })(),
        idProvider: () => "invocation:classified-failure",
      },
    )

    await expect(async () => {
      for await (const _chunk of provider.chat(observedParams())) {
        // The provider rejects the bounded invocation contract.
      }
    }).rejects.toThrow("AI provider invocation failed.")

    expect(repository.receipts.at(-1)).toMatchObject({
      phase: "failed",
      durationMs: 40,
      reasonCode: "provider_contract_rejected",
    })
  })

  it("rejects malformed operation context and terminal receipts without duration", () => {
    expect(
      buildLlmInvocationReceipt({
        schemaVersion: 1,
        invocationId: "invocation:invalid-stage",
        phase: "started",
        at: 1,
        context: {
          requestGroupId: "group:task116",
          stage: "untrusted_stage" as never,
          operationCode: "agent_round",
        },
      }),
    ).toMatchObject({ status: "rejected", reasonCode: "stage_invalid" })
    expect(
      buildLlmInvocationReceipt({
        schemaVersion: 1,
        invocationId: "invocation:invalid",
        phase: "started",
        at: 1,
        context: {
          requestGroupId: "group:task116",
          stage: "execution",
          operationCode: "invalid operation text",
        },
      }),
    ).toMatchObject({ status: "rejected", reasonCode: "operation_code_invalid" })
    expect(
      buildLlmInvocationReceipt({
        schemaVersion: 1,
        invocationId: "invocation:invalid-terminal",
        phase: "completed",
        at: 2,
        context: {
          requestGroupId: "group:task116",
          stage: "execution",
          operationCode: "agent_round",
        },
      }),
    ).toMatchObject({ status: "rejected", reasonCode: "terminal_duration_required" })
  })
})

describe("Task 116 persisted LLM invocation metrics", () => {
  let runtime: TestDbRuntimeFixture

  beforeEach(() => {
    runtime = createTestDbRuntimeFixture("knowbee-task116-llm-receipt-")
    insertSession({
      id: "session:task116",
      source: "telegram",
      source_id: "chat:task116",
      created_at: 1_000,
      updated_at: 1_500,
      summary: "task116",
    })
    createRootRun({
      id: "run:task116",
      sessionId: "session:task116",
      requestGroupId: "group:task116",
      prompt: "SECRET_PERSISTED_PROMPT",
      source: "telegram",
    })
    getDb()
      .prepare(
        "UPDATE root_runs SET created_at = ?, updated_at = ?, status = ?, current_step_key = ? WHERE id = ?",
      )
      .run(1_000, 1_500, "completed", "completed", "run:task116")
  })

  afterEach(() => runtime.dispose())

  it("replays idempotently after repository recreation and feeds measured release metrics", () => {
    const started: LlmInvocationReceipt = {
      schemaVersion: 1,
      invocationId: "invocation:persisted",
      phase: "started",
      at: 1_100,
      context: {
        runId: "run:task116",
        requestGroupId: "group:task116",
        sessionId: "session:task116",
        stage: "review",
        operationCode: "completion_review",
      },
    }
    const completed: LlmInvocationReceipt = {
      ...started,
      phase: "completed",
      at: 1_300,
      durationMs: 200,
      inputTokens: 20,
      outputTokens: 10,
    }
    const firstRepository = new SqliteLlmInvocationReceiptRepository()
    expect(firstRepository.append(started)).toMatchObject({ status: "stored", inserted: true })
    expect(firstRepository.append(completed)).toMatchObject({ status: "stored", inserted: true })
    const replayRepository = new SqliteLlmInvocationReceiptRepository()
    expect(replayRepository.append(completed)).toMatchObject({ status: "stored", inserted: false })

    const report = collectReleaseWindowMetricReport({
      window: { windowId: "task116-persisted", startAt: 900, endAt: 1_600 },
      requiredStages: ["request_total", "llm_execution"],
      configuredStages: ["request_total", "llm_execution"],
      requiredCounters: ["llm_invocation"],
      configuredCounters: ["llm_invocation"],
      baseline: {
        baselineId: "task116-baseline",
        approvedAt: 800,
        stageLimits: {
          request_total: { p95MaxMs: 1_000 },
          llm_execution: { p95MaxMs: 500 },
        },
      },
      recordPort: new SqliteReleaseMetricRecordPort(),
    })

    expect(report.metrics.find((metric) => metric.stage === "llm_execution")).toMatchObject({
      observation: "measured",
      count: 1,
      p95Ms: 200,
    })
    expect(report.counters.find((counter) => counter.counter === "llm_invocation")).toEqual({
      counter: "llm_invocation",
      observation: "measured",
      count: 1,
    })
    expect(report.admission.status).toBe("admitted")
    expect(JSON.stringify(report)).not.toMatch(/SECRET_|completion_review|session:task116/i)
  })

  it("does not count an incomplete started receipt as a zero-duration invocation", () => {
    new SqliteLlmInvocationReceiptRepository().append({
      schemaVersion: 1,
      invocationId: "invocation:incomplete",
      phase: "started",
      at: 1_200,
      context: {
        runId: "run:task116",
        requestGroupId: "group:task116",
        stage: "execution",
        operationCode: "agent_round",
      },
    })

    const report = collectReleaseWindowMetricReport({
      window: { windowId: "task116-incomplete", startAt: 900, endAt: 1_600 },
      requiredStages: ["llm_execution"],
      configuredStages: ["llm_execution"],
      requiredCounters: ["llm_invocation"],
      configuredCounters: ["llm_invocation"],
      baseline: null,
      recordPort: new SqliteReleaseMetricRecordPort(),
    })

    expect(report.metrics.find((metric) => metric.stage === "llm_execution")).toMatchObject({
      observation: "not_observed",
      count: 0,
      p95Ms: null,
    })
    expect(report.counters.find((counter) => counter.counter === "llm_invocation")).toMatchObject({
      observation: "not_observed",
      count: null,
    })
    expect(report.admission.state).toBe("coverage_evaluated")
  })
})
