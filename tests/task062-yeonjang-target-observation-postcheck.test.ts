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
const { appLaunchTool, keyboardTypeTool, mouseMoveTool } = await import("../packages/core/src/tools/index.ts")

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
  stateDir = mkdtempSync(join(tmpdir(), "knowbee-yeonjang-target-observation-"))
  initializeTestDbRuntime(stateDir)
  const now = Date.now()
  db.insertSession({
    id: "session-062",
    source: "telegram",
    source_id: null,
    created_at: now,
    updated_at: now,
    summary: null,
  })
  createRootRun({
    id: "run-062",
    sessionId: "session-062",
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
      methods: ["mouse.move", "mouse.position", "keyboard.type", "input.focused_target", "application.launch", "process.info"],
      sessionId: "target-session-062",
      trustState: "trusted",
    },
  ])
}

function createContext(params: Record<string, unknown>, toolName: string): ToolContext {
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
    sessionId: "session-062",
    runId: "run-062",
    requestGroupId: "run-062",
    workDir: process.cwd(),
    userMessage: "연장 컴퓨터를 조작해줘",
    source: "telegram",
    allowWebAccess: false,
    onProgress: vi.fn(),
    signal: new AbortController().signal,
    authorizationReceipt: {
      policyDecisionId: `policy-062-${toolName}`,
      toolName,
      paramsHash: hash(params),
      policyDecision: "allow",
      permissionScope: `yeonjang:${toolName}`,
      runId: "run-062",
      requestGroupId: "run-062",
      approvalDecision: "allow_run",
      approvalId: `approval-062-${toolName}`,
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

describe("Task 062 Yeonjang target observation post-check", () => {
  beforeEach(() => {
    setupDb()
    setupSnapshot()
    mqttMocks.canYeonjangHandleMethod.mockResolvedValue(true)
    mqttMocks.invokeYeonjangMethod.mockReset()
    mqttMocks.isYeonjangUnavailableError.mockReturnValue(false)
  })

  afterEach(() => {
    db.closeDb()
    if (stateDir) rmSync(stateDir, { recursive: true, force: true })
    stateDir = ""
  })

  it("keeps mouse_move in manual intervention when cursor observation does not match", async () => {
    const params = { extensionId: "yeonjang-main", x: 10, y: 20 }
    mqttMocks.invokeYeonjangMethod
      .mockResolvedValueOnce({ moved: true, x: 10, y: 20, message: "moved" })
      .mockResolvedValueOnce({ x: 11, y: 20, message: "Mouse position observed." })

    const result = await executeToolWithSideEffectLedger({
      tool: mouseMoveTool,
      params,
      ctx: createContext(params, "mouse_move"),
    })

    expect(result).toMatchObject({
      success: false,
      error: "SIDE_EFFECT_MANUAL_INTERVENTION",
    })
    expect(operationRows()).toEqual([
      { state: "MANUAL_INTERVENTION", revision: 5, adapter_id: "tool:mouse_move" },
    ])
  })

  it("verifies mouse_move when mouse.position confirms the requested coordinates", async () => {
    const params = { extensionId: "yeonjang-main", x: 10, y: 20 }
    mqttMocks.invokeYeonjangMethod
      .mockResolvedValueOnce({ moved: true, x: 10, y: 20, message: "moved" })
      .mockResolvedValueOnce({ x: 10, y: 20, message: "Mouse position observed." })

    const result = await executeToolWithSideEffectLedger({
      tool: mouseMoveTool,
      params,
      ctx: createContext(params, "mouse_move"),
    })

    expect(result.success).toBe(true)
    expect(mqttMocks.invokeYeonjangMethod).toHaveBeenNthCalledWith(
      2,
      "mouse.position",
      {},
      expect.objectContaining({ extensionId: "yeonjang-main" }),
    )
    expect(operationRows()).toEqual([
      { state: "VERIFIED", revision: 4, adapter_id: "tool:mouse_move" },
    ])
  })

  it("keeps keyboard_type in manual intervention when no focused target observation exists", async () => {
    const params = { extensionId: "yeonjang-main", text: "secret typed content" }
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
  })

  it("verifies keyboard_type when focused target observation is available", async () => {
    const params = { extensionId: "yeonjang-main", text: "secret typed content" }
    mqttMocks.invokeYeonjangMethod
      .mockResolvedValueOnce({
        typed: true,
        text_len: params.text.length,
        message: "typed",
      })
      .mockResolvedValueOnce({
        available: true,
        app_name: "Notes",
        process_id: 1234,
        title_hash: "sha256:abc",
        title_length: 12,
        message: "Focused target observed.",
      })

    const result = await executeToolWithSideEffectLedger({
      tool: keyboardTypeTool,
      params,
      ctx: createContext(params, "keyboard_type"),
    })

    expect(result.success).toBe(true)
    expect(mqttMocks.invokeYeonjangMethod).toHaveBeenNthCalledWith(
      2,
      "input.focused_target",
      {},
      expect.objectContaining({ extensionId: "yeonjang-main" }),
    )
    expect(operationRows()).toEqual([
      { state: "VERIFIED", revision: 4, adapter_id: "tool:keyboard_type" },
    ])
  })

  it("verifies app_launch only when process.info confirms the launched pid", async () => {
    const params = { extensionId: "yeonjang-main", app: "Chrome" }
    mqttMocks.invokeYeonjangMethod
      .mockResolvedValueOnce({ launched: true, application: "Chrome", pid: 1234, message: "launched" })
      .mockResolvedValueOnce({ pid: 1234, name: "Chrome", command: "Chrome" })

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
  })

  it("does not verify app_launch when process.info cannot confirm the launched pid", async () => {
    const params = { extensionId: "yeonjang-main", app: "Chrome" }
    mqttMocks.invokeYeonjangMethod
      .mockResolvedValueOnce({ launched: true, application: "Chrome", pid: 1234, message: "launched" })
      .mockResolvedValueOnce({ pid: 9999, name: "Other", command: "Other" })

    const result = await executeToolWithSideEffectLedger({
      tool: appLaunchTool,
      params,
      ctx: createContext(params, "app_launch"),
    })

    expect(result).toMatchObject({
      success: false,
      error: "SIDE_EFFECT_MANUAL_INTERVENTION",
    })
    expect(operationRows()).toEqual([
      { state: "MANUAL_INTERVENTION", revision: 5, adapter_id: "tool:app_launch" },
    ])
  })
})
