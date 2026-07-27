import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { ToolContext } from "../packages/core/src/tools/types.ts"

const invokeYeonjangMethod = vi.fn()
const getMqttExtensionSnapshots = vi.fn()
const isolatedStateDir = join(tmpdir(), `knowbee-clipboard-write-test-${process.pid}`)

vi.mock("../packages/core/src/yeonjang/mqtt-client.js", () => ({
  invokeYeonjangMethod,
  DEFAULT_YEONJANG_EXTENSION_ID: "yeonjang-main",
}))

vi.mock("../packages/core/src/mqtt/broker.js", () => ({
  getMqttExtensionSnapshots,
}))

const realFs = await vi.importActual<typeof import("node:fs")>("node:fs")
realFs.mkdirSync(isolatedStateDir, { recursive: true })
const { closeDb } = await import("../packages/core/src/db/index.js")
const { initializeTestDbRuntime } = await import("./fixtures/runtime-db.ts")
initializeTestDbRuntime(isolatedStateDir)
const { admitYeonjangEvidenceForReview } = await import("../packages/core/src/yeonjang/evidence-admission.ts")
const { YEONJANG_SKILL_TOOL_NAMES } = await import("../packages/core/src/skills/builtin.ts")
const { yeonjangClipboardWriteTool } = await import("../packages/core/src/tools/builtin/yeonjang.ts")
const { YEONJANG_TOOL_MAPPINGS } = await import("../packages/core/src/yeonjang/tool-mapping.ts")

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
    userMessage: "연장 클립보드에 텍스트를 넣어줘",
    source: "telegram",
    allowWebAccess: false,
    onProgress: vi.fn(),
    signal: new AbortController().signal,
  }
}

describe("task041 Yeonjang clipboard write", () => {
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
        methods: ["clipboard.write"],
        sessionId: "target-session-1",
        trustState: "trusted",
        lastSeenAt: Date.now(),
        lastCapabilityRefreshAt: Date.now(),
      },
    ])
  })

  it("maps clipboard.write as a permission-gated approval-required Yeonjang tool", () => {
    expect(YEONJANG_TOOL_MAPPINGS.find((mapping) => mapping.toolName === "yeonjang_clipboard_write")).toMatchObject({
      toolName: "yeonjang_clipboard_write",
      methodIds: ["clipboard.write"],
      group: "clipboard",
      riskLevel: "moderate",
      requiresApproval: true,
      permissionSetting: "allow_clipboard_write",
      targetKind: "yeonjang_remote",
      requiresTargetResolution: true,
      evidenceSourceKind: "yeonjang",
    })
    expect(YEONJANG_SKILL_TOOL_NAMES).toContain("yeonjang_clipboard_write")
    expect(yeonjangClipboardWriteTool.runtimeMethodIds).toEqual(["clipboard.write"])
    expect(yeonjangClipboardWriteTool.requiresApproval).toBe(true)
  })

  it("verifies post-check while redacting written text from output, details, and evidence", async () => {
    invokeYeonjangMethod.mockResolvedValueOnce({
      charCount: 24,
      byteLength: 24,
      empty: false,
      contentHash: "sha256:testhash",
      postCheck: {
        verified: true,
        charCount: 24,
        byteLength: 24,
        empty: false,
        contentHash: "sha256:testhash",
      },
    })

    const result = await yeonjangClipboardWriteTool.execute({
      extensionId: "yeonjang-main",
      text: "private clipboard secret",
    }, createContext())

    expect(invokeYeonjangMethod).toHaveBeenCalledWith("clipboard.write", {
      text: "private clipboard secret",
    }, expect.objectContaining({ extensionId: "yeonjang-main" }))
    expect(result.success).toBe(true)
    expect(result.output).not.toContain("private clipboard secret")
    expect(JSON.stringify(result.details)).not.toContain("private clipboard secret")
    const admission = admitYeonjangEvidenceForReview({ result, expectedToolName: "yeonjang_clipboard_write" })
    expect(admission).toMatchObject({
      status: "admitted",
      evidence: {
        rawPayloadVisibility: "audit_only",
        postCheck: { kind: "verified", verified: true, bytes: 24 },
      },
    })
    expect(JSON.stringify(admission)).not.toContain("private clipboard secret")
  })

  it("fails the tool result when the Yeonjang post-check is not verified", async () => {
    invokeYeonjangMethod.mockResolvedValueOnce({
      charCount: 24,
      byteLength: 24,
      empty: false,
      contentHash: "sha256:expected",
      postCheck: {
        verified: false,
        charCount: 3,
        byteLength: 3,
        empty: false,
        contentHash: "sha256:actual",
        reason: "clipboard content mismatch after write",
      },
    })

    const result = await yeonjangClipboardWriteTool.execute({
      extensionId: "yeonjang-main",
      text: "private clipboard secret",
    }, createContext())

    expect(result.success).toBe(false)
    expect(result.error).toBe("post_check_failed")
    expect(result.output).not.toContain("private clipboard secret")
    expect(JSON.stringify(result.details)).not.toContain("private clipboard secret")
    expect(admitYeonjangEvidenceForReview({ result, expectedToolName: "yeonjang_clipboard_write" })).toMatchObject({
      status: "blocked",
      reasonCode: "YEONJANG_POST_CHECK_UNVERIFIED",
    })
  })
})
