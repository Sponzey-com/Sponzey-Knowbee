import { describe, expect, it, vi } from "vitest"
import { LLM_INTAKE_RESULT_NOTE } from "../packages/core/src/agent/intake.ts"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import { createFirstResponseDeadline } from "../packages/core/src/runs/first-response-deadline.ts"
import { runIntakeBridgePass } from "../packages/core/src/runs/intake-bridge-pass.ts"
import { createTestAgentRuntimeDependencies } from "./fixtures/agent-runtime.ts"

const runtime = createTestAgentRuntimeDependencies("/tmp/knowbee-action-intake-progress-order")

describe("action intake first progress", () => {
  it("delivers LLM progress before canonical diagnosis and keeps the run non-terminal", async () => {
    const order: string[] = []
    const intake = {
      intent: { category: "task_intake" as const, summary: "실행 필요", confidence: 0.99 },
      user_message: { mode: "accepted_receipt" as const, text: "요청을 확인하고 있습니다." },
      identity_claim: { subject: "main_agent" as const, claimed_name: "Knowbee" },
      action_items: [],
      structured_request: {
        source_language: "ko" as const,
        normalized_english: "Check the request.",
        target: "verified answer",
        to: "user",
        context: [],
        complete_condition: ["verified answer delivered"],
      },
      intent_envelope: {
        intent_type: "task_intake" as const,
        source_language: "ko" as const,
        normalized_english: "Check the request.",
        target: "verified answer",
        destination: "user",
        context: [],
        complete_condition: ["verified answer delivered"],
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
    const dependencies = {
      appendRunEvent: vi.fn(),
      updateRunSummary: vi.fn(),
      incrementDelegationTurnCount: vi.fn(),
      emitScheduleCreated: vi.fn(),
      emitScheduleCancelled: vi.fn(),
      scheduleDelayedRun: vi.fn(),
      startDelegatedRun: vi.fn(),
      normalizeTaskProfile: vi.fn(() => "general_chat" as const),
      logInfo: vi.fn(),
      recordCanonicalIntakeDiagnosis: vi.fn(async () => {
        order.push("diagnosis")
        return { ok: true as const }
      }),
      authorizeCanonicalIntakePlan: vi.fn(async () => ({ ok: true as const })),
      recordCanonicalExecutionStart: vi.fn(async () => ({ ok: true as const })),
      releaseCanonicalSimplePath: vi.fn(async () => ({ ok: true as const })),
    }
    const emitAssistantTextDelivery = vi.fn(async () => {
      order.push("progress")
      return {
        persisted: true,
        textDelivered: true,
        doneDelivered: true,
        runId: "run-progress",
        receiptRef: "message-ledger:progress-1",
        deliveredAtMs: 30_999,
      }
    })
    const recordFirstResponseReceipt = vi.fn()

    const result = await runIntakeBridgePass(
      {
        artifactStorage: runtime.artifactStorage,
        message: "현재 상황을 확인해줘",
        originalRequest: "현재 상황을 확인해줘",
        sessionId: "session-progress",
        requestGroupId: "group-progress",
        model: "gpt-test",
        config: DEFAULT_CONFIG,
        workDir: "/tmp",
        source: "telegram",
        runId: "run-progress",
        onChunk: vi.fn(),
        firstResponseDeadline: createFirstResponseDeadline(1_000),
        recordFirstResponseReceipt,
        reuseConversationContext: false,
      },
      dependencies,
      {
        analyzeTaskIntake: vi.fn(async () => intake),
        emitAssistantTextDelivery,
      } as never,
    )

    expect(order.slice(0, 2)).toEqual(["progress", "diagnosis"])
    expect(emitAssistantTextDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "요청을 확인하고 있습니다.",
        deliveryKind: "progress",
        textSource: "llm_generated",
      }),
    )
    expect(result).toBeNull()
    expect(recordFirstResponseReceipt).toHaveBeenCalledWith({
      runId: "run-progress",
      receiptRef: "message-ledger:progress-1",
      deliveredAtMs: 30_999,
    })
  })
})
