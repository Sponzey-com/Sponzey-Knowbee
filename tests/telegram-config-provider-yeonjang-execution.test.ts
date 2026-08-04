import { describe, expect, it, vi } from "vitest"

import type { AIChunk, AIProvider, ChatParams } from "../packages/core/src/ai/types.ts"
import {
  admitLlmCapabilitySelection,
  runLlmCapabilitySelectionProvider,
} from "../packages/core/src/contracts/llm-capability-selection.ts"
import { runLlmSolutionPlanProvider } from "../packages/core/src/contracts/llm-solution-plan-provider.ts"
import { projectCanonicalCapabilitySnapshot } from "../packages/core/src/runs/canonical-capability-snapshot.ts"
import { resolveRunLlmRuntime } from "../packages/core/src/runs/run-llm-runtime-resolution.ts"
import {
  createSolutionPlanCapabilityExecutionScope,
  dispatchRunScopedTool,
} from "../packages/core/src/runs/run-scoped-tool-admission.ts"
import { projectYeonjangRuntimeHealthObservations } from "../packages/core/src/runs/runtime-capability-health.ts"
import { buildSolutionPlanCapabilityAdmission } from "../packages/core/src/runs/solution-plan-capability-admission.ts"
import { yeonjangCameraCaptureTool } from "../packages/core/src/tools/builtin/yeonjang.ts"
import { createRuntimeSolutionPlanProvider } from "../packages/core/src/runs/solution-plan-provider-runtime.ts"
import type { AnyTool, ToolContext, ToolResult } from "../packages/core/src/tools/types.ts"
import { admitYeonjangEvidenceForReview } from "../packages/core/src/yeonjang/evidence-admission.ts"
import type { YeonjangRegistryInstanceView } from "../packages/core/src/yeonjang/registry.ts"

const runId = "run:telegram-config-yeonjang"
const snapshotFingerprint = `sha256:${"a".repeat(64)}` as const
const targetId = "yeonjang:studio-mac"

const configuredProvider: AIProvider = {
  id: "configured-openai",
  supportedModels: ["configured-model"],
  maxContextTokens: () => 16_000,
  async *chat(_params: ChatParams): AsyncGenerator<AIChunk> {},
}

function yeonjangTool(input: {
  name: string
  methodId: string
  requiresApproval: boolean
}): AnyTool {
  return {
    name: input.name,
    description: `Existing Yeonjang ${input.methodId} capability`,
    parameters: {
      type: "object",
      properties: { extensionId: { type: "string" } },
    },
    riskLevel: input.requiresApproval ? "dangerous" : "safe",
    requiresApproval: input.requiresApproval,
    runtimeHealthMode: "required",
    runtimeMethodIds: [input.methodId],
    execute: async () => ({ success: true, output: "unused" }),
  }
}

const screenCapture = yeonjangTool({
  name: "yeonjang_screen_capture",
  methodId: "screen.capture",
  requiresApproval: false,
})
const cameraCapture = yeonjangCameraCaptureTool
const fileDelete = yeonjangTool({
  name: "yeonjang_file_delete",
  methodId: "file.delete",
  requiresApproval: true,
})

const registry = {
  generatedAt: 100,
  agents: [],
  teams: [],
  membershipEdges: [],
  diagnostics: [],
}

describe("Telegram config-only provider to Yeonjang execution continuity", () => {
  it("reuses existing capability selection, admission, exact dispatch, and post-check boundaries", async () => {
    expect(cameraCapture).toMatchObject({
      name: "yeonjang_camera_capture",
      runtimeHealthMode: "required",
      runtimeMethodIds: ["camera.capture"],
      riskLevel: "moderate",
      requiresApproval: true,
      sideEffect: {
        effectClass: "local_write",
        compensationSupport: "irreversible",
      },
    })
    const resolveConfiguredProvider = vi.fn(() => ({
      provider: configuredProvider,
      providerId: configuredProvider.id,
    }))
    const attempt = resolveRunLlmRuntime({
      providerId: configuredProvider.id,
      model: "configured-model",
      resolver: { resolveConfiguredProvider },
    })
    expect(attempt).toMatchObject({
      status: "ready",
      provider: configuredProvider,
      providerId: configuredProvider.id,
      model: "configured-model",
      source: "configured",
    })
    expect(resolveConfiguredProvider).toHaveBeenCalledOnce()
    if (attempt.status !== "ready") throw new Error("configured provider must be ready")

    const observations = projectYeonjangRuntimeHealthObservations({
      instances: [
        {
          instanceId: "studio-mac",
          runnableTarget: true,
          runnableReasonCodes: [],
        } as YeonjangRegistryInstanceView,
      ],
      tools: [screenCapture, cameraCapture, fileDelete],
      methodSnapshots: [
        {
          instanceId: "studio-mac",
          methods: ["screen.capture", "camera.capture"],
        },
      ],
      observedAt: 100,
    })
    const projection = projectCanonicalCapabilitySnapshot({
      actionCapabilityIds: [],
      registry,
      tools: [screenCapture, cameraCapture, fileDelete],
      source: "telegram",
      snapshotAt: 100,
      runtimeHealthObservations: observations,
    })
    const capabilitySnapshot = {
      snapshotId: "snapshot:telegram-config-yeonjang",
      fingerprint: snapshotFingerprint,
      bindings: projection.bindings,
      exclusions: projection.exclusions,
    }
    expect(capabilitySnapshot.bindings).toEqual([
      {
        capabilityId: "yeonjang_camera_capture",
        targetId,
        risk: "approval_required",
      },
      {
        capabilityId: "yeonjang_screen_capture",
        targetId,
        risk: "safe",
      },
    ])
    expect(capabilitySnapshot.exclusions).toEqual([
      {
        capabilityId: "yeonjang_file_delete",
        targetId,
        reasonCodes: ["yeonjang_method_unsupported"],
      },
    ])

    const selection = await runLlmCapabilitySelectionProvider({
      receiptId: "receipt:selection:telegram-config-yeonjang",
      runId,
      capabilitySnapshot,
      selectionContext: {
        goal: "Take a camera photo on the connected studio Mac.",
        constraints: ["Use an existing ready capability and its exact target."],
        completionCriteria: ["A verified camera artifact exists."],
        failedStrategyFingerprints: [],
      },
      provider: {
        selectCapability: (input) => ({
          schemaVersion: 1,
          runId,
          capabilitySnapshotId: input.capabilitySnapshotId,
          capabilitySnapshotFingerprint: input.capabilitySnapshotFingerprint,
          comparedBindings: input.executableBindings.map(({ capabilityId, targetId }) => ({
            capabilityId,
            targetId,
          })),
          bindingAssessments: input.executableBindings.map((binding) => ({
            capabilityId: binding.capabilityId,
            targetId: binding.targetId,
            roleFit: binding.capabilityId === cameraCapture.name ? "fit" : "partial",
            permission:
              binding.risk === "approval_required" ? "approval_required" : "allowed",
            sideEffect: binding.capabilityId === cameraCapture.name ? "external" : "read",
            evidenceQuality: "direct",
            dataExposure: "local_private",
            externalTransfer: false,
            cost: "low",
            strategyFingerprint: `strategy:${binding.capabilityId}:${binding.targetId}:v1`,
            changedFromFailedStrategies: true,
            reason: "This assessment uses the immutable runtime capability evidence.",
          })),
          selectedBinding: {
            capabilityId: cameraCapture.name,
            targetId,
          },
          reason: "The ready camera capability directly satisfies the requested photo goal.",
        }),
      },
    })
    expect(
      admitLlmCapabilitySelection({
        runId,
        userMethodSpecified: false,
        externalTransferAllowed: false,
        maxCost: "high",
        failedStrategyFingerprints: [],
        capabilitySnapshot,
        ...selection,
      }),
    ).toMatchObject({
      status: "approval_required",
      selectedBinding: {
        capabilityId: cameraCapture.name,
        targetId,
      },
    })

    const planningFactory = vi.fn(({ provider }: { provider: AIProvider }) => {
      expect(provider).toBe(attempt.provider)
      return {
        planSolution: async () => ({
          ownerAgentName: "Knowbee",
          steps: [
            {
              step_id: "capture",
              owner_agent_name: "Knowbee",
              action_type: "use_yeonjang",
              input_refs: [`capability:${cameraCapture.name}`],
              expected_output: "Verified camera artifact evidence.",
              completion_criteria: "Camera artifact post-check is verified.",
              status: "pending",
            },
          ],
        }),
        repairSolutionPlan: async () => ({}),
      }
    })
    const planningRuntime = createRuntimeSolutionPlanProvider({
      provider: attempt.provider,
      model: attempt.model,
      workDir: "/workspace",
      factory: planningFactory,
    })
    expect(planningRuntime).toMatchObject({
      status: "ready",
      fieldDebugEvent: "runtime_solution_plan_provider:ready",
    })
    expect(planningFactory).toHaveBeenCalledOnce()
    if (planningRuntime.status !== "ready") {
      throw new Error("solution planning provider must be ready")
    }

    const planned = await runLlmSolutionPlanProvider({
      provider: planningRuntime.solutionPlanProvider,
      workId: `work:root-run:${runId}`,
      runId,
      ownerAgentName: "Knowbee",
      requestDiagnosisReceiptId: "receipt:diagnosis:telegram-config-yeonjang",
      requestDiagnosisIssuedAt: 10,
      issuedAt: 20,
      goal: "Take a camera photo on the connected studio Mac.",
      constraints: ["Use the selected ready binding."],
      capabilityRefs: capabilitySnapshot.bindings.map(
        (binding) => `capability:${binding.capabilityId}`,
      ),
      completionCriteria: ["Camera artifact post-check is verified."],
    })
    expect(planned).toMatchObject({
      status: "valid",
      capabilitySelections: [
        {
          stepId: "capture",
          capabilityRef: `capability:${cameraCapture.name}`,
        },
      ],
    })
    if (planned.status !== "valid") throw new Error("solution plan must be valid")

    const capabilityAdmission = buildSolutionPlanCapabilityAdmission({
      runId,
      solutionPlanReceiptId: planned.receipt.receiptId,
      policyReceiptId: "receipt:policy:telegram-config-yeonjang",
      capabilitySnapshot,
      selections: planned.capabilitySelections,
      targetId,
      approvedCapabilityIds: [cameraCapture.name],
    })
    expect(capabilityAdmission).toMatchObject({
      ok: true,
      descriptor: {
        outcome: "allowed",
        entries: [
          {
            capabilityId: cameraCapture.name,
            targetId,
          },
        ],
      },
    })
    if (!capabilityAdmission.ok) throw new Error("capability admission must be allowed")

    const executionScope = createSolutionPlanCapabilityExecutionScope({
      descriptor: capabilityAdmission.descriptor,
      ownerAgentId: "agent:knowbee",
      skillDefinitions: [],
      skillBindings: [],
    })
    expect(executionScope).toMatchObject({
      ok: true,
      scope: {
        selectedCapabilityId: cameraCapture.name,
        selectedTargetIds: [targetId],
        toolNames: [cameraCapture.name],
      },
    })
    if (!executionScope.ok) throw new Error("execution scope must be created")

    const dispatch = vi.fn(async (
      toolName: string,
      params: Record<string, unknown>,
    ): Promise<ToolResult> => {
      const selector = params.targetSelector as
        | { type?: unknown; instanceId?: unknown }
        | undefined
      const dispatchedTargetRef =
        selector?.type === "instance_id" && typeof selector.instanceId === "string"
          ? `yeonjang:${selector.instanceId}`
          : "invalid-target"
      return {
        success: true,
        output: "Camera capture completed.",
        details: {
          evidence: {
            schemaVersion: "yeonjang-evidence-v1",
            targetRef: dispatchedTargetRef,
            toolName,
            methodIds: ["camera.capture"],
            group: "camera",
            riskLevel: "dangerous",
            requiresApproval: true,
            collectedAt: 30,
            summary: "Camera artifact was created and verified.",
            rawPayloadVisibility: "audit_only",
            postCheck: {
              kind: "verified",
              verified: true,
            },
          },
        },
      }
    })
    const toolResult = await dispatchRunScopedTool({
      scope: executionScope.scope,
      runId,
      ownerAgentId: "agent:knowbee",
      toolName: cameraCapture.name,
      params: {},
      context: {} as ToolContext,
      dispatcher: {
        get: () => cameraCapture,
        dispatch,
      },
    })
    expect(dispatch).toHaveBeenCalledOnce()
    expect(dispatch).toHaveBeenCalledWith(
      cameraCapture.name,
      {
        targetSelector: {
          type: "instance_id",
          instanceId: "studio-mac",
        },
      },
      expect.anything(),
      {
        authorizationScope: {
          executionTargetFingerprint: expect.stringMatching(
            /^sha256:[a-f0-9]{64}$/u,
          ),
        },
      },
    )
    expect(
      admitYeonjangEvidenceForReview({
        result: toolResult,
        expectedToolName: cameraCapture.name,
      }),
    ).toMatchObject({
      status: "admitted",
      evidence: {
        targetRef: targetId,
        postCheck: {
          kind: "verified",
          verified: true,
        },
      },
    })
  })
})
