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
        toolNames: ["web_search"],
      },
    })
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
    })
    expect(dispatch).not.toHaveBeenCalled()
  })
})
