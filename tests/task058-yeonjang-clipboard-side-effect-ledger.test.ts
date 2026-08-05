import { createHash } from "node:crypto"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ToolContext } from "../packages/core/src/tools/types.ts"

const invokeYeonjangMethod = vi.fn()
const getMqttExtensionSnapshots = vi.fn()
let stateDir = ""

vi.mock("../packages/core/src/yeonjang/mqtt-client.js", () => ({
  invokeYeonjangMethod,
  DEFAULT_YEONJANG_EXTENSION_ID: "yeonjang-main",
}))

vi.mock("../packages/core/src/mqtt/broker.js", () => ({
  getMqttExtensionSnapshots,
}))

const db = await import("../packages/core/src/db/index.js")
const { createRootRun } = await import("../packages/core/src/runs/store.ts")
const { initializeTestDbRuntime } = await import("./fixtures/runtime-db.ts")
const { executeToolWithSideEffectLedger } = await import("../packages/core/src/tools/side-effect-runtime.ts")
const { yeonjangClipboardWriteTool } = await import("../packages/core/src/tools/builtin/yeonjang.ts")

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

function contentHash(text: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`
}

function setupDb() {
  stateDir = mkdtempSync(join(tmpdir(), "knowbee-yeonjang-clipboard-side-effect-"))
  initializeTestDbRuntime(stateDir)
  const now = Date.now()
  db.insertSession({
    id: "session-058",
    source: "telegram",
    source_id: null,
    created_at: now,
    updated_at: now,
    summary: null,
  })
  createRootRun({
    id: "run-058",
    sessionId: "session-058",
    prompt: "연장 클립보드에 텍스트를 넣어줘",
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
      methods: ["clipboard.write"],
      sessionId: "target-session-058",
      trustState: "trusted",
    },
  ])
}

function createContext(params: Record<string, unknown>, withApproval = true): ToolContext {
  return {
    artifactStorage: {
      rootDir: join(stateDir, "artifacts"),
      fileSystem: {
        exists: () => false,
        realpath: (path) => path,
        remove: () => undefined,
        stat: () => ({ size: 0 }) as never,
      },
    },
    sessionId: "session-058",
    runId: "run-058",
    requestGroupId: "run-058",
    workDir: process.cwd(),
    userMessage: "연장 클립보드에 텍스트를 넣어줘",
    source: "telegram",
    allowWebAccess: false,
    onProgress: vi.fn(),
    signal: new AbortController().signal,
    ...(withApproval
      ? {
          authorizationReceipt: {
            policyDecisionId: "policy-058",
            toolName: "yeonjang_clipboard_write",
            paramsHash: hash(params),
            policyDecision: "allow",
            permissionScope: "yeonjang:clipboard.write",
            runId: "run-058",
            requestGroupId: "run-058",
            approvalDecision: "allow_run",
            approvalId: "approval-058",
          },
        }
      : {}),
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

describe("Task 058 Yeonjang clipboard side-effect ledger", () => {
  beforeEach(() => {
    setupDb()
    setupSnapshot()
    invokeYeonjangMethod.mockReset()
  })

  afterEach(() => {
    db.closeDb()
    if (stateDir) rmSync(stateDir, { recursive: true, force: true })
    stateDir = ""
  })

  it("executes clipboard.write through the side-effect ledger without storing raw text", async () => {
    const params = {
      extensionId: "yeonjang-main",
      text: "private clipboard secret",
    }
    invokeYeonjangMethod.mockResolvedValueOnce({
      charCount: 24,
      byteLength: 24,
      empty: false,
      contentHash: contentHash(params.text),
      postCheck: {
        verified: true,
        charCount: 24,
        byteLength: 24,
        empty: false,
        contentHash: contentHash(params.text),
      },
    })

    const first = await executeToolWithSideEffectLedger({
      tool: yeonjangClipboardWriteTool,
      params,
      ctx: createContext(params),
    })
    const replay = await executeToolWithSideEffectLedger({
      tool: yeonjangClipboardWriteTool,
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
      { state: "VERIFIED", revision: 4, adapter_id: "tool:yeonjang_clipboard_write" },
    ])
    expect(serializedReceiptRows()).not.toContain("private clipboard secret")
  })

  it("blocks clipboard.write before remote invoke when approval receipt is missing", async () => {
    const params = {
      extensionId: "yeonjang-main",
      text: "private clipboard secret",
    }

    const result = await executeToolWithSideEffectLedger({
      tool: yeonjangClipboardWriteTool,
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
