import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { ToolContext } from "../packages/core/src/tools/types.ts"

const isolatedStateDir = join(tmpdir(), `knowbee-camera-tool-test-${process.pid}`)

const canYeonjangHandleMethod = vi.fn()
const invokeYeonjangMethod = vi.fn()
const isYeonjangUnavailableError = vi.fn((error: unknown) => error === "unavailable")
const mkdirSync = vi.fn()
const statSync = vi.fn(() => ({ size: 321 }))
const writeFileSync = vi.fn()
const getMqttExtensionSnapshots = vi.fn()

vi.mock("../packages/core/src/yeonjang/mqtt-client.js", () => ({
  canYeonjangHandleMethod,
  invokeYeonjangMethod,
  isYeonjangUnavailableError,
  DEFAULT_YEONJANG_EXTENSION_ID: "yeonjang-main",
}))

vi.mock("../packages/core/src/mqtt/broker.js", () => ({
  getMqttExtensionSnapshots,
}))

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs")
  return {
    ...actual,
    mkdirSync,
    statSync,
    writeFileSync,
  }
})

const realFs = await vi.importActual<typeof import("node:fs")>("node:fs")
realFs.mkdirSync(isolatedStateDir, { recursive: true })
const { closeDb } = await import("../packages/core/src/db/index.js")
const { initializeTestDbRuntime } = await import("./fixtures/runtime-db.ts")
initializeTestDbRuntime(isolatedStateDir)

const {
  yeonjangCameraCaptureTool,
  yeonjangCameraPermissionStatusTool,
} = await import("../packages/core/src/tools/builtin/yeonjang.ts")

afterAll(() => {
  closeDb()
  realFs.rmSync(isolatedStateDir, { recursive: true, force: true })
})

function createContext(): ToolContext {
  return {
    artifactStorage: {
      rootDir: join(isolatedStateDir, "artifacts"),
      fileSystem: {
        exists: realFs.existsSync,
        realpath: realFs.realpathSync,
        remove: (path) => realFs.rmSync(path, { force: true }),
        stat: realFs.statSync,
      },
    },
    sessionId: "session-1",
    runId: "run-1",
    requestGroupId: "request-group-1",
    workDir: process.cwd(),
    userMessage: "FaceTime HD 카메라로 사진 찍어줘",
    source: "telegram",
    allowWebAccess: false,
    onProgress: vi.fn(),
    signal: new AbortController().signal,
  }
}

describe("yeonjang camera capture tool", () => {
  beforeEach(() => {
    canYeonjangHandleMethod.mockReset()
    invokeYeonjangMethod.mockReset()
    isYeonjangUnavailableError.mockClear()
    mkdirSync.mockClear()
    statSync.mockClear()
    writeFileSync.mockClear()
    statSync.mockReturnValue({ size: 321 })
    getMqttExtensionSnapshots.mockReturnValue([
      {
        extensionId: "yeonjang-main",
        displayName: "Yeonjang-osx",
        instanceId: "inst-local-main",
        instanceAlias: "local-mac",
        state: "online",
        message: "macOS connected",
        platform: "macos",
        methods: ["camera.capture", "camera.list"],
        sessionId: "sess-local-main",
      },
    ])
  })

  it("does not expose adapter-owned output and transfer controls to the LLM", () => {
    expect(yeonjangCameraCaptureTool.parameters.properties).not.toHaveProperty("outputPath")
    expect(yeonjangCameraCaptureTool.parameters.properties).not.toHaveProperty("inlineBase64")
  })

  it.each([
    ["denied", "camera_permission_denied", false, true],
    ["restricted", "camera_permission_restricted", false, true],
    ["not_determined", "camera_permission_not_determined", true, true],
  ] as const)(
    "keeps permission state %s as read-only typed evidence",
    async (
      status,
      reason,
      canAttemptCapture,
      requiresUserAction,
    ) => {
      invokeYeonjangMethod.mockResolvedValueOnce({
        status,
        reason,
        platform: "macos",
        canAttemptCapture,
        requiresUserAction,
      })

      const result = await yeonjangCameraPermissionStatusTool.execute({
        extensionId: "yeonjang-main",
      }, createContext())

      expect(result).toMatchObject({
        success: true,
        details: {
          cameraPermission: {
            status,
            reason,
            canAttemptCapture,
            requiresUserAction,
          },
        },
      })
      expect(invokeYeonjangMethod).toHaveBeenCalledOnce()
      expect(invokeYeonjangMethod.mock.calls[0]?.[0]).toBe(
        "camera.permission_status",
      )
      expect(writeFileSync).not.toHaveBeenCalled()
    },
  )

  it("forces inline base64 capture and does not leak remote output paths", async () => {
    const executionAuthorizationIssuer = {
      issue: vi.fn(() => ({
        ok: false as const,
        reasonCode: "execution_authorization_input_invalid" as const,
      })),
    }
    invokeYeonjangMethod.mockResolvedValueOnce({
      device_id: "camera-1",
      output_path: "/captures",
      file_name: "facetime.jpg",
      file_extension: "jpg",
      mime_type: "image/jpeg",
      size_bytes: 123,
      transfer_encoding: "base64",
      base64_data: "aGVsbG8=",
      message: "Camera capture completed.",
    })

    const result = await yeonjangCameraCaptureTool.execute({
      extensionId: "yeonjang-main",
      deviceId: "camera-1",
      timeoutSec: 60,
    }, {
      ...createContext(),
      authorizationReceipt: {
        policyDecisionId: "policy-1",
        toolName: "yeonjang_camera_capture",
        paramsHash: "params-1",
        policyDecision: "allow",
        permissionScope: "tool:yeonjang_camera_capture",
        runId: "run-1",
        requestGroupId: "request-group-1",
        approvalDecision: "allow_once",
        approvalId: "approval-1",
      },
      sideEffectOperation: {
        operationId: "operation-1",
        targetFingerprint: `sha256:${"a".repeat(64)}`,
      },
      yeonjangExecutionAuthorizationIssuer: executionAuthorizationIssuer,
    })

    expect(invokeYeonjangMethod).toHaveBeenCalledWith(
      "camera.capture",
      {
        device_id: "camera-1",
        inline_base64: true,
        capture_timeout_ms: 60_000,
      },
      expect.objectContaining({
        extensionId: "yeonjang-main",
        timeoutMs: 70_000,
        signal: expect.any(AbortSignal),
        executionAuthorization: {
          issuer: executionAuthorizationIssuer,
          resourceScope: "camera",
          grant: {
            approvalId: "approval-1",
            permissionScope: "tool:yeonjang_camera_capture",
            decision: "allow_once",
          },
        },
        metadata: {
          runId: "run-1",
          requestGroupId: "request-group-1",
          sessionId: "session-1",
          targetSessionId: "sess-local-main",
          operationId: "operation-1",
          targetFingerprint: `sha256:${"a".repeat(64)}`,
          source: "telegram",
        },
      }),
    )
    expect(result.success).toBe(true)
    expect(result.details).toMatchObject({
      via: "yeonjang",
      extensionId: "yeonjang-main",
      deviceId: "camera-1",
      fileName: "facetime.jpg",
      fileExtension: "jpg",
      mimeType: "image/jpeg",
      sizeBytes: 123,
      transferEncoding: "base64",
      artifactVerification: {
        status: "verified",
        artifactRef: expect.stringMatching(/^artifact:/),
        mimeType: "image/jpeg",
        sizeBytes: 321,
      },
    })
    expect(result.details).not.toHaveProperty("output_path")
    expect(result.details).not.toHaveProperty("base64_data")
    expect(result.details).not.toHaveProperty("localSavedPath")
    expect(result.output).not.toContain(join(isolatedStateDir, "artifacts"))
    expect(writeFileSync).toHaveBeenCalledTimes(1)
    expect(writeFileSync.mock.calls[0]?.[0]).toEqual(
      expect.stringContaining(join(isolatedStateDir, "artifacts", "yeonjang")),
    )
  })

  it("projects a WebUI camera artifact by opaque ref instead of internal path", async () => {
    invokeYeonjangMethod.mockResolvedValueOnce({
      device_id: "camera-1",
      mime_type: "image/png",
      transfer_encoding: "base64",
      base64_data: "aGVsbG8=",
      message: "Camera capture completed.",
    })

    const result = await yeonjangCameraCaptureTool.execute({
      extensionId: "yeonjang-main",
      deviceId: "camera-1",
    }, {
      ...createContext(),
      source: "webui",
    })

    expect(result).toMatchObject({
      success: true,
      details: {
        kind: "artifact_delivery",
        channel: "webui",
        artifactRef: expect.stringMatching(/^artifact:/),
        mimeType: "image/png",
        size: 321,
      },
    })
    expect(result.details).not.toHaveProperty("filePath")
    expect(JSON.stringify(result)).not.toContain(join(isolatedStateDir, "artifacts"))
  })

  it("projects a Telegram camera artifact to the current channel without a second Tool call", async () => {
    invokeYeonjangMethod.mockResolvedValueOnce({
      device_id: "camera-1",
      mime_type: "image/jpeg",
      transfer_encoding: "base64",
      base64_data: "aGVsbG8=",
      message: "Camera capture completed.",
    })

    const result = await yeonjangCameraCaptureTool.execute({
      extensionId: "yeonjang-main",
      deviceId: "camera-1",
    }, createContext())

    expect(result).toMatchObject({
      success: true,
      details: {
        kind: "artifact_delivery",
        channel: "telegram",
        artifactRef: expect.stringMatching(/^artifact:/),
        mimeType: "image/jpeg",
        size: 321,
      },
    })
    expect(result.details).not.toHaveProperty("filePath")
  })

  it("passes one default capture budget and derives a longer transport timeout", async () => {
    invokeYeonjangMethod.mockResolvedValueOnce({
      device_id: "camera-1",
      mime_type: "image/jpeg",
      transfer_encoding: "base64",
      base64_data: "aGVsbG8=",
      message: "Camera capture completed.",
    })

    await yeonjangCameraCaptureTool.execute({
      extensionId: "yeonjang-main",
      deviceId: "camera-1",
    }, createContext())

    expect(invokeYeonjangMethod).toHaveBeenCalledWith(
      "camera.capture",
      expect.objectContaining({ capture_timeout_ms: 60_000 }),
      expect.objectContaining({ timeoutMs: 70_000 }),
    )
  })

  it("preserves the bounded camera timeout reason for LLM recovery diagnosis", async () => {
    invokeYeonjangMethod.mockRejectedValueOnce(Object.assign(
      new Error("Camera capture timed out before completion."),
      { code: "camera_capture_timeout" },
    ))

    const result = await yeonjangCameraCaptureTool.execute({
      extensionId: "yeonjang-main",
      deviceId: "camera-1",
    }, createContext())

    expect(result).toMatchObject({
      success: false,
      error: "CAMERA_CAPTURE_TIMEOUT",
      details: {
        failure: {
          reasonCode: "camera_capture_timeout",
          retrySameStrategy: false,
        },
      },
    })
  })

  it("keeps missing command response distinct from a helper capture timeout", async () => {
    invokeYeonjangMethod.mockRejectedValueOnce(Object.assign(
      new Error("Yeonjang command response timed out."),
      {
        code: "camera_response_timeout",
        attempt: {
          schemaVersion: 1,
          method: "camera.capture",
          commandId: "command-1",
          terminalStage: "response_timeout",
          reasonCode: "camera_response_timeout",
          retrySafety: "unknown_effect_state",
        },
      },
    ))

    const result = await yeonjangCameraCaptureTool.execute({
      extensionId: "yeonjang-main",
      deviceId: "camera-1",
    }, createContext())

    expect(result).toMatchObject({
      success: false,
      error: "CAMERA_RESPONSE_TIMEOUT",
      details: {
        failure: {
          reasonCode: "camera_response_timeout",
          retrySameStrategy: false,
          terminalStage: "response_timeout",
          retrySafety: "unknown_effect_state",
        },
      },
    })
  })

  it("preserves an exact pre-effect Yeonjang rejection instead of replacing it with user text", async () => {
    invokeYeonjangMethod.mockRejectedValueOnce(Object.assign(
      new Error("Side effect authorization is required."),
      {
        code: "side_effect_authorization_required",
        attempt: {
          schemaVersion: 1,
          method: "camera.capture",
          commandId: "command-1",
          operationId: "operation-1",
          terminalStage: "rejected",
          reasonCode: "side_effect_authorization_required",
          retrySafety: "change_strategy",
        },
      },
    ))

    const result = await yeonjangCameraCaptureTool.execute({
      extensionId: "yeonjang-main",
      deviceId: "camera-1",
    }, createContext())

    expect(result).toMatchObject({
      success: false,
      error: "side_effect_authorization_required",
      details: {
        failure: {
          reasonCode: "side_effect_authorization_required",
          terminalStage: "rejected",
          retrySafety: "change_strategy",
          retrySameStrategy: false,
        },
      },
    })
    expect(result.error).not.toContain("Side effect authorization")
  })

  it.each([
    [
      "camera_helper_timeout",
      "CAMERA_HELPER_TIMEOUT",
      "camera_helper_timeout",
    ],
    [
      "camera_handler_timeout",
      "CAMERA_HANDLER_TIMEOUT",
      "camera_handler_timeout",
    ],
    [
      "camera_busy",
      "CAMERA_BUSY",
      "camera_busy",
    ],
    [
      "camera_capture_cancelled",
      "CAMERA_CAPTURE_CANCELLED",
      "camera_capture_cancelled",
    ],
    [
      "camera_permission_denied",
      "CAMERA_PERMISSION_DENIED",
      "camera_permission_denied",
    ],
    [
      "camera_permission_restricted",
      "CAMERA_PERMISSION_RESTRICTED",
      "camera_permission_restricted",
    ],
    [
      "camera_permission_not_determined",
      "CAMERA_PERMISSION_NOT_DETERMINED",
      "camera_permission_not_determined",
    ],
  ] as const)(
    "preserves typed runtime failure %s without creating an artifact",
    async (code, errorCode, reasonCode) => {
      invokeYeonjangMethod.mockRejectedValueOnce(Object.assign(
        new Error("bounded camera runtime failure"),
        { code },
      ))

      const result = await yeonjangCameraCaptureTool.execute({
        extensionId: "yeonjang-main",
        deviceId: "camera-1",
      }, createContext())

      expect(result).toMatchObject({
        success: false,
        error: errorCode,
        details: {
          failure: {
            reasonCode,
            retrySameStrategy: false,
          },
        },
      })
      expect(writeFileSync).not.toHaveBeenCalled()
    },
  )

  it("rejects an acknowledgement when the saved image artifact is empty", async () => {
    statSync.mockReturnValueOnce({ size: 0 })
    invokeYeonjangMethod.mockResolvedValueOnce({
      device_id: "camera-1",
      mime_type: "image/jpeg",
      transfer_encoding: "base64",
      base64_data: "aGVsbG8=",
      message: "Camera capture completed.",
    })

    const result = await yeonjangCameraCaptureTool.execute({
      extensionId: "yeonjang-main",
      deviceId: "camera-1",
    }, createContext())

    expect(result).toMatchObject({
      success: false,
      error: "CAMERA_ARTIFACT_EMPTY",
      details: {
        via: "yeonjang",
        artifactVerification: {
          status: "failed",
          reasonCode: "camera_artifact_empty",
        },
      },
    })
    expect(result.details).not.toHaveProperty("kind", "artifact_delivery")
  })

  it.each([
    [
      {
        device_id: "camera-1",
        mime_type: "image/jpeg",
        transfer_encoding: "base64",
        message: "Camera capture completed.",
      },
      "CAMERA_ARTIFACT_BYTES_MISSING",
      "camera_artifact_bytes_missing",
    ],
    [
      {
        device_id: "camera-1",
        mime_type: "image/jpeg",
        transfer_encoding: "binary",
        base64_data: "aGVsbG8=",
        message: "Camera capture completed.",
      },
      "CAMERA_ARTIFACT_ENCODING_INVALID",
      "camera_artifact_encoding_invalid",
    ],
  ] as const)(
    "rejects invalid artifact input with %s",
    async (captureResult, errorCode, reasonCode) => {
      invokeYeonjangMethod.mockResolvedValueOnce(captureResult)

      const result = await yeonjangCameraCaptureTool.execute({
        extensionId: "yeonjang-main",
        deviceId: "camera-1",
      }, createContext())

      expect(result).toMatchObject({
        success: false,
        error: errorCode,
        details: {
          artifactVerification: {
            status: "failed",
            reasonCode,
          },
        },
      })
      expect(writeFileSync).not.toHaveBeenCalled()
    },
  )

  it("rejects capture bytes without a supported image MIME type", async () => {
    invokeYeonjangMethod.mockResolvedValueOnce({
      device_id: "camera-1",
      mime_type: "application/octet-stream",
      transfer_encoding: "base64",
      base64_data: "aGVsbG8=",
      message: "Camera capture completed.",
    })

    const result = await yeonjangCameraCaptureTool.execute({
      extensionId: "yeonjang-main",
      deviceId: "camera-1",
    }, createContext())

    expect(result).toMatchObject({
      success: false,
      error: "CAMERA_ARTIFACT_MIME_INVALID",
      details: {
        via: "yeonjang",
        artifactVerification: {
          status: "failed",
          reasonCode: "camera_artifact_mime_invalid",
        },
      },
    })
    expect(writeFileSync).not.toHaveBeenCalled()
  })

  it("uses typed facing selection and refuses an unknown device capability without reading the user message", async () => {
    invokeYeonjangMethod.mockResolvedValueOnce([
      {
        id: "camera-unknown-facing",
        name: "External Camera",
        available: true,
      },
    ])

    const result = await yeonjangCameraCaptureTool.execute({
      extensionId: "yeonjang-main",
      deviceId: "camera-unknown-facing",
      requestedFacing: "front",
      timeoutSec: 60,
    }, {
      ...createContext(),
      userMessage: "take one picture",
    })

    expect(invokeYeonjangMethod).toHaveBeenCalledTimes(1)
    expect(invokeYeonjangMethod).toHaveBeenCalledWith(
      "camera.list",
      {},
      expect.objectContaining({
        extensionId: "yeonjang-main",
        timeoutMs: 15_000,
        signal: expect.any(AbortSignal),
        metadata: {
          runId: "run-1",
          requestGroupId: "request-group-1",
          sessionId: "session-1",
          targetSessionId: "sess-local-main",
          source: "telegram",
        },
      }),
    )
    expect(result.success).toBe(false)
    expect(result.error).toBe("CAMERA_FACING_CAPABILITY_UNKNOWN")
    expect(result.output).toContain("전면 카메라 선택 지원 여부를 확인할 수 없습니다.")
    expect(writeFileSync).not.toHaveBeenCalled()
  })
})
