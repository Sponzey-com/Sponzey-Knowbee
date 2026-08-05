import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { ToolContext } from "../packages/core/src/tools/types.ts"

const invokeYeonjangMethod = vi.fn()
const getMqttExtensionSnapshots = vi.fn()
const isolatedStateDir = join(tmpdir(), `knowbee-evidence-test-${process.pid}`)

vi.mock("../packages/core/src/yeonjang/mqtt-client.js", () => ({
  invokeYeonjangMethod,
  DEFAULT_YEONJANG_EXTENSION_ID: "yeonjang-main",
}))

vi.mock("../packages/core/src/mqtt/broker.js", () => ({
  getMqttExtensionSnapshots,
}))

const {
  buildYeonjangEvidenceEnvelope,
} = await import("../packages/core/src/yeonjang/evidence.ts")
const realFs = await vi.importActual<typeof import("node:fs")>("node:fs")
realFs.mkdirSync(isolatedStateDir, { recursive: true })
const { closeDb } = await import("../packages/core/src/db/index.js")
const { initializeTestDbRuntime } = await import("./fixtures/runtime-db.ts")
initializeTestDbRuntime(isolatedStateDir)
const {
  yeonjangCameraPermissionStatusTool,
  yeonjangFileMetadataTool,
  yeonjangFileWriteTool,
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
        exists: () => false,
        realpath: (path) => path,
        remove: () => undefined,
        stat: () => ({ size: 0 }) as never,
      },
    },
    sessionId: "session-1",
    runId: "run-1",
    requestGroupId: "request-group-1",
    workDir: process.cwd(),
    userMessage: "연장으로 확인해줘",
    source: "telegram",
    allowWebAccess: false,
    onProgress: vi.fn(),
    signal: new AbortController().signal,
  }
}

describe("task015 Yeonjang evidence envelope", () => {
  beforeEach(() => {
    invokeYeonjangMethod.mockReset()
    getMqttExtensionSnapshots.mockReturnValue([
      {
        extensionId: "yeonjang-main",
        displayName: "작업용 맥",
        instanceId: "instance-local",
        instanceAlias: "local-mac",
        state: "online",
        message: "ready",
        platform: "macos",
        methods: ["file.metadata", "file.write", "camera.permission_status"],
        sessionId: "target-session-1",
        trustState: "trusted",
      },
    ])
  })

  it("rejects missing target references when building evidence", () => {
    expect(() => buildYeonjangEvidenceEnvelope({
      targetRef: "",
      toolName: "yeonjang_file_metadata",
      methodIds: ["file.metadata"],
      group: "files",
      riskLevel: "safe",
      requiresApproval: false,
      summary: "file metadata checked",
      postCheck: { kind: "not_required" },
      collectedAt: 123,
    })).toThrow("YEONJANG_EVIDENCE_TARGET_REF_MISSING")
  })

  it("adds not-required post-check evidence to read-only file metadata results", async () => {
    invokeYeonjangMethod.mockResolvedValueOnce({
      path: "/tmp/note.txt",
      kind: "file",
      bytes: 12,
      readonly: false,
      modifiedAt: 123,
    })

    const result = await yeonjangFileMetadataTool.execute({
      extensionId: "yeonjang-main",
      path: "/tmp/note.txt",
    }, createContext())

    expect(result.success).toBe(true)
    expect(result.details).toMatchObject({
      evidence: {
        schemaVersion: "yeonjang-evidence-v1",
        targetRef: "yeonjang-main",
        toolName: "yeonjang_file_metadata",
        methodIds: ["file.metadata"],
        riskLevel: "safe",
        requiresApproval: false,
        postCheck: { kind: "not_required" },
      },
    })
  })

  it("adds not-required post-check evidence to read-only camera permission results", async () => {
    invokeYeonjangMethod.mockResolvedValueOnce({
      status: "unknown",
      reason: "os_permission_status_unavailable",
      platform: "macos",
      canAttemptCapture: true,
      requiresUserAction: false,
    })

    const result = await yeonjangCameraPermissionStatusTool.execute({
      extensionId: "yeonjang-main",
    }, createContext())

    expect(result.success).toBe(true)
    expect(result.details).toMatchObject({
      evidence: {
        schemaVersion: "yeonjang-evidence-v1",
        targetRef: "yeonjang-main",
        toolName: "yeonjang_camera_permission_status",
        methodIds: ["camera.permission_status"],
        postCheck: { kind: "not_required" },
      },
    })
  })

  it("adds actual post-check evidence to side-effect file write results without raw text", async () => {
    invokeYeonjangMethod.mockResolvedValueOnce({
      path: "/tmp/note.txt",
      bytesWritten: 11,
      overwrite: true,
      postCheck: {
        verified: true,
        exists: true,
        bytes: 11,
      },
    })

    const result = await yeonjangFileWriteTool.execute({
      extensionId: "yeonjang-main",
      path: "/tmp/note.txt",
      text: "hello world",
      overwrite: true,
    }, createContext())

    expect(result.success).toBe(true)
    expect(result.details).toMatchObject({
      evidence: {
        schemaVersion: "yeonjang-evidence-v1",
        targetRef: "yeonjang-main",
        toolName: "yeonjang_file_write",
        methodIds: ["file.write"],
        riskLevel: "moderate",
        requiresApproval: true,
        postCheck: {
          kind: "verified",
          verified: true,
        },
      },
    })
    expect(JSON.stringify(result.details)).not.toContain("hello world")
    expect(JSON.stringify(result.details)).not.toContain("base64_data")
  })
})
