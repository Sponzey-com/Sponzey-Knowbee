import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import { LLM_INTAKE_RESULT_NOTE } from "../packages/core/src/agent/intake.ts"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import { buildCanonicalCompletionOutcomeDescriptor } from "../packages/core/src/runs/canonical-finalization-lifecycle.ts"
import { buildCanonicalSimplePathReleaseDescriptor } from "../packages/core/src/runs/canonical-simple-path.ts"
import { decideCompletionFlow } from "../packages/core/src/runs/completion-flow.ts"
import { runIntakeBridgePass } from "../packages/core/src/runs/intake-bridge-pass.ts"
import { decideReviewGate } from "../packages/core/src/runs/review-gate.ts"
import { createTestAgentRuntimeDependencies } from "./fixtures/agent-runtime.ts"

const runtime = createTestAgentRuntimeDependencies("/tmp/knowbee-task024")

function intakeResult(notes: string[]) {
  return {
    intent: { category: "direct_answer" as const, summary: "Greeting", confidence: 0.99 },
    user_message: { mode: "direct_answer" as const, text: "Hello from the model." },
    action_items: [],
    structured_request: {
      source_language: "en" as const,
      normalized_english: "Say hello.",
      target: "answer",
      to: "user",
      context: [],
      complete_condition: ["answer delivered"],
    },
    intent_envelope: {
      intent_type: "direct_answer" as const,
      source_language: "en" as const,
      normalized_english: "Say hello.",
      target: "answer",
      destination: "user",
      context: [],
      complete_condition: ["answer delivered"],
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
      requires_run: false,
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
    notes,
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
    logInfo: vi.fn(),
    recordCanonicalIntakeDiagnosis: vi.fn(async () => ({ ok: true as const })),
    authorizeCanonicalIntakePlan: vi.fn(async () => ({ ok: true as const })),
    recordCanonicalExecutionStart: vi.fn(async () => ({ ok: true as const })),
    releaseCanonicalSimplePath: vi.fn(async () => ({ ok: true as const })),
  }
}

function moduleDependencies(notes: string[]) {
  const intake = intakeResult(notes)
  return {
    analyzeTaskIntake: vi.fn(async () =>
      notes.includes(LLM_INTAKE_RESULT_NOTE)
        ? {
            status: "success" as const,
            intake,
            directResponseProvenance: {
              taskIntakePromptSha256: "a".repeat(64),
              finalResponsePromptSha256: "b".repeat(64),
              providerInvocationRef: "invocation:task024-direct",
            },
          }
        : intake
    ),
    resolveRunRoute: vi.fn(() => ({ kind: "local", taskProfile: "general_chat" as const })),
    executeScheduleActions: vi.fn(),
    createDefaultScheduleActionDependencies: vi.fn(),
    inferDelegatedTaskProfile: vi.fn(() => "general_chat" as const),
    buildFollowupPrompt: vi.fn(() => "continue"),
  }
}

describe("Task 024 distinct LLM judgment gates", () => {
  it("does not expose a deterministic direct-answer payload as a user answer", async () => {
    const deps = dependencies()
    const result = await runIntakeBridgePass(
      {
        artifactStorage: runtime.artifactStorage,
        message: "hello",
        originalRequest: "hello",
        sessionId: "session:task024",
        requestGroupId: "group:task024",
        model: "model:task024",
        config: DEFAULT_CONFIG,
        workDir: "/tmp/knowbee-task024",
        source: "webui",
        runId: "run:task024:deterministic",
        onChunk: undefined,
        reuseConversationContext: false,
      },
      deps,
      moduleDependencies([]),
    )

    expect(result).not.toMatchObject({ kind: "complete", text: "Hello from the model." })
    expect(deps.releaseCanonicalSimplePath).not.toHaveBeenCalled()
  })

  it("binds an LLM direct answer release to the request and answer fingerprints", async () => {
    const deps = dependencies()
    const result = await runIntakeBridgePass(
      {
        artifactStorage: runtime.artifactStorage,
        message: "hello",
        originalRequest: "hello",
        sessionId: "session:task024",
        requestGroupId: "group:task024",
        model: "model:task024",
        config: DEFAULT_CONFIG,
        workDir: "/tmp/knowbee-task024",
        source: "webui",
        runId: "run:task024:llm",
        onChunk: undefined,
        reuseConversationContext: false,
      },
      deps,
      moduleDependencies([LLM_INTAKE_RESULT_NOTE]),
    )

    expect(result).toMatchObject({
      kind: "complete",
      text: "Hello from the model.",
      textSource: "llm_generated",
      responseReview: {
        rawText: "Hello from the model.",
        rawTextSource: "llm_generated",
        contentKind: "direct_answer",
        receipt: {
          reviewedBy: "llm_final_response",
          promptSourceId: "final_response",
        },
      },
    })
    expect(deps.releaseCanonicalSimplePath).toHaveBeenCalledWith(
      expect.objectContaining({
        answerSource: "llm_generated",
        requestFingerprint: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
        answerFingerprint: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
      }),
    )
  })

  it("requires LLM result review after every successful tool or artifact execution", () => {
    const decision = decideReviewGate({
      executionSemantics: {
        filesystemEffect: "none",
        privilegedOperation: "none",
        artifactDelivery: "direct",
        approvalRequired: false,
        approvalTool: "external_action",
      },
      preview: "The requested artifact was delivered.",
      deliveryOutcome: {
        directArtifactDeliveryRequested: true,
        hasSuccessfulArtifactDelivery: true,
        deliverySatisfied: true,
        requiresDirectArtifactRecovery: false,
      },
      successfulTools: [{ toolName: "artifact_export", output: "transport succeeded" }],
      sawRealFilesystemMutation: false,
      requiresFilesystemMutation: false,
      truncatedOutputRecoveryAttempted: false,
    })

    expect(decision.kind).toBe("run")
    expect(decision.reason).toBe("successful_tool_result_requires_llm_result_diagnosis")
  })

  it("cannot complete tool-backed work when the LLM result diagnosis is unavailable", () => {
    const successfulTools = [{ toolName: "artifact_export", output: "transport succeeded" }]
    const decision = decideCompletionFlow({
      review: null,
      executionSemantics: {
        filesystemEffect: "none",
        privilegedOperation: "none",
        artifactDelivery: "none",
        approvalRequired: false,
        approvalTool: "external_action",
      },
      preview: "Transport succeeded.",
      deliverySatisfied: true,
      successfulTools,
      sawRealFilesystemMutation: false,
      requiresFilesystemMutation: false,
      truncatedOutputRecoveryAttempted: false,
    })
    expect(decision.kind).toBe("recover_empty_result")
    expect(decision).toMatchObject({
      reason: expect.stringContaining("LLM 결과 진단 receipt가 없습니다"),
    })

    const canonical = buildCanonicalCompletionOutcomeDescriptor({
      runId: "run:task024:tool",
      review: null,
      requiresLlmResultDiagnosis: true,
      preview: "Transport succeeded.",
      state: {
        executionSatisfied: true,
        deliveryRequired: false,
        deliverySatisfied: true,
        completionSatisfied: true,
        interpretationStatus: "satisfied",
        executionStatus: "satisfied",
        deliveryStatus: "not_required",
        recoveryStatus: "settled",
        blockingReasons: [],
        checklist: {
          items: [
            { key: "request", status: "completed" },
            { key: "execution", status: "completed" },
            { key: "delivery", status: "not_required" },
            { key: "completion", status: "completed" },
          ],
          completedCount: 3,
          actionableCount: 3,
          pendingCount: 0,
        },
      },
      application: {
        kind: "complete",
        summary: "done",
        persistedText: "Transport succeeded.",
        statusText: "done",
      },
    })
    expect(canonical).toEqual({
      ok: false,
      reasonCode: "canonical_llm_result_diagnosis_missing",
    })
  })

  it("keeps the active-path inventory aligned with source gates", () => {
    const inventory = JSON.parse(
      readFileSync("docs/audit/llm-judgment-receipt-inventory.json", "utf8"),
    ) as { paths: Array<{ id: string; status: string }> }
    expect(inventory.paths.map((path) => path.id).sort()).toEqual([
      "canonical-loop-root",
      "delegated-child",
      "simple-conversation",
      "tool-backed-loop-root",
      "topology-root",
    ])
    expect(inventory.paths.every((path) => path.status === "enforced")).toBe(true)

    const intakeSource = readFileSync("packages/core/src/runs/intake-bridge-pass.ts", "utf8")
    const reviewGateSource = readFileSync("packages/core/src/runs/review-gate.ts", "utf8")
    expect(intakeSource).toContain('textSource === "llm_generated"')
    expect(reviewGateSource).toContain("successful_tool_result_requires_llm_result_diagnosis")
  })
})
