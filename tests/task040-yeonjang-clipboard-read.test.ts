import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { ToolContext } from "../packages/core/src/tools/types.ts"

const invokeYeonjangMethod = vi.fn()
const getMqttExtensionSnapshots = vi.fn()
const isolatedStateDir = join(tmpdir(), `knowbee-clipboard-read-test-${process.pid}`)

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
const { yeonjangClipboardReadTool } = await import("../packages/core/src/tools/builtin/yeonjang.ts")
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
    userMessage: "연장 클립보드 읽어줘",
    source: "telegram",
    allowWebAccess: false,
    onProgress: vi.fn(),
    signal: new AbortController().signal,
  }
}

describe("task040 Yeonjang clipboard read", () => {
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
        methods: ["clipboard.read"],
        sessionId: "target-session-1",
        trustState: "trusted",
        lastSeenAt: Date.now(),
        lastCapabilityRefreshAt: Date.now(),
      },
    ])
  })

  it("maps clipboard.read as a permission-gated safe Yeonjang tool", () => {
    expect(YEONJANG_TOOL_MAPPINGS.find((mapping) => mapping.toolName === "yeonjang_clipboard_read")).toMatchObject({
      toolName: "yeonjang_clipboard_read",
      methodIds: ["clipboard.read"],
      group: "clipboard",
      riskLevel: "safe",
      requiresApproval: false,
      permissionSetting: "allow_clipboard_read",
      targetKind: "yeonjang_remote",
      requiresTargetResolution: true,
      evidenceSourceKind: "yeonjang",
    })
    expect(YEONJANG_SKILL_TOOL_NAMES).toContain("yeonjang_clipboard_read")
    expect(yeonjangClipboardReadTool.runtimeMethodIds).toEqual(["clipboard.read"])
  })

  it("returns clipboard text in output but redacts it from details and evidence", async () => {
    invokeYeonjangMethod.mockResolvedValueOnce({
      text: "private clipboard secret",
      charCount: 24,
      byteLength: 24,
      empty: false,
      contentHash: "sha256:testhash",
    })

    const result = await yeonjangClipboardReadTool.execute({ extensionId: "yeonjang-main" }, createContext())

    expect(result.success).toBe(true)
    expect(result.output).toContain("private clipboard secret")
    expect(JSON.stringify(result.details)).not.toContain("private clipboard secret")
    const admission = admitYeonjangEvidenceForReview({ result, expectedToolName: "yeonjang_clipboard_read" })
    expect(admission).toMatchObject({
      status: "admitted",
      evidence: {
        rawPayloadVisibility: "audit_only",
        postCheck: { kind: "not_required" },
      },
    })
    expect(JSON.stringify(admission)).not.toContain("private clipboard secret")
  })
})
