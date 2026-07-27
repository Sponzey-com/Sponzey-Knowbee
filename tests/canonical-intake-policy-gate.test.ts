import { describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import { runIntakeBridgePass } from "../packages/core/src/runs/intake-bridge-pass.ts"
import { createTestAgentRuntimeDependencies } from "./fixtures/agent-runtime.ts"

const runtime = createTestAgentRuntimeDependencies("/tmp/knowbee-policy-gate")
const intake = {
  intent: { category: "task_intake" as const, summary: "execute answer", confidence: 1 },
  user_message: { mode: "accepted_receipt" as const, text: "request accepted" },
  action_items: [],
  structured_request: {
    source_language: "en" as const,
    normalized_english: "answer",
    target: "answer",
    to: "user",
    context: [],
    complete_condition: ["answered"],
  },
  intent_envelope: {
    intent_type: "direct_answer" as const,
    source_language: "en" as const,
    normalized_english: "answer",
    target: "answer",
    destination: "user",
    context: [],
    complete_condition: ["answered"],
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
  notes: [],
}

function deps(
  policy: ReturnType<typeof vi.fn>,
  execution = vi.fn(async () => ({ ok: true as const })),
) {
  return {
    appendRunEvent: vi.fn(),
    updateRunSummary: vi.fn(),
    incrementDelegationTurnCount: vi.fn(),
    emitScheduleCreated: vi.fn(),
    emitScheduleCancelled: vi.fn(),
    scheduleDelayedRun: vi.fn(),
    startDelegatedRun: vi.fn(),
    normalizeTaskProfile: vi.fn(() => "general_chat" as const),
    logInfo: vi.fn(),
    recordCanonicalIntakeDiagnosis: vi.fn(async () => ({ ok: true as const })),
    authorizeCanonicalIntakePlan: policy,
    recordCanonicalExecutionStart: execution,
    releaseCanonicalSimplePath: vi.fn(async () => ({ ok: true as const })),
  }
}

describe("canonical intake policy gate", () => {
  it("authorizes after diagnosis and before any observable intake action", async () => {
    const order: string[] = []
    const dependencies = deps(
      vi.fn(async () => {
        order.push("policy")
        return { ok: true as const }
      }),
      vi.fn(async () => {
        order.push("execution")
        return { ok: true as const }
      }),
    )
    dependencies.recordCanonicalIntakeDiagnosis.mockImplementation(async () => {
      order.push("diagnosis")
      return { ok: true as const }
    })
    dependencies.appendRunEvent.mockImplementation(() => {
      order.push("event")
    })
    await runIntakeBridgePass(
      {
        artifactStorage: runtime.artifactStorage,
        config: DEFAULT_CONFIG,
        message: "answer",
        originalRequest: "answer",
        sessionId: "s",
        requestGroupId: "r",
        model: "m",
        workDir: "/tmp",
        source: "webui",
        runId: "r",
        onChunk: undefined,
        reuseConversationContext: false,
      },
      dependencies,
      { analyzeTaskIntake: vi.fn(async () => intake) } as never,
    )
    expect(order.slice(0, 4)).toEqual(["diagnosis", "policy", "execution", "event"])
  })

  it("stops all observable actions when policy is rejected", async () => {
    const dependencies = deps(
      vi.fn(async () => ({ ok: false as const, reasonCode: "exclusive_method_unavailable" })),
    )
    await expect(
      runIntakeBridgePass(
        {
          artifactStorage: runtime.artifactStorage,
          config: DEFAULT_CONFIG,
          message: "answer",
          originalRequest: "answer",
          sessionId: "s",
          requestGroupId: "r",
          model: "m",
          workDir: "/tmp",
          source: "webui",
          runId: "r",
          onChunk: undefined,
          reuseConversationContext: false,
        },
        dependencies,
        { analyzeTaskIntake: vi.fn(async () => intake) } as never,
      ),
    ).rejects.toMatchObject({
      kind: "knowbee.canonical_execution_failure.v1",
      phase: "policy",
      reasonCode: "exclusive_method_unavailable",
      retryable: false,
    })
    expect(dependencies.appendRunEvent).not.toHaveBeenCalled()
    expect(dependencies.startDelegatedRun).not.toHaveBeenCalled()
    expect(dependencies.scheduleDelayedRun).not.toHaveBeenCalled()
  })

  it("blocks instead of reanalyzing when the capability catalog is degraded", async () => {
    const dependencies = deps(
      vi.fn(async () => ({
        ok: false as const,
        reasonCode: "capability_selection_catalog_invalid",
      })),
    )

    await expect(runIntakeBridgePass(
      {
        artifactStorage: runtime.artifactStorage,
        config: DEFAULT_CONFIG,
        message: "find the current price",
        originalRequest: "find the current price",
        sessionId: "s",
        requestGroupId: "r",
        model: "m",
        workDir: "/tmp",
        source: "telegram",
        runId: "r",
        onChunk: undefined,
        reuseConversationContext: false,
      },
      dependencies,
      { analyzeTaskIntake: vi.fn(async () => intake) } as never,
    )).rejects.toMatchObject({
      kind: "knowbee.canonical_execution_failure.v1",
      phase: "policy",
      reasonCode: "capability_selection_catalog_invalid",
      retryable: false,
    })
    expect(dependencies.recordCanonicalExecutionStart).not.toHaveBeenCalled()
  })

  it("stops all observable actions when execution admission is rejected", async () => {
    const dependencies = deps(
      vi.fn(async () => ({ ok: true as const })),
      vi.fn(async () => ({ ok: false as const, reasonCode: "execution_cancelled" })),
    )
    await expect(
      runIntakeBridgePass(
        {
          artifactStorage: runtime.artifactStorage,
          config: DEFAULT_CONFIG,
          message: "answer",
          originalRequest: "answer",
          sessionId: "s",
          requestGroupId: "r",
          model: "m",
          workDir: "/tmp",
          source: "webui",
          runId: "r",
          onChunk: undefined,
          reuseConversationContext: false,
        },
        dependencies,
        { analyzeTaskIntake: vi.fn(async () => intake) } as never,
      ),
    ).rejects.toMatchObject({
      kind: "knowbee.canonical_execution_failure.v1",
      phase: "execution",
      reasonCode: "execution_cancelled",
      retryable: false,
    })
    expect(dependencies.appendRunEvent).not.toHaveBeenCalled()
  })
})
