import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { ToolContext, ToolResult } from "../packages/core/src/tools/types.ts"

const invokeYeonjangMethod = vi.fn()
const getMqttExtensionSnapshots = vi.fn()
const mkdirSync = vi.fn()
const statSync = vi.fn(() => ({ size: 321 }))
const writeFileSync = vi.fn()
const isolatedStateDir = join(tmpdir(), `knowbee-side-effect-evidence-test-${process.pid}`)

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
const { admitYeonjangEvidenceForReview } = await import("../packages/core/src/yeonjang/evidence-admission.ts")
const {
  yeonjangCameraCaptureTool,
  yeonjangFileDeleteTool,
  yeonjangFilePatchTool,
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
        realpath: (path) => path,
        remove: (path) => realFs.rmSync(path, { force: true }),
        stat: realFs.statSync,
      },
    },
    sessionId: "session-1",
    runId: "run-1",
    requestGroupId: "request-group-1",
    workDir: process.cwd(),
    userMessage: "연장으로 실행해줘",
    source: "telegram",
    allowWebAccess: false,
    onProgress: vi.fn(),
    signal: new AbortController().signal,
  }
}

function expectAdmitted(result: ToolResult, expectedToolName: string) {
  const admission = admitYeonjangEvidenceForReview({ result, expectedToolName })
  expect(admission).toMatchObject({
    status: "admitted",
    evidence: {
      toolName: expectedToolName,
      targetRef: "yeonjang-main",
      postCheck: {
        kind: "verified",
        verified: true,
      },
    },
  })
}

describe("task018 Yeonjang side-effect evidence coverage", () => {
  beforeEach(() => {
    invokeYeonjangMethod.mockReset()
    mkdirSync.mockClear()
    statSync.mockClear()
    writeFileSync.mockClear()
    statSync.mockReturnValue({ size: 321 })
    getMqttExtensionSnapshots.mockReturnValue([
      {
        extensionId: "yeonjang-main",
        displayName: "작업용 맥",
        instanceId: "instance-local",
        instanceAlias: "local-mac",
        state: "online",
        message: "ready",
        platform: "macos",
        methods: ["file.patch", "file.delete", "camera.capture"],
        sessionId: "target-session-1",
        trustState: "trusted",
      },
    ])
  })

  it("admits verified file patch evidence without leaking patch text", async () => {
    invokeYeonjangMethod.mockResolvedValueOnce({
      path: "/tmp/note.txt",
      changed: true,
      reason: "patched",
      matchCount: 1,
      bytesBefore: 10,
      bytesAfter: 11,
      postCheck: {
        verified: true,
        exists: true,
        bytes: 11,
      },
    })

    const result = await yeonjangFilePatchTool.execute({
      extensionId: "yeonjang-main",
      path: "/tmp/note.txt",
      expectedText: "secret-before",
      replacementText: "secret-after",
    }, createContext())

    expect(result.success).toBe(true)
    expectAdmitted(result, "yeonjang_file_patch")
    expect(JSON.stringify(result.details)).not.toContain("secret-before")
    expect(JSON.stringify(result.details)).not.toContain("secret-after")
  })

  it("blocks failed file patch evidence at admission", async () => {
    invokeYeonjangMethod.mockResolvedValueOnce({
      path: "/tmp/note.txt",
      changed: false,
      reason: "expected_text_not_found",
      matchCount: 0,
      bytesBefore: 10,
      bytesAfter: 10,
      postCheck: {
        verified: false,
        exists: true,
        bytes: 10,
      },
    })

    const result = await yeonjangFilePatchTool.execute({
      extensionId: "yeonjang-main",
      path: "/tmp/note.txt",
      expectedText: "missing",
      replacementText: "replacement",
    }, createContext())

    expect(result.success).toBe(false)
    expect(admitYeonjangEvidenceForReview({
      result,
      expectedToolName: "yeonjang_file_patch",
    })).toMatchObject({
      status: "blocked",
      reasonCode: "YEONJANG_POST_CHECK_UNVERIFIED",
    })
  })

  it("admits verified file delete evidence", async () => {
    invokeYeonjangMethod.mockResolvedValueOnce({
      path: "/tmp/delete-me.txt",
      deleted: true,
      kind: "file",
      postCheck: {
        verified: true,
        exists: false,
      },
    })

    const result = await yeonjangFileDeleteTool.execute({
      extensionId: "yeonjang-main",
      path: "/tmp/delete-me.txt",
    }, createContext())

    expect(result.success).toBe(true)
    expectAdmitted(result, "yeonjang_file_delete")
  })

  it("admits camera capture evidence based on local artifact verification without base64 leakage", async () => {
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

    const result = await yeonjangCameraCaptureTool.execute({
      extensionId: "yeonjang-main",
      deviceId: "camera-1",
      inlineBase64: false,
      timeoutSec: 60,
    }, createContext())

    expect(result.success).toBe(true)
    expectAdmitted(result, "yeonjang_camera_capture")
    expect(JSON.stringify(result.details)).not.toContain("aGVsbG8=")
    expect(JSON.stringify(result.details)).not.toContain("base64_data")
    expect(writeFileSync).toHaveBeenCalledTimes(1)
  })
})
