import { describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import { buildCanonicalIntakeDiagnosisDescriptor } from "../packages/core/src/runs/canonical-intake-diagnosis.ts"
import { runIntakeBridgePass } from "../packages/core/src/runs/intake-bridge-pass.ts"
import { createTestAgentRuntimeDependencies } from "./fixtures/agent-runtime.ts"

const runtime = createTestAgentRuntimeDependencies("/tmp/knowbee-canonical-intake")
function intake() {
  return {
    intent: { category: "task_intake" as const, summary: "execute answer", confidence: 0.9 },
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
      intent_type: "question" as const,
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
    notes: ["llm-intake-result"],
  }
}
function dependencies(record = vi.fn(async () => ({ ok: true as const }))) {
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
    recordCanonicalIntakeDiagnosis: record,
    authorizeCanonicalIntakePlan: vi.fn(async () => ({ ok: true as const })),
    recordCanonicalExecutionStart: vi.fn(async () => ({ ok: true as const })),
    releaseCanonicalSimplePath: vi.fn(async () => ({ ok: true as const })),
  }
}
function params() {
  return {
    artifactStorage: runtime.artifactStorage,
    message: "answer",
    originalRequest: "answer",
    sessionId: "session:1",
    requestGroupId: "run:1",
    model: "test",
    config: DEFAULT_CONFIG,
    workDir: "/tmp",
    source: "webui" as const,
    runId: "run:1",
    onChunk: undefined,
    reuseConversationContext: false,
  }
}

describe("canonical intake diagnosis evidence", () => {
  it("builds a stable scoped descriptor independent of object key order", () => {
    const left = buildCanonicalIntakeDiagnosisDescriptor({
      runId: "run:1",
      intake: { b: 2, a: { y: 2, x: 1 } },
    })
    const right = buildCanonicalIntakeDiagnosisDescriptor({
      runId: "run:1",
      intake: { a: { x: 1, y: 2 }, b: 2 },
    })
    expect(left).toEqual(right)
    expect(left.evidenceFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/u)
    expect(left.receiptId).toContain("receipt:intake:run:1:")
    expect(JSON.stringify(left)).not.toContain('"answer"')
  })

  it("records canonical diagnosis once before handling a non-null intake result", async () => {
    const record = vi.fn(async () => ({ ok: true as const }))
    const result = await runIntakeBridgePass(params(), dependencies(record), {
      analyzeTaskIntake: vi.fn(async () => intake()),
    } as never)
    expect(record).toHaveBeenCalledTimes(1)
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ runId: "run:1", kind: "diagnosis" }),
    )
    expect(result).toBeNull()
  })

  it("does not record or repeat a null intake when intake is unavailable", async () => {
    const nullRecord = vi.fn(async () => ({ ok: true as const }))
    await expect(
      runIntakeBridgePass(params(), dependencies(nullRecord), {
        analyzeTaskIntake: vi.fn(async () => null),
      } as never),
    ).rejects.toMatchObject({
      kind: "knowbee.canonical_execution_failure.v1",
      phase: "intake",
      reasonCode: "intake_contract_unavailable",
      retryable: false,
    })
    expect(nullRecord).not.toHaveBeenCalled()

    const rejected = dependencies(
      vi.fn(async () => ({ ok: false as const, reasonCode: "receipt_issue_failed" })),
    )
    await expect(
      runIntakeBridgePass(params(), rejected, {
        analyzeTaskIntake: vi.fn(async () => intake()),
      } as never),
    ).rejects.toMatchObject({
      kind: "knowbee.canonical_execution_failure.v1",
      phase: "intake",
      reasonCode: "receipt_issue_failed",
      retryable: false,
    })
    expect(rejected.authorizeCanonicalIntakePlan).not.toHaveBeenCalled()
    expect(rejected.recordCanonicalExecutionStart).not.toHaveBeenCalled()
  })
})
