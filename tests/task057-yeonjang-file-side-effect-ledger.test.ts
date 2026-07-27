import { createHash } from "node:crypto"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ToolContext, ToolResult } from "../packages/core/src/tools/types.ts"

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

const realDb = await import("../packages/core/src/db/index.js")
const { createRootRun } = await import("../packages/core/src/runs/store.ts")
const { initializeTestDbRuntime } = await import("./fixtures/runtime-db.ts")
const { executeToolWithSideEffectLedger } = await import("../packages/core/src/tools/side-effect-runtime.ts")
const {
  yeonjangFileDeleteTool,
  yeonjangFilePatchTool,
  yeonjangFileWriteTool,
} = await import("../packages/core/src/tools/builtin/yeonjang.ts")

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
    sessionId: "session-057",
    runId: "run-057",
    requestGroupId: "run-057",
    workDir: process.cwd(),
    userMessage: "연장 파일을 수정해줘",
    source: "telegram",
    allowWebAccess: false,
    onProgress: vi.fn(),
    signal: new AbortController().signal,
    ...(withApproval
      ? {
          authorizationReceipt: {
            policyDecisionId: "policy-057",
            toolName: "yeonjang_file_write",
            paramsHash: hash(params),
            policyDecision: "allow",
            permissionScope: "yeonjang:file.write",
            runId: "run-057",
            requestGroupId: "run-057",
            approvalDecision: "allow_run",
            approvalId: "approval-057",
          },
        }
      : {}),
  }
}

function setupDb() {
  stateDir = mkdtempSync(join(tmpdir(), "knowbee-yeonjang-side-effect-"))
  initializeTestDbRuntime(stateDir)
  const now = Date.now()
  realDb.insertSession({
    id: "session-057",
    source: "telegram",
    source_id: null,
    created_at: now,
    updated_at: now,
    summary: null,
  })
  createRootRun({
    id: "run-057",
    sessionId: "session-057",
    prompt: "연장 파일을 수정해줘",
    source: "telegram",
  })
}

function setupSnapshot(methods = ["file.write", "file.patch", "file.delete"]) {
  getMqttExtensionSnapshots.mockReturnValue([
    {
      extensionId: "yeonjang-main",
      displayName: "작업용 맥",
      instanceId: "instance-local",
      instanceAlias: "local-mac",
      state: "online",
      message: "ready",
      platform: "macos",
      methods,
      sessionId: "target-session-1",
      trustState: "trusted",
    },
  ])
}

function operationRows(): Array<{ state: string; revision: number; adapter_id: string }> {
  return realDb
    .getDb()
    .prepare<[], { state: string; revision: number; adapter_id: string }>(
      "SELECT state, revision, adapter_id FROM side_effect_operations ORDER BY created_at",
    )
    .all()
}

function receiptCount(): number {
  return realDb
    .getDb()
    .prepare<[], { count: number }>("SELECT count(*) AS count FROM side_effect_operation_receipts")
    .get()!.count
}

describe("Task 057 Yeonjang file side-effect ledger", () => {
  beforeEach(() => {
    setupDb()
    setupSnapshot()
    invokeYeonjangMethod.mockReset()
  })

  afterEach(() => {
    realDb.closeDb()
    if (stateDir) rmSync(stateDir, { recursive: true, force: true })
    stateDir = ""
  })

  it("executes yeonjang_file_write through side-effect ledger and suppresses duplicate replay", async () => {
    const params = {
      extensionId: "yeonjang-main",
      path: "/remote/note.txt",
      text: "hello ledger",
      overwrite: true,
    }
    invokeYeonjangMethod.mockResolvedValueOnce({
      path: "/remote/note.txt",
      bytesWritten: 12,
      overwrite: true,
      postCheck: { verified: true, exists: true, bytes: 12 },
    })

    const first = await executeToolWithSideEffectLedger({
      tool: yeonjangFileWriteTool,
      params,
      ctx: createContext(params),
    })
    const replay = await executeToolWithSideEffectLedger({
      tool: yeonjangFileWriteTool,
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
      { state: "VERIFIED", revision: 4, adapter_id: "tool:yeonjang_file_write" },
    ])
    expect(receiptCount()).toBe(4)
  })

  it("blocks yeonjang_file_write before remote invoke when approval receipt is missing", async () => {
    const params = {
      extensionId: "yeonjang-main",
      path: "/remote/note.txt",
      text: "missing approval",
      overwrite: true,
    }

    const result = await executeToolWithSideEffectLedger({
      tool: yeonjangFileWriteTool,
      params,
      ctx: createContext(params, false),
    })

    expect(result).toMatchObject({
      success: false,
      error: "SIDE_EFFECT_OPERATION_BLOCKED",
      details: { reasonCode: "side_effect_authorization_required" },
    })
    expect(invokeYeonjangMethod).not.toHaveBeenCalled()
    expect(operationRows()).toEqual([])
  })

  it("adds sideEffect contracts to patch and delete with redacted expected state", async () => {
    expect(yeonjangFilePatchTool.sideEffect).toBeDefined()
    expect(yeonjangFileDeleteTool.sideEffect).toBeDefined()

    const patchObservation = await yeonjangFilePatchTool.sideEffect!.observe(
      {
        extensionId: "yeonjang-main",
        path: "/remote/note.txt",
        expectedText: "secret-before",
        replacementText: "secret-after",
      },
      createContext({}),
      {
        success: true,
        output: "patched",
        details: {
          extensionId: "yeonjang-main",
          file: { postCheck: { verified: true, exists: true, bytes: 11 } },
        },
      } satisfies ToolResult,
    )

    expect(patchObservation).toMatchObject({
      available: true,
      targetRef: "yeonjang:yeonjang-main:file:/remote/note.txt",
      observedState: {
        exists: true,
        expectedTextHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        replacementTextHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        replacementBytes: 12,
      },
    })
    expect(JSON.stringify(patchObservation)).not.toContain("secret-before")
    expect(JSON.stringify(patchObservation)).not.toContain("secret-after")
    expect(yeonjangFileDeleteTool.sideEffect?.expectedState({
      extensionId: "yeonjang-main",
      path: "/remote/delete.txt",
    }, createContext({}))).toEqual({ exists: false })
  })
})
