import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { closeDb } from "../packages/core/src/db/index.js"
import type { ToolContext } from "../packages/core/src/tools/types.ts"
import { upsertYeonjangRegistryObservation } from "../packages/core/src/yeonjang/registry.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const canYeonjangHandleMethod = vi.fn()
const invokeYeonjangMethod = vi.fn()
const isYeonjangUnavailableError = vi.fn(() => false)

vi.mock("../packages/core/src/yeonjang/mqtt-client.js", () => ({
  canYeonjangHandleMethod,
  invokeYeonjangMethod,
  isYeonjangUnavailableError,
  DEFAULT_YEONJANG_EXTENSION_ID: "yeonjang-main",
}))

const { keyboardShortcutTool } = await import("../packages/core/src/tools/builtin/ui/keyboard.ts")

const tempDirs: string[] = []

function useTempState(): void {
  closeDb()
  const stateDir = mkdtempSync(join(tmpdir(), "knowbee-keyboard-shortcut-tool-"))
  tempDirs.push(stateDir)
  initializeTestDbRuntime(stateDir)
}

function seedObservation(): void {
  const result = upsertYeonjangRegistryObservation({
    instanceId: "inst-local-main",
    instanceAlias: "local-mac",
    displayName: "Local Mac Console",
    nodeId: "yeonjang-main",
    supportProfile: "desktop_interactive",
    platform: "macos",
    arch: "arm64",
    hostFingerprint: "gateway-host",
    installFingerprint: "gateway-install",
    sessionId: "sess-local-main",
    clientId: "client-local-main",
    connectionState: "online",
    message: "ready",
    version: "0.1.0",
    protocolVersion: "2026-04-16.capability-matrix.v1",
    capabilityHash: "cap-local-main",
    transport: ["mqtt-json"],
    permissions: { allow_keyboard_input: true },
    toolHealth: { "keyboard.action": { status: "ready" } },
    capabilityMatrix: {
      "keyboard.action": {
        supported: true,
        requiresPermission: true,
        permissionSetting: "allow_keyboard_input",
      },
    },
    methodCount: 1,
    startupMode: "manual",
    windowMode: "visible",
    trayState: "visible",
    observedAt: Date.now(),
  })
  expect(result.ok).toBe(true)
}

function createContext(): ToolContext {
  return {
    sessionId: "session-1",
    runId: "run-1",
    requestGroupId: "request-group-1",
    workDir: process.cwd(),
    userMessage: "단축키 실행해줘",
    source: "telegram",
    allowWebAccess: false,
    onProgress: vi.fn(),
    signal: new AbortController().signal,
  }
}

describe("keyboard shortcut tool", () => {
  beforeEach(() => {
    useTempState()
    seedObservation()
    canYeonjangHandleMethod.mockReset()
    invokeYeonjangMethod.mockReset()
    isYeonjangUnavailableError.mockReset()
    isYeonjangUnavailableError.mockReturnValue(false)
  })

  afterEach(() => {
    closeDb()
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()
      if (dir) rmSync(dir, { recursive: true, force: true })
    }
  })

  it("uses Yeonjang keyboard.action for shortcut requests", async () => {
    canYeonjangHandleMethod.mockResolvedValue(true)
    invokeYeonjangMethod.mockResolvedValue({
      accepted: true,
      action: "shortcut",
      key: "Space",
      modifiers: ["meta"],
      message: "Keyboard shortcut completed.",
    })

    const result = await keyboardShortcutTool.execute(
      { keys: ["Command", "Space"] },
      createContext(),
    )

    expect(canYeonjangHandleMethod).toHaveBeenCalledWith("keyboard.action", {
      extensionId: "yeonjang-main",
      signal: expect.any(AbortSignal),
      metadata: {
        runId: "run-1",
        requestGroupId: "request-group-1",
        sessionId: "session-1",
        source: "telegram",
        targetSessionId: "sess-local-main",
      },
    })
    expect(invokeYeonjangMethod).toHaveBeenCalledWith(
      "keyboard.action",
      {
        action: "shortcut",
        key: "Space",
        modifiers: ["meta"],
      },
      {
        extensionId: "yeonjang-main",
        signal: expect.any(AbortSignal),
        timeoutMs: 15_000,
        metadata: {
          runId: "run-1",
          requestGroupId: "request-group-1",
          sessionId: "session-1",
          source: "telegram",
          targetSessionId: "sess-local-main",
        },
      },
    )
    expect(result.success).toBe(true)
    expect(result.details).toMatchObject({
      via: "yeonjang",
      action: "shortcut",
      key: "Space",
      modifiers: ["meta"],
    })
  })

  it("rejects shortcuts that contain more than one non-modifier key", async () => {
    canYeonjangHandleMethod.mockReset()
    invokeYeonjangMethod.mockReset()

    await expect(keyboardShortcutTool.execute(
      { keys: ["Command", "K", "C"] },
      createContext(),
    )).rejects.toThrow("여러 일반 키를 동시에 누르는 단축키는 지원하지 않습니다")
  })
})
