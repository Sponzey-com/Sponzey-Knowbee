import { afterEach, describe, expect, it, vi } from "vitest"
import { telegramSendFileTool } from "../packages/core/src/tools/builtin/telegram-send.ts"
import { yeonjangCameraCaptureTool } from "../packages/core/src/tools/builtin/yeonjang.ts"
import { buildChannelArtifactDeliveryExecutionTargetRef } from "../packages/core/src/runs/channel-artifact-delivery-requirement.ts"

describe("capability selection start cutover", () => {
  afterEach(() => {
    vi.doUnmock("../packages/core/src/db/index.js")
    vi.doUnmock("../packages/core/src/runs/canonical-capability-selection.js")
    vi.doUnmock("../packages/core/src/runs/canonical-intake-plan-policy.js")
    vi.doUnmock("../packages/core/src/db/canonical-work-receipt-repository.js")
    vi.doUnmock("../packages/core/src/runs/start-bridges.js")
    vi.resetModules()
  })

  it("does not call the legacy selection provider during intake policy admission", async () => {
    vi.resetModules()
    const authorizeCanonicalCapabilitySelection = vi
      .fn()
      .mockResolvedValue({
        ok: false,
        reasonCode: "capability_selection_rejected",
        rejectionReasonCodes: ["failed_strategy_reselected"],
        decisionTraceId: "trace-recovery-1",
        strategyFingerprints: ["strategy:web:current:v1"],
      })
    vi.doMock("../packages/core/src/runs/canonical-capability-selection.js", () => ({
      authorizeCanonicalCapabilitySelection,
    }))
    vi.doMock("../packages/core/src/runs/canonical-intake-plan-policy.js", () => ({
      buildCanonicalIntakePlanPolicy: vi.fn(() => ({
        ok: true,
        input: {
          capabilitySnapshot: {
            snapshotId: "snapshot:run-recovery",
            fingerprint: `sha256:${"a".repeat(64)}`,
            bindings: [],
            exclusions: [],
          },
          constraints: {
            requestedMethods: [],
            exclusiveMethods: [],
          },
        },
        descriptor: {
          receiptId: "receipt:policy:run-recovery",
        },
      })),
      recordCanonicalIntakePlanPolicy: vi.fn(() => ({ ok: true })),
    }))
    vi.doMock("../packages/core/src/runs/start-bridges.js", () => ({
      buildStartFinalizationDependencies: vi.fn(() => ({
        appendRunEvent: vi.fn(),
        setRunStepStatus: vi.fn(),
        updateRunStatus: vi.fn(),
        rememberRunSuccess: vi.fn(),
        rememberRunFailure: vi.fn(),
      })),
      executeStartLoopDirective: vi.fn(),
      runStartIntakeBridge: vi.fn(async (
        _params: unknown,
        dependencies: {
          authorizeCanonicalIntakePlan: (input: {
            runId: string
            intake: ReturnType<typeof intake>
          }) => Promise<unknown>
        },
      ) => dependencies.authorizeCanonicalIntakePlan({
        runId: "run-recovery",
        intake: intake(),
      })),
    }))
    vi.doMock("../packages/core/src/db/index.js", () => ({
      getDb: vi.fn(() => ({
        prepare: vi.fn(() => ({
          run: vi.fn(() => ({ changes: 1 })),
          get: vi.fn(),
          all: vi.fn(() => []),
        })),
      })),
      insertMessage: vi.fn(),
    }))

    const { buildStartRootRunDriverDependencies } = await import(
      "../packages/core/src/runs/start-driver-dependencies.ts"
    )
    const { driverDependencies } = buildStartRootRunDriverDependencies({
      artifactStorage: {} as never,
      memoryJournal: {} as never,
      hierarchyStorage: {} as never,
      runId: "run-recovery",
      controller: new AbortController(),
      sessionId: "session-recovery",
      requestGroupId: "group-recovery",
      source: "telegram",
      onChunk: undefined,
      message: "현재 정보를 알려줘",
      model: "gpt-test",
      workDir: "/tmp",
      config: {
        orchestration: { maxDelegationTurns: 3 },
        security: { approvalTimeout: 30, approvalTimeoutFallback: "deny" },
      },
      canonicalPolicyTools: [],
      canonicalPolicySnapshotAt: 1,
      canonicalRuntimeHealthObservations: [],
      canonicalYeonjangAgentBindings: [],
      capabilitySelection: {
        ownerAgentId: "agent:main",
        skillDefinitions: [],
        skillBindings: [],
        instructionSkills: [],
        instructionSkillFindings: [],
        provider: {
          attemptCapabilitySelection: vi.fn(),
        },
        externalTransferAllowed: true,
        maxCost: "high",
      },
      toolsEnabled: true,
      reuseConversationContext: false,
      activeQueueCancellationMode: null,
      startNestedRootRun: vi.fn(() => ({ finished: Promise.resolve(undefined) })),
      syntheticApprovalScopes: new Set<string>(),
      logInfo: vi.fn(),
      logWarn: vi.fn(),
      logError: vi.fn(),
    })

    const first = await driverDependencies.tryHandleIntakeBridge({
      currentMessage: "현재 정보를 알려줘",
      originalRequest: "현재 정보를 알려줘",
    })
    const second = await driverDependencies.tryHandleIntakeBridge({
      currentMessage: "구조화된 재분석",
      originalRequest: "현재 정보를 알려줘",
    })

    expect(first).toEqual({ ok: true, requiredToolNames: [] })
    expect(second).toEqual({ ok: true, requiredToolNames: [] })
    expect(authorizeCanonicalCapabilitySelection).not.toHaveBeenCalled()
  })

  it("routes an actionable self-solve request through the existing solution-plan admission", async () => {
    vi.resetModules()
    const issue = vi.fn(() => ({ issued: true as const }))
    vi.doMock("../packages/core/src/db/canonical-work-receipt-repository.js", () => ({
      SqliteCanonicalWorkReceiptRepository: class {
        issue = issue
        load = vi.fn()
      },
    }))
    vi.doMock("../packages/core/src/runs/canonical-intake-plan-policy.js", () => ({
      buildCanonicalIntakePlanPolicy: vi.fn(() => ({
        ok: true,
        input: {
          runId: "run-camera",
          workId: "work:root-run:run-camera",
          planFingerprint: `sha256:${"a".repeat(64)}`,
          capabilitySnapshot: {
            snapshotId: "snapshot:run-camera",
            fingerprint: `sha256:${"b".repeat(64)}`,
            bindings: [
              {
                capabilityId: "action:run_task",
                targetId: "agent:main",
                risk: "safe",
              },
              {
                capabilityId: "yeonjang_camera_capture",
                targetId: "client:camera-1",
                risk: "approval_required",
              },
              {
                capabilityId: "telegram_send_file",
                targetId: "agent:main",
                risk: "approval_required",
              },
            ],
            exclusions: [],
          },
          constraints: {
            requiredMethods: ["action:run_task"],
            requestedMethods: ["screen_capture"],
            exclusiveMethods: [],
            approvedCapabilityIds: [],
          },
        },
        descriptor: {
          runId: "run-camera",
          workId: "work:root-run:run-camera",
          receiptId: "receipt:policy:run-camera",
          kind: "policy",
          evidenceFingerprint: `sha256:${"c".repeat(64)}`,
          evidenceRefs: ["policy:run-camera"],
        },
      })),
      recordCanonicalIntakePlanPolicy: vi.fn(() => ({ ok: true })),
    }))
    vi.doMock("../packages/core/src/runs/start-bridges.js", () => ({
      buildStartFinalizationDependencies: vi.fn(() => ({
        appendRunEvent: vi.fn(),
        setRunStepStatus: vi.fn(),
        updateRunStatus: vi.fn(),
        rememberRunSuccess: vi.fn(),
        rememberRunFailure: vi.fn(),
      })),
      executeStartLoopDirective: vi.fn(),
      runStartIntakeBridge: vi.fn(async (
        _params: unknown,
        dependencies: {
          authorizeCanonicalIntakePlan: (input: {
            runId: string
            intake: ReturnType<typeof intake>
          }) => Promise<unknown>
        },
      ) => dependencies.authorizeCanonicalIntakePlan({
        runId: "run-camera",
        intake: intake(true),
      })),
    }))
    vi.doMock("../packages/core/src/db/index.js", () => ({
      getDb: vi.fn(() => ({
        prepare: vi.fn(() => ({
          run: vi.fn(() => ({ changes: 1 })),
          get: vi.fn(),
          all: vi.fn(() => []),
        })),
      })),
      insertMessage: vi.fn(),
    }))

    const planSolution = vi.fn(async (subject: {
      ownerAgentName: string
      capabilityRefs: string[]
    }) => {
      const captureRef = subject.capabilityRefs.find((ref) =>
        ref === "capability:yeonjang_camera_capture")
      const deliveryRef = subject.capabilityRefs.find((ref) =>
        ref === "capability:telegram_send_file")
      return {
        ownerAgentName: subject.ownerAgentName,
        steps: [
          {
            step_id: "capture",
            owner_agent_name: subject.ownerAgentName,
            action_type: "use_yeonjang",
            input_refs: [captureRef],
            expected_output: "Camera artifact",
            completion_criteria: "Artifact evidence exists.",
            status: "pending",
          },
          {
            step_id: "deliver",
            owner_agent_name: subject.ownerAgentName,
            action_type: "use_tool",
            input_refs: [deliveryRef, "step:capture"],
            expected_output: "Telegram delivery receipt",
            completion_criteria: "The artifact is delivered to the current chat.",
            status: "pending",
          },
        ],
      }
    })
    const { buildStartRootRunDriverDependencies } = await import(
      "../packages/core/src/runs/start-driver-dependencies.ts"
    )
    const { driverDependencies } = buildStartRootRunDriverDependencies({
      artifactStorage: {} as never,
      memoryJournal: {} as never,
      hierarchyStorage: {} as never,
      runId: "run-camera",
      controller: new AbortController(),
      sessionId: "session-camera",
      requestGroupId: "group-camera",
      source: "telegram",
      onChunk: undefined,
      message: "카메라 요청",
      model: "gpt-test",
      workDir: "/tmp",
      config: {
        orchestration: { maxDelegationTurns: 3 },
        security: { approvalTimeout: 30, approvalTimeoutFallback: "deny" },
      },
      canonicalPolicyTools: [yeonjangCameraCaptureTool, telegramSendFileTool],
      canonicalPolicySnapshotAt: 1,
      canonicalRuntimeHealthObservations: [],
      canonicalYeonjangAgentBindings: [],
      capabilitySelection: {
        ownerAgentId: "agent:main",
        skillDefinitions: [],
        skillBindings: [],
        instructionSkills: [],
        instructionSkillFindings: [],
        externalTransferAllowed: true,
        maxCost: "high",
      },
      solutionPlanning: {
        provider: { planSolution },
        now: (() => {
          let value = 100
          return () => value++
        })(),
      },
      toolsEnabled: true,
      reuseConversationContext: false,
      activeQueueCancellationMode: null,
      startNestedRootRun: vi.fn(() => ({ finished: Promise.resolve(undefined) })),
      syntheticApprovalScopes: new Set<string>(),
      logInfo: vi.fn(),
      logWarn: vi.fn(),
      logError: vi.fn(),
    })

    await expect(driverDependencies.tryHandleIntakeBridge({
      currentMessage: "카메라 요청",
      originalRequest: "카메라 요청",
    })).resolves.toEqual({
      ok: true,
      requiredToolNames: ["telegram_send_file", "yeonjang_camera_capture"],
    })
    expect(planSolution).toHaveBeenCalledWith(expect.objectContaining({
      capabilityRefs: [
        "capability:telegram_send_file",
        "capability:yeonjang_camera_capture",
      ],
      requiredCapabilityRefs: [
        "capability:telegram_send_file",
        "capability:yeonjang_camera_capture",
      ],
    }))
    const deliveryTarget = buildChannelArtifactDeliveryExecutionTargetRef(
      "telegram",
      "session-camera",
    )
    expect(driverDependencies.getAdmittedCapabilityExecutionScope()).toMatchObject({
      selectedCapabilityId: "telegram_send_file",
      selectedTargetIds: ["client:camera-1", deliveryTarget],
      approvalRequiredCapabilityIds: [
        "telegram_send_file",
        "yeonjang_camera_capture",
      ],
      selectedToolTargets: [
        expect.objectContaining({
          capabilityId: "yeonjang_camera_capture",
          targetId: "client:camera-1",
          toolNames: ["yeonjang_camera_capture"],
        }),
        expect.objectContaining({
          capabilityId: "telegram_send_file",
          targetId: deliveryTarget,
          toolNames: ["telegram_send_file"],
        }),
      ],
      toolNames: ["telegram_send_file", "yeonjang_camera_capture"],
    })
    expect(issue).toHaveBeenCalledTimes(1)
  })
})

function intake(needsTools = false) {
  return {
    structured_request: {
      normalized_english: "Find current public information.",
      context: ["Use an enabled capability."],
      complete_condition: ["Return verified current information."],
    },
    intent_envelope: {
      complete_condition: ["Return verified current information."],
    },
    execution: {
      needs_tools: needsTools,
      execution_semantics: {
        filesystemEffect: "none" as const,
        privilegedOperation: needsTools ? "required" as const : "none" as const,
        artifactDelivery: needsTools ? "direct" as const : "none" as const,
        approvalRequired: needsTools,
        approvalTool: needsTools
          ? "yeonjang_camera_capture" as const
          : "external_action" as const,
      },
    },
  }
}
