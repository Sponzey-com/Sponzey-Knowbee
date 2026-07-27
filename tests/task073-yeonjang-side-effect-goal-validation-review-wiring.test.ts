import { describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.js"
import { applyToolEndChunk } from "../packages/core/src/runs/tool-chunk-application.ts"
import { runReviewCyclePass } from "../packages/core/src/runs/review-cycle-pass.ts"
import type { SuccessfulToolEvidence } from "../packages/core/src/runs/recovery.ts"
import {
  collectYeonjangSideEffectGoalValidationCandidate,
  validateAndAppendYeonjangSideEffectGoalValidationEvidence,
  type YeonjangSideEffectGoalValidationCandidate,
} from "../packages/core/src/yeonjang/side-effect-goal-validation-review.ts"
import {
  buildYeonjangEvidenceEnvelope,
  buildYeonjangGoalValidatedPostCheck,
} from "../packages/core/src/yeonjang/evidence.ts"

function dependencies() {
  return {
    rememberRunApprovalScope: vi.fn(),
    grantRunApprovalScope: vi.fn(),
    grantRunSingleApproval: vi.fn(),
    rememberRunFailure: vi.fn(),
    incrementDelegationTurnCount: vi.fn(),
    appendRunEvent: vi.fn(),
    updateRunSummary: vi.fn(),
    setRunStepStatus: vi.fn(),
    updateRunStatus: vi.fn(),
  }
}

function reviewParams(overrides: Record<string, unknown> = {}) {
  return {
    runId: "run-073",
    sessionId: "session-073",
    source: "webui" as const,
    onChunk: undefined,
    signal: new AbortController().signal,
    preview: "preview",
    priorAssistantMessages: [],
    executionSemantics: {
      filesystemEffect: "none",
      artifactDelivery: "none",
      approvalRequired: false,
      approvalTool: "none",
      privilegedOperation: "external_system",
    },
    requiresFilesystemMutation: false,
    originalRequest: "다음 버튼을 눌러 설정을 진행한다.",
    model: "test-model",
    provider: {
      id: "test-provider",
      supportedModels: ["test-model"],
      maxContextTokens: () => 100_000,
      async *chat() {},
    },
    diagnosisProvider: {
      diagnoseRequest: () => null,
      diagnoseResult: () => null,
    },
    config: DEFAULT_CONFIG,
    workDir: "/tmp",
    finalResponseIdentityContext: {
      promptLocale: "ko" as const,
      mainAgentSelfName: "마당쇠",
      promptContext: "",
    },
    usesWorkerRuntime: false,
    requiresPrivilegedToolExecution: true,
    successfulTools: [] as SuccessfulToolEvidence[],
    completionConditions: ["다음 설정 단계가 표시되어야 한다."],
    successfulFileDeliveries: [],
    sawRealFilesystemMutation: false,
    deliveryOutcome: {
      directArtifactDeliveryRequested: false,
      hasSuccessfulArtifactDelivery: false,
      deliverySatisfied: false,
      requiresDirectArtifactRecovery: false,
    },
    yeonjangSideEffectGoalValidationCandidates: [{
      toolName: "mouse_click",
      output: "외부 변경 결과를 검증하거나 자동 복구할 수 없습니다.",
      details: {
        kind: "side_effect_manual_intervention",
        operationId: "side-effect-operation-073",
        goalValidationCandidate: true,
      },
    }],
    truncatedOutputRecoveryAttempted: false,
    recoveryBudgetUsage: {
      interpretation: 0,
      execution: 0,
      delivery: 0,
      external: 0,
    },
    seenFollowupPrompts: new Set<string>(),
    syntheticApprovalAlreadyApproved: false,
    syntheticApprovalRuntimeDependencies: {
      timeoutSec: 30,
      fallback: "deny" as const,
      appendRunEvent: vi.fn(),
      setRunStepStatus: vi.fn(),
      updateRunStatus: vi.fn(),
      cancelRun: vi.fn(),
      emitApprovalResolved: vi.fn(),
      emitApprovalRequest: vi.fn(),
      onRequested: vi.fn(),
    },
    finalizationDependencies: {
      appendRunEvent: vi.fn(),
      setRunStepStatus: vi.fn(),
      updateRunStatus: vi.fn(),
      rememberRunSuccess: vi.fn(),
      rememberRunFailure: vi.fn(),
    },
    approvalRequired: false,
    approvalTool: "none",
    defaultMaxDelegationTurns: 8,
    ...overrides,
  }
}

describe("Task 073 Yeonjang side-effect goal validation review wiring", () => {
  it("collects manual side-effect tool failures as LLM goal validation candidates", () => {
    const candidates: YeonjangSideEffectGoalValidationCandidate[] = []

    applyToolEndChunk({
      runId: "run-073",
      toolName: "mouse_click",
      success: false,
      output: "외부 변경 결과를 검증하거나 자동 복구할 수 없습니다.",
      toolDetails: {
        kind: "side_effect_manual_intervention",
        operationId: "side-effect-operation-073",
        goalValidationCandidate: true,
      },
      workDir: "/tmp",
      pendingToolParams: new Map([["mouse_click", { x: 10, y: 20 }]]),
      successfulTools: [],
      filesystemMutationPaths: new Set(),
      failedCommandTools: [],
      commandFailureSeen: false,
      yeonjangSideEffectGoalValidationCandidates: candidates,
    }, {
      appendRunEvent: vi.fn(),
      updateRunSummary: vi.fn(),
    })

    expect(candidates).toEqual([{
      toolName: "mouse_click",
      output: "외부 변경 결과를 검증하거나 자동 복구할 수 없습니다.",
      details: {
        kind: "side_effect_manual_intervention",
        operationId: "side-effect-operation-073",
        goalValidationCandidate: true,
      },
    }])
  })

  it("does not collect non-candidate manual details", () => {
    const candidates: YeonjangSideEffectGoalValidationCandidate[] = []

    expect(collectYeonjangSideEffectGoalValidationCandidate({
      toolName: "mouse_click",
      success: false,
      output: "manual",
      details: {
        kind: "side_effect_manual_intervention",
        operationId: "side-effect-operation-073",
        goalValidationCandidate: false,
      },
      candidates,
    })).toBe(false)
    expect(candidates).toHaveLength(0)
  })

  it("appends normalized successful evidence after runtime LLM goal validation", async () => {
    const successfulTools: SuccessfulToolEvidence[] = []

    const result = await validateAndAppendYeonjangSideEffectGoalValidationEvidence({
      db: {} as never,
      provider: {
        diagnoseRequest: () => null,
        diagnoseResult: () => null,
      },
      runId: "run-073",
      ownerAgentName: "마당쇠",
      originalRequest: "다음 버튼을 눌러 설정을 진행한다.",
      completionConditions: ["다음 설정 단계가 표시되어야 한다."],
      candidates: [{
        toolName: "mouse_click",
        output: "외부 변경 결과를 검증하거나 자동 복구할 수 없습니다.",
        details: {
          kind: "side_effect_manual_intervention",
          operationId: "side-effect-operation-073",
          goalValidationCandidate: true,
          rawObservedState: "must-not-leak",
        },
      }],
      successfulTools,
      resolveToolMetadata: () => ({
        methodIds: ["mouse.click"],
        group: "mouse",
        riskLevel: "moderate",
        requiresApproval: true,
      }),
      validateRuntimeGoal: async () => ({
        status: "validated",
        publicSummary: {
          operationId: "side-effect-operation-073",
          runId: "run-073",
          workId: "work:root:run-073",
          adapterId: "tool:mouse_click",
          state: "MANUAL_INTERVENTION",
          revision: 5,
          transitionCount: 5,
        },
        evidence: buildYeonjangEvidenceEnvelope({
          targetRef: "tool:mouse_click:side-effect-goal",
          toolName: "mouse_click",
          methodIds: ["mouse.click"],
          group: "mouse",
          riskLevel: "moderate",
          requiresApproval: true,
          summary: "mouse_click goal validated by LLM result diagnosis.",
          postCheck: buildYeonjangGoalValidatedPostCheck({
            diagnosisReceiptId: "diagnosis:work:root:run-073:executing:result",
            diagnosisSubjectKind: "tool_result",
            evidenceRefs: ["operation-evidence:mark_manual:073"],
          }),
          collectedAt: 73,
        }),
      }),
    })

    expect(result).toEqual({ added: 1, skipped: [] })
    expect(successfulTools[0]).toMatchObject({
      toolName: "mouse_click",
      details: {
        via: "yeonjang",
        evidence: {
          schemaVersion: "yeonjang-evidence-v1",
          rawPayloadVisibility: "audit_only",
          postCheck: { kind: "goal_validated" },
        },
      },
      evidenceSource: {
        sourceKind: "yeonjang",
        trustClass: "untrusted_external",
        instructionIsolation: "data_only",
      },
    })
    expect(JSON.stringify(successfulTools)).not.toContain("must-not-leak")
  })

  it("runs goal validation before review gate sees successful tools", async () => {
    const deps = dependencies()
    const order: string[] = []
    const moduleDependencies = {
      getDb: vi.fn(() => ({} as never)),
      validateAndAppendYeonjangSideEffectGoalValidationEvidence: vi.fn(async (input) => {
        order.push("validate")
        input.successfulTools.push({ toolName: "mouse_click", output: "목표 검증 완료" })
        return { added: 1, skipped: [] }
      }),
      decideReviewGate: vi.fn((input) => {
        order.push("gate")
        expect(input.successfulTools).toEqual([{ toolName: "mouse_click", output: "목표 검증 완료" }])
        return {
          kind: "run" as const,
          state: {
            executionSatisfied: true,
            deliveryRequired: false,
            deliverySatisfied: true,
            completionSatisfied: true,
            interpretationStatus: "satisfied" as const,
            executionStatus: "satisfied" as const,
            deliveryStatus: "not_required" as const,
            recoveryStatus: "settled" as const,
            blockingReasons: [],
          },
        }
      }),
      runReviewPass: vi.fn(async () => ({ review: null, syntheticApproval: null })),
      runReviewOutcomePass: vi.fn(async () => ({ kind: "break" as const })),
      getRootRun: vi.fn(() => ({ delegationTurnCount: 1, maxDelegationTurns: 8 })),
    }

    await runReviewCyclePass(reviewParams(), deps, moduleDependencies)

    expect(order).toEqual(["validate", "gate"])
    expect(deps.appendRunEvent).toHaveBeenCalledWith(
      "run-073",
      "yeonjang_side_effect_goal_validation_added:1",
    )
  })
})
