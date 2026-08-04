import { createHash } from "node:crypto"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ToolContext } from "../packages/core/src/tools/types.ts"

const invokeYeonjangMethod = vi.fn()
const getMqttExtensionSnapshots = vi.fn()
const fsMocks = vi.hoisted(() => ({
  mkdirSync: vi.fn(),
  statSync: vi.fn(() => ({ size: 321 })),
  writeFileSync: vi.fn(),
}))
let stateDir = ""

vi.mock("../packages/core/src/yeonjang/mqtt-client.js", () => ({
  invokeYeonjangMethod,
  DEFAULT_YEONJANG_EXTENSION_ID: "yeonjang-main",
}))

vi.mock("../packages/core/src/mqtt/broker.js", () => ({
  getMqttExtensionSnapshots,
}))

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs")
  return {
    ...actual,
    mkdirSync: fsMocks.mkdirSync,
    statSync: fsMocks.statSync,
    writeFileSync: fsMocks.writeFileSync,
  }
})

const db = await import("../packages/core/src/db/index.js")
const { DEFAULT_CONFIG } = await import("../packages/core/src/config/types.ts")
const { eventBus } = await import("../packages/core/src/events/index.js")
const { createRootRun } = await import("../packages/core/src/runs/store.ts")
const { dispatchRunScopedTool } = await import(
  "../packages/core/src/runs/run-scoped-tool-admission.ts"
)
const { initializeTestDbRuntime } = await import("./fixtures/runtime-db.ts")
const { ToolDispatcher } = await import("../packages/core/src/tools/dispatcher.ts")
const {
  executeToolWithSideEffectLedger,
  resolveToolSideEffectOperation,
} = await import("../packages/core/src/tools/side-effect-runtime.ts")
const { yeonjangCameraCaptureTool } = await import("../packages/core/src/tools/builtin/yeonjang.ts")
const { getYeonjangGatewayHostFingerprint } =
  await import("../packages/core/src/yeonjang/runtime-identity.ts")

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stable(nested)}`)
      .join(",")}}`
  }
  return JSON.stringify(value) ?? "null"
}

function hash(value: unknown): string {
  return createHash("sha256").update(stable(value)).digest("hex")
}

function setupDb() {
  stateDir = mkdtempSync(join(tmpdir(), "knowbee-yeonjang-camera-side-effect-"))
  initializeTestDbRuntime(stateDir)
  const now = Date.now()
  db.insertSession({
    id: "session-059",
    source: "telegram",
    source_id: null,
    created_at: now,
    updated_at: now,
    summary: null,
  })
  createRootRun({
    id: "run-059",
    sessionId: "session-059",
    prompt: "연장 카메라로 사진 찍어줘",
    source: "telegram",
  })
}

function setupSnapshot() {
  getMqttExtensionSnapshots.mockReturnValue([
    {
      extensionId: "yeonjang-main",
      displayName: "작업용 맥",
      instanceId: "instance-local",
      instanceAlias: "local-mac",
      state: "online",
      message: "ready",
      platform: "macos",
      hostFingerprint: getYeonjangGatewayHostFingerprint(),
      methods: ["camera.capture"],
      sessionId: "target-session-059",
      trustState: "trusted",
    },
  ])
}

function createContext(params: Record<string, unknown>, withApproval = true): ToolContext {
  const context: ToolContext = {
    artifactStorage: {
      rootDir: join(stateDir, "artifacts"),
      fileSystem: {
        exists: () => false,
        realpath: (path) => path,
        remove: () => undefined,
        stat: () => ({ size: 0 }) as never,
      },
    },
    sessionId: "session-059",
    runId: "run-059",
    requestGroupId: "run-059",
    workDir: process.cwd(),
    userMessage: "연장 카메라로 사진 찍어줘",
    source: "telegram",
    allowWebAccess: false,
    onProgress: vi.fn(),
    signal: new AbortController().signal,
  }
  if (!withApproval) return context
  const resolved = resolveToolSideEffectOperation({
    tool: yeonjangCameraCaptureTool,
    params,
    ctx: context,
  })
  const authorizationParams = resolved.status === "resolved"
    ? resolved.operation.authorizationParams
    : params
  return {
    ...context,
    authorizationReceipt: {
      policyDecisionId: "policy-059",
      toolName: "yeonjang_camera_capture",
      paramsHash: hash(authorizationParams),
      policyDecision: "allow",
      permissionScope: "yeonjang:camera.capture",
      runId: "run-059",
      requestGroupId: "run-059",
      approvalDecision: "allow_run",
      approvalId: "approval-059",
    },
  }
}

function operationRows(): Array<{ state: string; revision: number; adapter_id: string }> {
  return db
    .getDb()
    .prepare<[], { state: string; revision: number; adapter_id: string }>(
      "SELECT state, revision, adapter_id FROM side_effect_operations ORDER BY created_at",
    )
    .all()
}

function serializedReceiptRows(): string {
  return JSON.stringify(
    db
      .getDb()
      .prepare("SELECT * FROM side_effect_operation_receipts ORDER BY operation_revision")
      .all(),
  )
}

describe("Task 059 Yeonjang camera capture side-effect ledger", () => {
  beforeEach(() => {
    setupDb()
    setupSnapshot()
    invokeYeonjangMethod.mockReset()
    fsMocks.mkdirSync.mockClear()
    fsMocks.statSync.mockClear()
    fsMocks.writeFileSync.mockClear()
    fsMocks.statSync.mockReturnValue({ size: 321 })
  })

  afterEach(() => {
    db.closeDb()
    if (stateDir) rmSync(stateDir, { recursive: true, force: true })
    stateDir = ""
  })

  it("canonicalizes camera operation by target and requested device only", () => {
    const base = {
      extensionId: "yeonjang-main",
      targetSessionId: "target-session-059",
      deviceId: "camera-1",
    }
    const ctx = createContext(base, false)
    const canonicalOperation = yeonjangCameraCaptureTool.sideEffect?.canonicalOperation

    expect(canonicalOperation?.({
      ...base,
      outputPath: "/first",
      inlineBase64: false,
      timeoutSec: 30,
    }, ctx)).toEqual(base)
    expect(canonicalOperation?.({
      ...base,
      outputPath: "/second",
      inlineBase64: true,
      timeoutSec: 60,
    }, ctx)).toEqual(base)
    expect(canonicalOperation?.({
      ...base,
      deviceId: "camera-2",
    }, ctx)).not.toEqual(base)
  })

  it("prepares node and local selectors as one exact target operation without timeout identity", () => {
    const prepareOperation = yeonjangCameraCaptureTool.sideEffect?.prepareOperation
    const ctx = createContext({}, false)
    const byNode = prepareOperation?.({
      targetSelector: { type: "node_id", nodeId: "yeonjang-main" },
      timeoutSec: 60,
    }, ctx)
    const byLocal = prepareOperation?.({
      targetSelector: { type: "local" },
      timeoutSec: 90,
    }, ctx)
    const frontFacing = prepareOperation?.({
      targetSelector: { type: "local" },
      requestedFacing: "front",
      timeoutSec: 90,
    }, ctx)

    expect(byNode).toMatchObject({
      status: "prepared",
      executionParams: {
        extensionId: "yeonjang-main",
        targetSessionId: "target-session-059",
      },
      effectParams: {},
    })
    expect(byLocal).toMatchObject({
      status: "prepared",
      executionParams: {
        extensionId: "yeonjang-main",
        targetSessionId: "target-session-059",
      },
      effectParams: {},
    })
    expect(byNode?.status === "prepared" ? byNode.targetRef : null).toBe(
      byLocal?.status === "prepared" ? byLocal.targetRef : null,
    )
    expect(byNode?.status === "prepared" ? byNode.effectParams : null).toEqual(
      byLocal?.status === "prepared" ? byLocal.effectParams : null,
    )
    expect(frontFacing).toMatchObject({
      status: "prepared",
      executionParams: {
        extensionId: "yeonjang-main",
        targetSessionId: "target-session-059",
      },
      effectParams: {},
    })
  })

  it("prepares the canonical run-scoped instance target without conflicting model selectors", async () => {
    const prepareOperation = yeonjangCameraCaptureTool.sideEffect?.prepareOperation
    const dispatch = vi.fn(async (
      _toolName: string,
      params: Record<string, unknown>,
      context: ToolContext,
    ) => {
      const prepared = prepareOperation?.(params, context)
      return prepared?.status === "prepared"
        ? { success: true, output: prepared.targetRef }
        : { success: false, output: "", error: prepared?.result.error }
    })

    const result = await dispatchRunScopedTool({
      scope: {
        schemaVersion: 1,
        kind: "tool_bundle_skill",
        runId: "run-059",
        ownerAgentId: "agent:knowbee",
        receiptId: "receipt:camera-instance-target",
        capabilitySnapshotFingerprint: `sha256:${"c".repeat(64)}`,
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
      runId: "run-059",
      ownerAgentId: "agent:knowbee",
      toolName: "yeonjang_camera_capture",
      params: {
        extensionId: "model-extension",
        targetSelector: { type: "node_id", nodeId: "model-node" },
      },
      context: createContext({}, false),
      dispatcher: {
        get: vi.fn(() => yeonjangCameraCaptureTool),
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
      },
      expect.anything(),
      expect.objectContaining({
        authorizationScope: {
          executionTargetFingerprint: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
        },
      }),
    )
  })

  it("executes camera.capture through the side-effect ledger without storing raw base64", async () => {
    const params = {
      extensionId: "yeonjang-main",
      deviceId: "camera-1",
      inlineBase64: false,
      timeoutSec: 60,
    }
    invokeYeonjangMethod.mockResolvedValueOnce({
      device_id: "camera-1",
      output_path: "/remote/captures",
      file_name: "capture.jpg",
      file_extension: "jpg",
      mime_type: "image/jpeg",
      size_bytes: 123,
      transfer_encoding: "base64",
      base64_data: "aGVsbG8=",
      message: "Camera capture completed.",
    })

    const first = await executeToolWithSideEffectLedger({
      tool: yeonjangCameraCaptureTool,
      params,
      ctx: createContext(params),
    })
    const replay = await executeToolWithSideEffectLedger({
      tool: yeonjangCameraCaptureTool,
      params,
      ctx: createContext(params),
    })

    expect(first.success).toBe(true)
    expect(replay).toMatchObject({
      success: true,
      details: { kind: "side_effect_duplicate_verified" },
    })
    expect(invokeYeonjangMethod).toHaveBeenCalledTimes(1)
    expect(operationRows()).toEqual([
      { state: "VERIFIED", revision: 4, adapter_id: "tool:yeonjang_camera_capture" },
    ])
    const receipts = serializedReceiptRows()
    expect(receipts).not.toContain("aGVsbG8=")
    expect(receipts).not.toContain("base64_data")
    expect(receipts).not.toContain("/remote/captures")
    expect(receipts).toMatch(/artifact:[0-9a-f-]{36}/u)
    expect(receipts).toContain("side-effect-fact:camera-device-constraint-satisfied:v1")
  })

  it("projects receipt-bound artifact evidence for restart observation", async () => {
    const params = {
      extensionId: "yeonjang-main",
      deviceId: "camera-1",
      inlineBase64: false,
      timeoutSec: 60,
    }
    invokeYeonjangMethod.mockResolvedValueOnce({
      device_id: "camera-1",
      mime_type: "image/jpeg",
      transfer_encoding: "base64",
      base64_data: "aGVsbG8=",
      message: "Camera capture completed.",
    })
    const ctx = createContext(params)
    ctx.artifactStorage.fileSystem = {
      exists: () => true,
      realpath: (path) => path,
      remove: () => undefined,
      stat: () => ({ isFile: () => true, size: 321 }) as never,
    }

    const captureResult = await yeonjangCameraCaptureTool.execute(params, ctx)
    const evidenceRefs = yeonjangCameraCaptureTool.sideEffect?.effectEvidenceRefs?.(
      params,
      ctx,
      captureResult,
    )
    const observation = await yeonjangCameraCaptureTool.sideEffect?.observeCurrent?.(
      params,
      ctx,
      evidenceRefs ?? [],
    )
    const crossRunObservation =
      await yeonjangCameraCaptureTool.sideEffect?.observeCurrent?.(
        params,
        {
          ...ctx,
          runId: "run-other",
          requestGroupId: "run-other",
        },
        evidenceRefs ?? [],
      )
    const missingArtifactObservation =
      await yeonjangCameraCaptureTool.sideEffect?.observeCurrent?.(
        params,
        ctx,
        ["side-effect-fact:camera-device-constraint-satisfied:v1"],
      )

    expect(evidenceRefs).toEqual([
      expect.stringMatching(/^artifact:/),
      "side-effect-fact:camera-device-constraint-satisfied:v1",
    ])
    expect(observation).toMatchObject({
      available: true,
      expectedState: {
        artifact: "local_saved",
        requestedDevice: { kind: "exact", deviceId: "camera-1" },
        minBytes: 1,
      },
      observedState: {
        artifact: "local_saved",
        requestedDevice: { kind: "exact", deviceId: "camera-1" },
        minBytes: 1,
      },
    })
    expect(crossRunObservation).toMatchObject({
      available: false,
      observedState: { reason: "camera_artifact_resume_evidence_invalid" },
    })
    expect(missingArtifactObservation).toMatchObject({
      available: false,
      observedState: { reason: "camera_artifact_resume_evidence_invalid" },
    })
    expect(invokeYeonjangMethod).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(evidenceRefs)).not.toContain("camera-1")
    expect(JSON.stringify(evidenceRefs)).not.toContain(stateDir)
  })

  it("verifies a default-device capture from its non-empty resolved device", async () => {
    const params = {
      extensionId: "yeonjang-main",
      inlineBase64: false,
      timeoutSec: 60,
    }
    invokeYeonjangMethod.mockResolvedValueOnce({
      device_id: "platform-default-camera",
      mime_type: "image/jpeg",
      transfer_encoding: "base64",
      base64_data: "aGVsbG8=",
      message: "Camera capture completed.",
    })

    const result = await executeToolWithSideEffectLedger({
      tool: yeonjangCameraCaptureTool,
      params,
      ctx: createContext(params),
    })

    expect(result.success).toBe(true)
    expect(operationRows()).toEqual([
      { state: "VERIFIED", revision: 4, adapter_id: "tool:yeonjang_camera_capture" },
    ])
    expect(invokeYeonjangMethod).toHaveBeenCalledTimes(1)
  })

  it("verifies a default-device capture from its bound artifact when no exact device was requested", async () => {
    const params = {
      extensionId: "yeonjang-main",
      inlineBase64: false,
      timeoutSec: 60,
    }
    invokeYeonjangMethod.mockResolvedValueOnce({
      mime_type: "image/jpeg",
      transfer_encoding: "base64",
      base64_data: "aGVsbG8=",
      message: "Camera capture completed.",
    })

    const result = await executeToolWithSideEffectLedger({
      tool: yeonjangCameraCaptureTool,
      params,
      ctx: createContext(params),
    })

    expect(result).toMatchObject({ success: true })
    expect(operationRows()).toEqual([
      { state: "VERIFIED", revision: 4, adapter_id: "tool:yeonjang_camera_capture" },
    ])
    expect(invokeYeonjangMethod).toHaveBeenCalledTimes(1)
  })

  it("does not verify a capture resolved to a different explicit device", async () => {
    const params = {
      extensionId: "yeonjang-main",
      deviceId: "camera-requested",
      inlineBase64: false,
      timeoutSec: 60,
    }
    invokeYeonjangMethod.mockResolvedValueOnce({
      device_id: "camera-observed",
      mime_type: "image/jpeg",
      transfer_encoding: "base64",
      base64_data: "aGVsbG8=",
      message: "Camera capture completed.",
    })

    const result = await executeToolWithSideEffectLedger({
      tool: yeonjangCameraCaptureTool,
      params,
      ctx: createContext(params),
    })

    expect(result).toMatchObject({
      success: false,
      error: "SIDE_EFFECT_MANUAL_INTERVENTION",
      details: {
        recoveryEvidence: {
          kind: "artifact_candidate",
          artifactRef: expect.stringMatching(/^artifact:/),
          mimeType: "image/jpeg",
          sizeBytes: 321,
          reasonCode: "camera_resolved_device_mismatch",
          resolvedDevicePresent: true,
        },
      },
    })
    expect(operationRows()).toEqual([
      { state: "MANUAL_INTERVENTION", revision: 5, adapter_id: "tool:yeonjang_camera_capture" },
    ])
    expect(invokeYeonjangMethod).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(result.details)).not.toContain("camera-requested")
    expect(JSON.stringify(result.details)).not.toContain("camera-observed")
    expect(JSON.stringify(result.details)).not.toContain(stateDir)
  })

  it.each([
    ["camera_response_timeout", "camera_response_timeout"],
    ["camera_handler_timeout", "camera_handler_timeout"],
    ["camera_helper_timeout", "camera_helper_timeout"],
    ["camera_busy", "camera_busy"],
    ["camera_capture_cancelled", "camera_capture_cancelled"],
    ["camera_capture_timeout", "camera_capture_timeout"],
  ] as const)(
    "preserves bounded runtime failure %s and blocks unchanged replay",
    async (code, reasonCode) => {
      const params = {
        extensionId: "yeonjang-main",
        deviceId: "camera-1",
        timeoutSec: 60,
      }
      invokeYeonjangMethod.mockRejectedValueOnce(Object.assign(
        new Error("raw camera runtime detail"),
        { code },
      ))

      const first = await executeToolWithSideEffectLedger({
        tool: yeonjangCameraCaptureTool,
        params,
        ctx: createContext(params),
      })
      const replay = await executeToolWithSideEffectLedger({
        tool: yeonjangCameraCaptureTool,
        params,
        ctx: createContext(params),
      })

      expect(first).toMatchObject({
        success: false,
        error: "SIDE_EFFECT_MANUAL_INTERVENTION",
        details: {
          failure: {
            reasonCode,
            retrySameStrategy: false,
          },
        },
      })
      expect(replay).toMatchObject({
        success: false,
        error: "SIDE_EFFECT_MANUAL_INTERVENTION",
        details: {
          reasonCode: "side_effect_existing_manual_intervention",
        },
      })
      expect(invokeYeonjangMethod).toHaveBeenCalledOnce()
      expect(operationRows()).toEqual([
        {
          state: "MANUAL_INTERVENTION",
          revision: 5,
          adapter_id: "tool:yeonjang_camera_capture",
        },
      ])
      expect(serializedReceiptRows()).not.toContain(
        "raw camera runtime detail",
      )
      expect(db.listArtifactMetadataForRun("run-059")).toHaveLength(0)
    },
  )

  it("preserves typed handler stage and retry safety through manual intervention", async () => {
    const params = {
      extensionId: "yeonjang-main",
      deviceId: "camera-1",
      timeoutSec: 60,
    }
    invokeYeonjangMethod.mockRejectedValueOnce(Object.assign(
      new Error("bounded handler timeout"),
      {
        code: "camera_handler_timeout",
        attempt: {
          schemaVersion: 1,
          method: "camera.capture",
          commandId: "command-1",
          terminalStage: "handler_timeout",
          reasonCode: "camera_handler_timeout",
          retrySafety: "unknown_effect_state",
        },
      },
    ))

    const result = await executeToolWithSideEffectLedger({
      tool: yeonjangCameraCaptureTool,
      params,
      ctx: createContext(params),
    })

    expect(result).toMatchObject({
      success: false,
      error: "SIDE_EFFECT_MANUAL_INTERVENTION",
      details: {
        failure: {
          reasonCode: "camera_handler_timeout",
          terminalStage: "handler_timeout",
          retrySafety: "unknown_effect_state",
          retrySameStrategy: false,
        },
      },
    })
  })

  it("records an exact pre-effect runtime rejection without claiming manual intervention", async () => {
    const params = {
      extensionId: "yeonjang-main",
      deviceId: "camera-1",
      timeoutSec: 60,
    }
    invokeYeonjangMethod.mockRejectedValueOnce(Object.assign(
      new Error("Side effect authorization is required."),
      {
        code: "side_effect_authorization_required",
        attempt: {
          schemaVersion: 1,
          method: "camera.capture",
          commandId: "command-059",
          operationId: "operation-059",
          terminalStage: "rejected",
          reasonCode: "side_effect_authorization_required",
          retrySafety: "change_strategy",
        },
      },
    ))

    const first = await executeToolWithSideEffectLedger({
      tool: yeonjangCameraCaptureTool,
      params,
      ctx: createContext(params),
    })
    const replay = await executeToolWithSideEffectLedger({
      tool: yeonjangCameraCaptureTool,
      params,
      ctx: createContext(params),
    })

    expect(first).toMatchObject({
      success: false,
      error: "side_effect_authorization_required",
      details: {
        kind: "side_effect_effect_rejected",
        failure: {
          reasonCode: "side_effect_authorization_required",
          terminalStage: "rejected",
          retrySafety: "change_strategy",
        },
      },
    })
    expect(replay).toMatchObject({
      success: false,
      error: "SIDE_EFFECT_EFFECT_REJECTED",
      details: {
        reasonCode: "side_effect_existing_effect_rejected",
      },
    })
    expect(invokeYeonjangMethod).toHaveBeenCalledOnce()
    expect(operationRows()).toEqual([
      {
        state: "EFFECT_REJECTED",
        revision: 2,
        adapter_id: "tool:yeonjang_camera_capture",
      },
    ])
  })

  it("keeps a v2 camera OS setup blocker in the pre-effect rejected state", async () => {
    const params = {
      extensionId: "yeonjang-main",
      timeoutSec: 60,
    }
    invokeYeonjangMethod.mockRejectedValueOnce(Object.assign(
      new Error("Yeonjang MQTT v2 execution did not succeed."),
      {
        code: "camera_permission_not_determined",
        attempt: {
          schemaVersion: 1,
          method: "camera.capture",
          commandId: "command-v2",
          operationId: "operation-v2",
          terminalStage: "rejected",
          reasonCode: "camera_permission_not_determined",
          retrySafety: "change_strategy",
        },
      },
    ))

    const result = await executeToolWithSideEffectLedger({
      tool: yeonjangCameraCaptureTool,
      params,
      ctx: createContext(params),
    })

    expect(result).toMatchObject({
      success: false,
      error: "CAMERA_PERMISSION_NOT_DETERMINED",
      details: {
        kind: "side_effect_effect_rejected",
        failure: {
          reasonCode: "camera_permission_not_determined",
          terminalStage: "rejected",
          retrySafety: "change_strategy",
        },
      },
    })
    expect(operationRows()).toEqual([{
      state: "EFFECT_REJECTED",
      revision: 2,
      adapter_id: "tool:yeonjang_camera_capture",
    }])
    expect(db.listArtifactMetadataForRun("run-059")).toHaveLength(0)
  })

  it("does not request a second approval when recovery rewrites an already attempted camera operation", async () => {
    const dispatcher = new ToolDispatcher({ config: DEFAULT_CONFIG })
    dispatcher.register(yeonjangCameraCaptureTool)
    const approvals: string[] = []
    const detach = eventBus.on("approval.request", ({ approvalId, resolve }) => {
      approvals.push(approvalId)
      resolve("allow_run")
    })
    const context = createContext({}, false)
    invokeYeonjangMethod.mockRejectedValueOnce(Object.assign(
      new Error("raw camera runtime detail"),
      { code: "camera_busy" },
    ))

    try {
      const first = await dispatcher.dispatch(
        "yeonjang_camera_capture",
        {
          targetSelector: { type: "node_id", nodeId: "yeonjang-main" },
          timeoutSec: 60,
        },
        context,
      )
      const rewrittenRecovery = await dispatcher.dispatch(
        "yeonjang_camera_capture",
        {
          targetSelector: { type: "local" },
          requestedFacing: "front",
          timeoutSec: 90,
        },
        context,
      )

      expect(first).toMatchObject({
        success: false,
        error: "SIDE_EFFECT_MANUAL_INTERVENTION",
      })
      expect(rewrittenRecovery).toMatchObject({
        success: false,
        error: "recovery_strategy_unchanged",
        details: {
          reasonCode: "recovery_strategy_unchanged",
        },
      })
    } finally {
      detach()
    }

    expect(approvals).toHaveLength(1)
    expect(invokeYeonjangMethod).toHaveBeenCalledTimes(1)
    expect(operationRows()).toEqual([
      {
        state: "MANUAL_INTERVENTION",
        revision: 5,
        adapter_id: "tool:yeonjang_camera_capture",
      },
    ])
  })

  it("blocks camera.capture before remote invoke when approval receipt is missing", async () => {
    const params = {
      extensionId: "yeonjang-main",
      deviceId: "camera-1",
      inlineBase64: false,
      timeoutSec: 60,
    }

    const result = await executeToolWithSideEffectLedger({
      tool: yeonjangCameraCaptureTool,
      params,
      ctx: createContext(params, false),
    })

    expect(result).toMatchObject({
      success: false,
      error: "SIDE_EFFECT_OPERATION_BLOCKED",
      details: { reasonCode: "side_effect_authorization_required" },
    })
    expect(invokeYeonjangMethod).not.toHaveBeenCalled()
  })
})
