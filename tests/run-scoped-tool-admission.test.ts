import { describe, expect, it, vi } from "vitest"
import {
  createAdmittedCapabilityExecutionScope,
  createPolicyCapabilityExecutionScope,
  createPolicyMethodCapabilityExecutionScope,
  createSolutionPlanCapabilityExecutionScope,
  dispatchRunScopedTool,
  projectRunScopedInstruction,
  projectRunScopedToolNames,
} from "../packages/core/src/runs/run-scoped-tool-admission.ts"
import {
  buildChannelArtifactDeliveryExecutionTargetRef,
} from "../packages/core/src/runs/channel-artifact-delivery-requirement.ts"
import { telegramSendFileTool } from "../packages/core/src/tools/builtin/telegram-send.ts"

const selection = {
  status: "allowed" as const,
  receiptId: "receipt:selection:run-1",
  selectedBinding: {
    capabilityId: "skill:web-research",
    targetId: "agent:main",
    risk: "safe" as const,
  },
}

function scope() {
  return createAdmittedCapabilityExecutionScope({
    runId: "run-1",
    ownerAgentId: "agent:main",
    capabilitySnapshotFingerprint: `sha256:${"a".repeat(64)}`,
    admission: selection,
    skillDefinitions: [
      {
        capabilityId: "skill:web-research",
        toolNames: ["web_search", "web_fetch"],
      },
    ],
    skillBindings: [
      {
        capabilityId: "skill:web-research",
        targetId: "agent:main",
        status: "enabled",
        risk: "safe",
        sourceSupported: true,
        toolNames: ["web_search"],
      },
    ],
  })
}

describe("run-scoped Tool admission", () => {
  it("expands a policy method through its one enabled Tool bundle", () => {
    expect(
      createPolicyMethodCapabilityExecutionScope({
        runId: "run-preferred",
        ownerAgentId: "agent:main",
        policyReceiptId: "receipt:policy:run-preferred",
        capabilitySnapshotFingerprint: `sha256:${"d".repeat(64)}`,
        methodToolNames: ["web_search"],
        availableToolNames: ["web_search", "web_fetch", "shell_exec"],
        skillDefinitions: [
          {
            capabilityId: "skill:web-research",
            toolNames: ["web_search", "web_fetch"],
          },
        ],
        skillBindings: [
          {
            capabilityId: "skill:web-research",
            targetId: "agent:main",
            status: "enabled",
            risk: "safe",
            sourceSupported: true,
            toolNames: ["web_search", "web_fetch"],
          },
        ],
      }),
    ).toEqual({
      ok: true,
      scope: {
        schemaVersion: 1,
        kind: "tool_bundle_skill",
        runId: "run-preferred",
        ownerAgentId: "agent:main",
        receiptId: "receipt:policy:run-preferred",
        capabilitySnapshotFingerprint: `sha256:${"d".repeat(64)}`,
        selectedCapabilityId: "policy:method-constraint",
        toolNames: ["web_fetch", "web_search"],
      },
    })
  })

  it("does not expand a moderate-risk device Skill into unrelated companion Tools", () => {
    expect(
      createPolicyMethodCapabilityExecutionScope({
        runId: "run-camera-preference",
        ownerAgentId: "agent:main",
        policyReceiptId: "receipt:policy:run-camera-preference",
        capabilitySnapshotFingerprint: `sha256:${"c".repeat(64)}`,
        methodToolNames: ["yeonjang_camera_capture"],
        availableToolNames: [
          "yeonjang_camera_capture",
          "screen_capture",
          "shell_exec",
          "app_launch",
        ],
        skillDefinitions: [{
          capabilityId: "skill:yeonjang",
          toolNames: [
            "yeonjang_camera_capture",
            "screen_capture",
            "shell_exec",
            "app_launch",
          ],
        }],
        skillBindings: [{
          capabilityId: "skill:yeonjang",
          targetId: "agent:main",
          status: "enabled",
          risk: "approval_required",
          sourceSupported: true,
          toolNames: [
            "yeonjang_camera_capture",
            "screen_capture",
            "shell_exec",
            "app_launch",
          ],
        }],
      }),
    ).toMatchObject({
      ok: true,
      scope: {
        selectedCapabilityId: "policy:method-constraint",
        toolNames: ["yeonjang_camera_capture"],
      },
    })
  })

  it("keeps an unavailable preferred method scoped without exposing a Tool", () => {
    const result = createPolicyMethodCapabilityExecutionScope({
      runId: "run-unavailable-preference",
      ownerAgentId: "agent:main",
      policyReceiptId: "receipt:policy:run-unavailable-preference",
      capabilitySnapshotFingerprint: `sha256:${"f".repeat(64)}`,
      methodToolNames: ["missing_capability"],
      availableToolNames: ["web_search"],
      skillDefinitions: [],
      skillBindings: [],
    })

    expect(result).toMatchObject({
      ok: true,
      scope: {
        selectedCapabilityId: "policy:method-constraint",
        toolNames: ["missing_capability"],
      },
    })
    if (!result.ok) return
    expect(projectRunScopedToolNames({
      scope: result.scope,
      runId: "run-unavailable-preference",
      ownerAgentId: "agent:main",
      availableToolNames: ["web_search"],
    })).toEqual([])
  })

  it("keeps an exclusive method exact instead of expanding its Tool bundle", () => {
    expect(
      createPolicyCapabilityExecutionScope({
        runId: "run-exclusive",
        ownerAgentId: "agent:main",
        policyReceiptId: "receipt:policy:run-exclusive",
        capabilitySnapshotFingerprint: `sha256:${"e".repeat(64)}`,
        toolNames: ["web_search"],
      }),
    ).toMatchObject({
      ok: true,
      scope: {
        selectedCapabilityId: "policy:explicit-method",
        toolNames: ["web_search"],
      },
    })
  })

  it("creates an exact tool scope from a persisted solution-plan admission", () => {
    expect(
      createSolutionPlanCapabilityExecutionScope({
        descriptor: {
          runId: "run-plan",
          receiptId: "receipt:capability-admission:run-plan",
          solutionPlanReceiptId: "receipt:solution-plan:run-plan",
          policyReceiptId: "receipt:policy:run-plan",
          capabilitySnapshotFingerprint: `sha256:${"a".repeat(64)}`,
          outcome: "allowed",
          approvalRequiredCapabilityIds: [],
          entries: [
            {
              stepId: "search",
              capabilityRef: "capability:web_search",
              capabilityId: "web_search",
              bindingTargetId: "agent:main",
              targetId: "agent:main",
            },
          ],
          evidenceFingerprint: `sha256:${"b".repeat(64)}`,
          evidenceRefs: ["solution-plan-receipt:run-plan"],
        },
        ownerAgentId: "agent:main",
        skillDefinitions: [],
        skillBindings: [],
      }),
    ).toEqual({
      ok: true,
      scope: {
        schemaVersion: 1,
        kind: "tool_bundle_skill",
        runId: "run-plan",
        ownerAgentId: "agent:main",
        receiptId: "receipt:capability-admission:run-plan",
        capabilitySnapshotFingerprint: `sha256:${"a".repeat(64)}`,
        selectedCapabilityId: "web_search",
        selectedCapabilityIds: ["web_search"],
        selectedTargetIds: ["agent:main"],
        selectedToolTargets: [
          {
            stepId: "search",
            capabilityId: "web_search",
            bindingTargetId: "agent:main",
            targetId: "agent:main",
            toolNames: ["web_search"],
          },
        ],
        toolNames: ["web_search"],
      },
    })
  })

  it("binds each solution-plan Tool to its own admitted execution target", async () => {
    const deliveryTarget = buildChannelArtifactDeliveryExecutionTargetRef(
      "telegram",
      "telegram-session-current",
    )
    const scoped = createSolutionPlanCapabilityExecutionScope({
      descriptor: {
        runId: "run-camera-delivery",
        receiptId: "receipt:capability-admission:run-camera-delivery",
        solutionPlanReceiptId: "receipt:solution-plan:run-camera-delivery",
        policyReceiptId: "receipt:policy:run-camera-delivery",
        capabilitySnapshotFingerprint: `sha256:${"a".repeat(64)}`,
        outcome: "allowed",
        approvalRequiredCapabilityIds: [],
        entries: [
          {
            stepId: "capture",
            capabilityRef: "capability:yeonjang_camera_capture",
            capabilityId: "yeonjang_camera_capture",
            bindingTargetId: "agent:main",
            targetId: "yeonjang-main",
          },
          {
            stepId: "deliver",
            capabilityRef: "capability:telegram_send_file",
            capabilityId: "telegram_send_file",
            bindingTargetId: "agent:main",
            targetId: deliveryTarget,
          },
        ],
        evidenceFingerprint: `sha256:${"b".repeat(64)}`,
        evidenceRefs: ["solution-plan-receipt:run-camera-delivery"],
      },
      ownerAgentId: "agent:main",
      skillDefinitions: [],
      skillBindings: [],
    })

    expect(scoped).toMatchObject({
      ok: true,
      scope: {
        selectedToolTargets: [
          {
            stepId: "capture",
            capabilityId: "yeonjang_camera_capture",
            bindingTargetId: "agent:main",
            targetId: "yeonjang-main",
            toolNames: ["yeonjang_camera_capture", "yeonjang_camera_permission_status"],
          },
          {
            stepId: "deliver",
            capabilityId: "telegram_send_file",
            bindingTargetId: "agent:main",
            targetId: deliveryTarget,
            toolNames: ["telegram_send_file"],
          },
        ],
      },
    })
    if (!scoped.ok) return

    const dispatch = vi.fn(async (toolName: string, params: Record<string, unknown>) => ({
      success: true,
      output: `${toolName}:${String(params.extensionId ?? params.targetId)}`,
    }))
    const dispatcher = {
      get: vi.fn((toolName: string) =>
        toolName === "yeonjang_camera_capture"
          ? {
              parameters: {
                type: "object" as const,
                properties: { extensionId: { type: "string" } },
              },
            }
          : telegramSendFileTool),
      dispatch,
    }

    await expect(
      dispatchRunScopedTool({
        scope: scoped.scope,
        runId: "run-camera-delivery",
        ownerAgentId: "agent:main",
        toolName: "yeonjang_camera_capture",
        params: {},
        context: {} as never,
        dispatcher,
      }),
    ).resolves.toMatchObject({
      success: true,
      output: "yeonjang_camera_capture:yeonjang-main",
    })
    await expect(
      dispatchRunScopedTool({
        scope: scoped.scope,
        runId: "run-camera-delivery",
        ownerAgentId: "agent:main",
        toolName: "telegram_send_file",
        params: { artifactRef: "artifact:camera:opaque" },
        context: {
          source: "telegram",
          sessionId: "telegram-session-current",
        } as never,
        dispatcher,
      }),
    ).resolves.toMatchObject({
      success: true,
      output: "telegram_send_file:undefined",
    })
    expect(dispatch).toHaveBeenNthCalledWith(
      1,
      "yeonjang_camera_capture",
      { extensionId: "yeonjang-main" },
      expect.anything(),
      {
        authorizationScope: {
          executionTargetFingerprint: expect.stringMatching(
            /^sha256:[a-f0-9]{64}$/u,
          ),
        },
      },
    )
    expect(dispatch).toHaveBeenNthCalledWith(
      2,
      "telegram_send_file",
      { artifactRef: "artifact:camera:opaque" },
      expect.anything(),
      {
        authorizationScope: {
          executionTargetFingerprint: expect.stringMatching(
            /^sha256:[a-f0-9]{64}$/u,
          ),
        },
      },
    )

    await expect(
      dispatchRunScopedTool({
        scope: scoped.scope,
        runId: "run-camera-delivery",
        ownerAgentId: "agent:main",
        toolName: "telegram_send_file",
        params: { artifactRef: "artifact:camera:opaque" },
        context: {
          source: "telegram",
          sessionId: "telegram-session-other",
        } as never,
        dispatcher,
      }),
    ).resolves.toMatchObject({
      success: false,
      error: "run_scoped_delivery_target_mismatch",
      details: {
        kind: "run_scoped_pre_dispatch_failure",
        reasonCode: "run_scoped_delivery_target_mismatch",
        effectStarted: false,
      },
    })
    expect(dispatch).toHaveBeenCalledTimes(2)
  })

  it("rejects a solution-plan entry without its capability binding owner", () => {
    expect(createSolutionPlanCapabilityExecutionScope({
      descriptor: {
        runId: "run-missing-binding",
        receiptId: "receipt:capability-admission:run-missing-binding",
        solutionPlanReceiptId: "receipt:solution-plan:run-missing-binding",
        policyReceiptId: "receipt:policy:run-missing-binding",
        capabilitySnapshotFingerprint: `sha256:${"a".repeat(64)}`,
        outcome: "allowed",
        approvalRequiredCapabilityIds: [],
        entries: [{
          stepId: "deliver",
          capabilityRef: "capability:telegram_send_file",
          capabilityId: "telegram_send_file",
          bindingTargetId: " ",
          targetId: buildChannelArtifactDeliveryExecutionTargetRef(
            "telegram",
            "telegram-session-current",
          ),
        }],
        evidenceFingerprint: `sha256:${"b".repeat(64)}`,
        evidenceRefs: ["solution-plan-receipt:run-missing-binding"],
      },
      ownerAgentId: "agent:main",
      skillDefinitions: [],
      skillBindings: [],
    })).toEqual({
      ok: false,
      reasonCode: "run_scoped_admission_invalid",
    })
  })

  it("keeps per-Tool targets stable when solution-plan entries are reordered", () => {
    const entries = [
      {
        stepId: "capture",
        capabilityRef: "capability:yeonjang_camera_capture",
        capabilityId: "yeonjang_camera_capture",
        bindingTargetId: "agent:main",
        targetId: "yeonjang-main",
      },
      {
        stepId: "deliver",
        capabilityRef: "capability:telegram_send_file",
        capabilityId: "telegram_send_file",
        bindingTargetId: "agent:main",
        targetId: "telegram-destination:opaque",
      },
    ]
    const build = (orderedEntries: typeof entries) =>
      createSolutionPlanCapabilityExecutionScope({
        descriptor: {
          runId: "run-order",
          receiptId: "receipt:capability-admission:run-order",
          solutionPlanReceiptId: "receipt:solution-plan:run-order",
          policyReceiptId: "receipt:policy:run-order",
          capabilitySnapshotFingerprint: `sha256:${"a".repeat(64)}`,
          outcome: "allowed",
          approvalRequiredCapabilityIds: [],
          entries: orderedEntries,
          evidenceFingerprint: `sha256:${"b".repeat(64)}`,
          evidenceRefs: ["solution-plan-receipt:run-order"],
        },
        ownerAgentId: "agent:main",
        skillDefinitions: [],
        skillBindings: [],
      })

    const forward = build(entries)
    const reverse = build([...entries].reverse())
    expect(forward.ok).toBe(true)
    expect(reverse.ok).toBe(true)
    if (!forward.ok || !reverse.ok) return
    expect(forward.scope.selectedToolTargets).toEqual(reverse.scope.selectedToolTargets)
  })

  it("rejects one Tool when its admitted selections have different targets", async () => {
    const scoped = createSolutionPlanCapabilityExecutionScope({
      descriptor: {
        runId: "run-shared-tool",
        receiptId: "receipt:capability-admission:run-shared-tool",
        solutionPlanReceiptId: "receipt:solution-plan:run-shared-tool",
        policyReceiptId: "receipt:policy:run-shared-tool",
        capabilitySnapshotFingerprint: `sha256:${"a".repeat(64)}`,
        outcome: "allowed",
        approvalRequiredCapabilityIds: [],
        entries: [
          {
            stepId: "first",
            capabilityRef: "capability:camera-primary",
            capabilityId: "camera-primary",
            bindingTargetId: "agent:main",
            targetId: "yeonjang-main",
          },
          {
            stepId: "second",
            capabilityRef: "capability:camera-secondary",
            capabilityId: "camera-secondary",
            bindingTargetId: "agent:main",
            targetId: "yeonjang-backup",
          },
        ],
        evidenceFingerprint: `sha256:${"b".repeat(64)}`,
        evidenceRefs: ["solution-plan-receipt:run-shared-tool"],
      },
      ownerAgentId: "agent:main",
      skillDefinitions: [
        { capabilityId: "camera-primary", toolNames: ["camera_capture"] },
        { capabilityId: "camera-secondary", toolNames: ["camera_capture"] },
      ],
      skillBindings: [],
    })
    expect(scoped.ok).toBe(true)
    if (!scoped.ok) return
    const dispatch = vi.fn()

    const dispatcher = {
      get: vi.fn(() => ({
        parameters: {
          type: "object" as const,
          properties: { targetId: { type: "string" } },
        },
      })),
      dispatch,
    }
    const first = await dispatchRunScopedTool({
      scope: scoped.scope,
      runId: "run-shared-tool",
      ownerAgentId: "agent:main",
      toolName: "camera_capture",
      params: { targetId: "model-target-one" },
      context: {} as never,
      dispatcher,
    })
    const second = await dispatchRunScopedTool({
      scope: scoped.scope,
      runId: "run-shared-tool",
      ownerAgentId: "agent:main",
      toolName: "camera_capture",
      params: { targetId: "model-target-two", outputPath: "/changed/path" },
      context: {} as never,
      dispatcher,
    })

    expect(first).toMatchObject({
      success: false,
      error: "run_scoped_target_ambiguous",
      details: {
        kind: "run_scoped_pre_dispatch_failure",
        reasonCode: "run_scoped_target_ambiguous",
        effectStarted: false,
        repairRequired: true,
        failureFingerprint: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
      },
    })
    expect(second).toMatchObject({
      success: false,
      error: "run_scoped_target_ambiguous",
      details: {
        kind: "run_scoped_pre_dispatch_failure",
        reasonCode: "run_scoped_target_ambiguous",
        effectStarted: false,
        failureFingerprint: first.details &&
          typeof first.details === "object"
          ? (first.details as { failureFingerprint: string }).failureFingerprint
          : "missing",
      },
    })
    expect(JSON.stringify(first.details)).not.toMatch(
      /yeonjang-main|yeonjang-backup|model-target|changed\/path/u,
    )
    expect(dispatch).not.toHaveBeenCalled()
  })

  it("binds an admitted external target before the existing Tool approval boundary", async () => {
    const dispatch = vi.fn(async (
      _toolName: string,
      params: Record<string, unknown>,
    ) => ({
      success: false,
      output: "",
      error: `approval_required:${String(params.extensionId)}`,
    }))
    const result = await dispatchRunScopedTool({
      scope: {
        schemaVersion: 1,
        kind: "tool_bundle_skill",
        runId: "run-camera",
        ownerAgentId: "agent:main",
        receiptId: "receipt:camera-admission",
        capabilitySnapshotFingerprint: `sha256:${"a".repeat(64)}`,
        selectedCapabilityId: "yeonjang_camera_capture",
        selectedCapabilityIds: ["yeonjang_camera_capture"],
        selectedTargetIds: ["client:camera-1"],
        approvalRequiredCapabilityIds: ["yeonjang_camera_capture"],
        toolNames: ["yeonjang_camera_capture"],
      },
      runId: "run-camera",
      ownerAgentId: "agent:main",
      toolName: "yeonjang_camera_capture",
      params: {},
      context: {} as never,
      dispatcher: {
        get: vi.fn(() => ({
          parameters: {
            type: "object",
            properties: {
              extensionId: { type: "string" },
            },
          },
        })),
        dispatch,
      },
    })

    expect(result).toMatchObject({
      success: false,
      error: "approval_required:client:camera-1",
    })
    expect(dispatch).toHaveBeenCalledWith(
      "yeonjang_camera_capture",
      { extensionId: "client:camera-1" },
      expect.anything(),
      {
        authorizationScope: {
          executionTargetFingerprint: expect.stringMatching(
            /^sha256:[a-f0-9]{64}$/u,
          ),
        },
      },
    )
  })

  it("projects an admitted Yeonjang instance ref into one authoritative structured selector", async () => {
    const dispatch = vi.fn(async (
      _toolName: string,
      _params: Record<string, unknown>,
    ) => ({ success: true, output: "prepared" }))
    const result = await dispatchRunScopedTool({
      scope: {
        schemaVersion: 1,
        kind: "tool_bundle_skill",
        runId: "run-camera-structured-target",
        ownerAgentId: "agent:main",
        receiptId: "receipt:camera-structured-target",
        capabilitySnapshotFingerprint: `sha256:${"b".repeat(64)}`,
        selectedCapabilityId: "yeonjang_camera_capture",
        selectedToolTargets: [{
          stepId: "capture",
          capabilityId: "yeonjang_camera_capture",
          bindingTargetId: "yeonjang:instance-local",
          targetId: "yeonjang:instance-local",
          toolNames: ["yeonjang_camera_capture"],
        }],
        toolNames: ["yeonjang_camera_capture"],
      },
      runId: "run-camera-structured-target",
      ownerAgentId: "agent:main",
      toolName: "yeonjang_camera_capture",
      params: {
        targetSelector: { type: "node_id", nodeId: "model-selected-node" },
        extensionId: "model-selected-extension",
        requestedFacing: "front",
      },
      context: {} as never,
      dispatcher: {
        get: vi.fn(() => ({
          parameters: {
            type: "object",
            properties: {
              extensionId: { type: "string" },
              targetSelector: { type: "object" },
              targetSessionId: { type: "string" },
              requestedFacing: { type: "string" },
            },
          },
        })),
        dispatch,
      },
    })

    expect(result).toMatchObject({ success: true })
    expect(dispatch).toHaveBeenCalledWith(
      "yeonjang_camera_capture",
      {
        targetSelector: {
          type: "instance_id",
          instanceId: "instance-local",
        },
        requestedFacing: "front",
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
  })

  it("rejects a model-provided target that differs from the admitted target", async () => {
    const dispatch = vi.fn()
    const result = await dispatchRunScopedTool({
      scope: {
        schemaVersion: 1,
        kind: "tool_bundle_skill",
        runId: "run-camera",
        ownerAgentId: "agent:main",
        receiptId: "receipt:camera-admission",
        capabilitySnapshotFingerprint: `sha256:${"a".repeat(64)}`,
        selectedCapabilityId: "yeonjang_camera_capture",
        selectedTargetIds: ["client:camera-1"],
        toolNames: ["yeonjang_camera_capture"],
      },
      runId: "run-camera",
      ownerAgentId: "agent:main",
      toolName: "yeonjang_camera_capture",
      params: { extensionId: "client:camera-2" },
      context: {} as never,
      dispatcher: {
        get: vi.fn(() => ({
          parameters: {
            type: "object",
            properties: {
              extensionId: { type: "string" },
            },
          },
        })),
        dispatch,
      },
    })

    expect(result).toMatchObject({
      success: false,
      error: "run_scoped_target_mismatch",
    })
    expect(dispatch).not.toHaveBeenCalled()
  })

  it("expands only the exact admitted Skill binding into an immutable Tool scope", () => {
    expect(scope()).toEqual({
      ok: true,
      scope: {
        schemaVersion: 1,
        kind: "tool_bundle_skill",
        runId: "run-1",
        ownerAgentId: "agent:main",
        receiptId: "receipt:selection:run-1",
        capabilitySnapshotFingerprint: `sha256:${"a".repeat(64)}`,
        selectedCapabilityId: "skill:web-research",
        toolNames: ["web_search"],
      },
    })
  })

  it("creates an isolated instruction scope without inventing Tool access", () => {
    const admitted = createAdmittedCapabilityExecutionScope({
      runId: "run-instruction",
      ownerAgentId: "agent:main",
      capabilitySnapshotFingerprint: `sha256:${"b".repeat(64)}`,
      admission: {
        status: "allowed",
        receiptId: "receipt:selection:run-instruction",
        selectedBinding: {
          capabilityId: "skill:ui-guidance",
          targetId: "agent:main",
          risk: "safe",
        },
      },
      selectedCandidateContext: {
        kind: "instruction_skill",
        capabilityId: "skill:ui-guidance",
        targetId: "agent:main",
        content: "Review controls for clarity.",
        checksum: `sha256:${"c".repeat(64)}`,
      },
      skillDefinitions: [],
      skillBindings: [],
    })

    expect(admitted).toEqual({
      ok: true,
      scope: {
        schemaVersion: 1,
        kind: "instruction_skill",
        runId: "run-instruction",
        ownerAgentId: "agent:main",
        receiptId: "receipt:selection:run-instruction",
        capabilitySnapshotFingerprint: `sha256:${"b".repeat(64)}`,
        selectedCapabilityId: "skill:ui-guidance",
        toolNames: [],
        instruction: {
          content: "Review controls for clarity.",
          checksum: `sha256:${"c".repeat(64)}`,
        },
      },
    })
    if (!admitted.ok) return
    expect(
      projectRunScopedInstruction({
        scope: admitted.scope,
        runId: "run-instruction",
        ownerAgentId: "agent:main",
      }),
    ).toEqual({
      capabilityId: "skill:ui-guidance",
      content: "Review controls for clarity.",
      checksum: `sha256:${"c".repeat(64)}`,
    })
    expect(
      projectRunScopedInstruction({
        scope: admitted.scope,
        runId: "run-other",
        ownerAgentId: "agent:main",
      }),
    ).toBeNull()
    expect(
      projectRunScopedToolNames({
        scope: admitted.scope,
        runId: "run-instruction",
        ownerAgentId: "agent:main",
        availableToolNames: ["shell_exec"],
      }),
    ).toEqual([])
  })

  it("projects no model Tool names for wrong run or owner scope", () => {
    const admitted = scope()
    expect(admitted.ok).toBe(true)
    if (!admitted.ok) return

    expect(
      projectRunScopedToolNames({
        scope: admitted.scope,
        runId: "run-other",
        ownerAgentId: "agent:main",
        availableToolNames: ["web_search", "web_fetch", "shell_exec"],
      }),
    ).toEqual([])
    expect(
      projectRunScopedToolNames({
        scope: admitted.scope,
        runId: "run-1",
        ownerAgentId: "agent:child",
        availableToolNames: ["web_search", "web_fetch"],
      }),
    ).toEqual([])
  })

  it("blocks direct Tool name injection before calling the dispatcher", async () => {
    const admitted = scope()
    expect(admitted.ok).toBe(true)
    if (!admitted.ok) return
    const dispatch = vi.fn()

    const result = await dispatchRunScopedTool({
      scope: admitted.scope,
      runId: "run-1",
      ownerAgentId: "agent:main",
      toolName: "shell_exec",
      params: {},
      context: {} as never,
      dispatcher: { dispatch },
    })

    expect(result).toEqual({
      success: false,
      output: "선택된 실행 범위에 포함되지 않은 도구입니다.",
      error: "run_scoped_tool_not_admitted",
      details: {
        kind: "run_scoped_pre_dispatch_failure",
        reasonCode: "run_scoped_tool_not_admitted",
        effectStarted: false,
        repairRequired: true,
        failureFingerprint: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
      },
    })
    expect(dispatch).not.toHaveBeenCalled()
  })
})
