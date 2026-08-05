import { createHash } from "node:crypto"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ToolContext } from "../packages/core/src/tools/types.ts"

const mqttMocks = vi.hoisted(() => ({
  canYeonjangHandleMethod: vi.fn(),
  invokeYeonjangMethod: vi.fn(),
  isYeonjangUnavailableError: vi.fn(() => false),
}))
const brokerMocks = vi.hoisted(() => ({
  getMqttExtensionSnapshots: vi.fn(),
}))

let stateDir = ""

vi.mock("../packages/core/src/yeonjang/mqtt-client.js", () => ({
  ...mqttMocks,
  DEFAULT_YEONJANG_EXTENSION_ID: "yeonjang-main",
}))

vi.mock("../packages/core/src/mqtt/broker.js", () => ({
  ...brokerMocks,
}))

const db = await import("../packages/core/src/db/index.js")
const { createRootRun } = await import("../packages/core/src/runs/store.ts")
const { initializeTestDbRuntime } = await import("./fixtures/runtime-db.ts")
const { executeToolWithSideEffectLedger } = await import("../packages/core/src/tools/side-effect-runtime.ts")
const {
  appLaunchTool,
  keyboardActionTool,
  keyboardShortcutTool,
  keyboardTypeTool,
  mouseActionTool,
  mouseClickTool,
  mouseMoveTool,
} = await import("../packages/core/src/tools/index.ts")

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
  stateDir = mkdtempSync(join(tmpdir(), "knowbee-yeonjang-input-app-side-effect-"))
  initializeTestDbRuntime(stateDir)
  const now = Date.now()
  db.insertSession({
    id: "session-061",
    source: "telegram",
    source_id: null,
    created_at: now,
    updated_at: now,
    summary: null,
  })
  createRootRun({
    id: "run-061",
    sessionId: "session-061",
    prompt: "연장 컴퓨터를 조작해줘",
    source: "telegram",
  })
}

function setupSnapshot() {
  brokerMocks.getMqttExtensionSnapshots.mockReturnValue([
    {
      extensionId: "yeonjang-main",
      displayName: "작업용 맥",
      instanceId: "instance-local",
      instanceAlias: "local-mac",
      state: "online",
      message: "ready",
      platform: "macos",
      supportProfile: "desktop_interactive",
      methods: [
        "mouse.move",
        "mouse.click",
        "mouse.action",
        "keyboard.type",
        "keyboard.action",
        "application.launch",
      ],
      sessionId: "target-session-061",
      trustState: "trusted",
    },
  ])
}

function createContext(params: Record<string, unknown>, toolName: string, withApproval = true): ToolContext {
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
    sessionId: "session-061",
    runId: "run-061",
    requestGroupId: "run-061",
    workDir: process.cwd(),
    userMessage: "연장 컴퓨터를 조작해줘",
    source: "telegram",
    allowWebAccess: false,
    onProgress: vi.fn(),
    signal: new AbortController().signal,
    ...(withApproval
      ? {
          authorizationReceipt: {
            policyDecisionId: `policy-061-${toolName}`,
            toolName,
            paramsHash: hash(params),
            policyDecision: "allow",
            permissionScope: `yeonjang:${toolName}`,
            runId: "run-061",
            requestGroupId: "run-061",
            approvalDecision: "allow_run",
            approvalId: `approval-061-${toolName}`,
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

describe("Task 061 Yeonjang input and app side-effect ledger", () => {
  beforeEach(() => {
    setupDb()
    setupSnapshot()
    mqttMocks.canYeonjangHandleMethod.mockReset()
    mqttMocks.invokeYeonjangMethod.mockReset()
    mqttMocks.isYeonjangUnavailableError.mockReturnValue(false)
    mqttMocks.canYeonjangHandleMethod.mockResolvedValue(true)
  })

  afterEach(() => {
    db.closeDb()
    if (stateDir) rmSync(stateDir, { recursive: true, force: true })
    stateDir = ""
  })

  it("defines side-effect contracts for every Yeonjang input and app launch tool", () => {
    for (const tool of [
      mouseMoveTool,
      mouseClickTool,
      mouseActionTool,
      keyboardTypeTool,
      keyboardShortcutTool,
      keyboardActionTool,
      appLaunchTool,
    ]) {
      expect(tool.sideEffect).toMatchObject({
        effectClass: "external_write",
        compensationSupport: "irreversible",
      })
    }
  })

  it("executes mouse_move but does not mark it verified without target observation", async () => {
    const params = { extensionId: "yeonjang-main", x: 100, y: 200 }
    mqttMocks.invokeYeonjangMethod.mockResolvedValueOnce({
      moved: true,
      x: 100,
      y: 200,
      message: "moved",
    })

    const first = await executeToolWithSideEffectLedger({
      tool: mouseMoveTool,
      params,
      ctx: createContext(params, "mouse_move"),
    })

    expect(first).toMatchObject({
      success: false,
      error: "SIDE_EFFECT_MANUAL_INTERVENTION",
    })
    expect(mqttMocks.invokeYeonjangMethod).toHaveBeenCalledTimes(2)
    expect(operationRows()).toEqual([
      { state: "MANUAL_INTERVENTION", revision: 5, adapter_id: "tool:mouse_move" },
    ])
  })

  it("executes keyboard_type without storing raw typed text and requires target observation", async () => {
    const params = { extensionId: "yeonjang-main", text: "super secret typed text" }
    mqttMocks.invokeYeonjangMethod
      .mockResolvedValueOnce({
        typed: true,
        text_len: params.text.length,
        message: "typed",
      })
      .mockResolvedValueOnce({
        available: false,
        title_length: 0,
        message: "Focused target is not available.",
      })

    const result = await executeToolWithSideEffectLedger({
      tool: keyboardTypeTool,
      params,
      ctx: createContext(params, "keyboard_type"),
    })

    expect(result).toMatchObject({
      success: false,
      error: "SIDE_EFFECT_MANUAL_INTERVENTION",
    })
    expect(operationRows()).toEqual([
      { state: "MANUAL_INTERVENTION", revision: 5, adapter_id: "tool:keyboard_type" },
    ])
    expect(serializedReceiptRows()).not.toContain("super secret typed text")
  })

  it("executes app_launch without storing raw launch args in receipts", async () => {
    const params = {
      extensionId: "yeonjang-main",
      app: "Chrome",
      args: ["--profile-directory=Default", "--token=secret-value"],
      background: true,
    }
    mqttMocks.invokeYeonjangMethod
      .mockResolvedValueOnce({
        launched: true,
        application: "Chrome",
        pid: 1234,
        message: "launched",
      })
      .mockResolvedValueOnce({
        pid: 1234,
        name: "Chrome",
        command: "Chrome",
      })

    const result = await executeToolWithSideEffectLedger({
      tool: appLaunchTool,
      params,
      ctx: createContext(params, "app_launch"),
    })

    expect(result.success).toBe(true)
    expect(mqttMocks.invokeYeonjangMethod).toHaveBeenNthCalledWith(
      2,
      "process.info",
      { pid: 1234 },
      expect.objectContaining({ extensionId: "yeonjang-main" }),
    )
    expect(operationRows()).toEqual([
      { state: "VERIFIED", revision: 4, adapter_id: "tool:app_launch" },
    ])
    const receipts = serializedReceiptRows()
    expect(receipts).not.toContain("--profile-directory=Default")
    expect(receipts).not.toContain("--token=secret-value")
  })

  it("blocks app_launch before remote invoke when approval receipt is missing", async () => {
    const params = { extensionId: "yeonjang-main", app: "Chrome" }

    const result = await executeToolWithSideEffectLedger({
      tool: appLaunchTool,
      params,
      ctx: createContext(params, "app_launch", false),
    })

    expect(result).toMatchObject({
      success: false,
      error: "SIDE_EFFECT_OPERATION_BLOCKED",
      details: { reasonCode: "side_effect_authorization_required" },
    })
    expect(mqttMocks.invokeYeonjangMethod).not.toHaveBeenCalled()
  })
})
