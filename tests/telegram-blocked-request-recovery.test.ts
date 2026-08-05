import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import { LLM_INTAKE_RESULT_NOTE } from "../packages/core/src/agent/intake.ts"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import { runIntakeBridgePass } from "../packages/core/src/runs/intake-bridge-pass.ts"
import { createTestAgentRuntimeDependencies } from "./fixtures/agent-runtime.ts"

const runtime = createTestAgentRuntimeDependencies("/tmp/knowbee-telegram-blocked-recovery")

function baseIntake() {
  return {
    intent: {
      category: "task_intake" as const,
      summary: "answer the request",
      confidence: 1,
    },
    user_message: {
      mode: "accepted_receipt" as const,
      text: "The request was accepted.",
    },
    action_items: [{
      id: "run-1",
      type: "run_task" as const,
      title: "answer",
      priority: "normal" as const,
      reason: "answer with an available method",
      payload: { prompt: "answer" },
    }],
    structured_request: {
      source_language: "ko" as const,
      normalized_english: "Answer the request.",
      target: "answer",
      to: "telegram user",
      context: [],
      complete_condition: ["provide an answer"],
    },
    intent_envelope: {
      intent_type: "task_intake" as const,
      source_language: "ko" as const,
      normalized_english: "Answer the request.",
      target: "answer",
      destination: "telegram user",
      context: [],
      complete_condition: ["provide an answer"],
      schedule_spec: {
        detected: false,
        kind: "none" as const,
        status: "not_applicable" as const,
        schedule_text: "",
      },
      execution_semantics: {
        filesystemEffect: "none" as const,
        privilegedOperation: "none" as const,
        artifactDelivery: "none" as const,
        approvalRequired: false,
        approvalTool: "external_action" as const,
      },
      delivery_mode: "none" as const,
      requires_approval: false,
      approval_tool: "external_action" as const,
      preferred_target: "auto",
      needs_tools: false,
      needs_web: false,
    },
    scheduling: {
      detected: false,
      kind: "none" as const,
      status: "not_applicable" as const,
      schedule_text: "",
    },
    execution: {
      requires_run: true,
      requires_delegation: false,
      suggested_target: "auto",
      max_delegation_turns: 3,
      needs_tools: false,
      needs_web: false,
      execution_semantics: {
        filesystemEffect: "none" as const,
        privilegedOperation: "none" as const,
        artifactDelivery: "none" as const,
        approvalRequired: false,
        approvalTool: "external_action" as const,
      },
    },
    notes: [LLM_INTAKE_RESULT_NOTE],
  }
}

function dependencies() {
  return {
    appendRunEvent: vi.fn(),
    updateRunSummary: vi.fn(),
    incrementDelegationTurnCount: vi.fn(),
    emitScheduleCreated: vi.fn(),
    emitScheduleCancelled: vi.fn(),
    scheduleDelayedRun: vi.fn(),
    startDelegatedRun: vi.fn(),
    normalizeTaskProfile: vi.fn(() => "general_chat" as const),
    recordCanonicalIntakeDiagnosis: vi.fn(async () => ({ ok: true as const })),
    authorizeCanonicalIntakePlan: vi.fn(async () => ({ ok: true as const })),
    recordCanonicalExecutionStart: vi.fn(async () => ({ ok: true as const })),
    releaseCanonicalSimplePath: vi.fn(async () => ({ ok: true as const })),
    logInfo: vi.fn(),
  }
}

function params() {
  return {
    artifactStorage: runtime.artifactStorage,
    config: DEFAULT_CONFIG,
    message: "대답해줘",
    originalRequest: "대답해줘",
    sessionId: "session-telegram",
    requestGroupId: "group-telegram",
    model: "gpt-test",
    workDir: "/tmp",
    source: "telegram" as const,
    runId: "run-telegram",
    onChunk: undefined,
    reuseConversationContext: false,
  }
}

describe("Telegram blocked request recovery", () => {
  it("completes an LLM direct answer without capability or policy admission", async () => {
    const deps = dependencies()
    const intake = {
      ...baseIntake(),
      intent: { category: "direct_answer" as const, summary: "direct answer", confidence: 1 },
      user_message: { mode: "direct_answer" as const, text: "요청에 대한 답변입니다." },
      action_items: [],
      execution: {
        ...baseIntake().execution,
        requires_run: false,
      },
    }

    const result = await runIntakeBridgePass(
      params(),
      deps,
      { analyzeTaskIntake: vi.fn(async () => intake) } as never,
    )

    expect(result).toMatchObject({
      kind: "complete",
      text: "요청에 대한 답변입니다.",
      textSource: "llm_generated",
    })
    expect(deps.releaseCanonicalSimplePath).toHaveBeenCalledOnce()
    expect(deps.authorizeCanonicalIntakePlan).not.toHaveBeenCalled()
  })

  it.each(["required_method_unavailable", "capability_denied"] as const)(
    "blocks %s without inline reanalysis or execution",
    async (reasonCode) => {
      const deps = dependencies()
      deps.authorizeCanonicalIntakePlan.mockResolvedValue({
        ok: false as const,
        reasonCode,
        safeEvidenceRefs: [
          "decision-trace:trace-telegram-1",
          "capability-rejection:failed_strategy_reselected",
        ],
      })

      await expect(runIntakeBridgePass(
        params(),
        deps,
        { analyzeTaskIntake: vi.fn(async () => baseIntake()) } as never,
      )).rejects.toMatchObject({
        kind: "knowbee.canonical_execution_failure.v1",
        phase: "policy",
        reasonCode,
        retryable: false,
      })
      expect(deps.recordCanonicalExecutionStart).not.toHaveBeenCalled()
    },
  )

  it("does not hard-code safe-alternative exhaustion at first policy denial", () => {
    const source = readFileSync(
      new URL("../packages/core/src/runs/start-driver-dependencies.ts", import.meta.url),
      "utf8",
    )
    expect(source).not.toContain("safeAlternativesExhausted: true")
  })
})
