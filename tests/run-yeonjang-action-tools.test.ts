import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { reloadConfig } from "../packages/core/src/config/index.js"
import { closeDb } from "../packages/core/src/db/index.js"
import type { ToolContext } from "../packages/core/src/tools/types.ts"
import { upsertYeonjangRegistryObservation } from "../packages/core/src/yeonjang/registry.ts"

const canYeonjangHandleMethod = vi.fn()
const invokeYeonjangMethod = vi.fn()
const isYeonjangUnavailableError = vi.fn(() => false)
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

const { shellExecTool } = await import("../packages/core/src/tools/builtin/shell.ts")
const { mouseActionTool } = await import("../packages/core/src/tools/builtin/ui/mouse.ts")
const { keyboardActionTool } = await import("../packages/core/src/tools/builtin/ui/keyboard.ts")

const previousStateDir = process.env["KNOWBEE_STATE_DIR"]
const previousConfig = process.env["KNOWBEE_CONFIG"]
const tempDirs: string[] = []

function useTempState(): void {
  closeDb()
  const stateDir = mkdtempSync(join(tmpdir(), "knowbee-run-yeonjang-action-tools-"))
  tempDirs.push(stateDir)
  process.env["KNOWBEE_STATE_DIR"] = stateDir
  delete process.env["KNOWBEE_CONFIG"]
  reloadConfig()
}

function seedObservation(overrides: Partial<Parameters<typeof upsertYeonjangRegistryObservation>[0]> = {}) {
  const observedAt = overrides.observedAt ?? Date.now()
  return upsertYeonjangRegistryObservation({
    instanceId: overrides.instanceId ?? "inst-local-main",
    instanceAlias: overrides.instanceAlias ?? "local-mac",
    displayName: overrides.displayName ?? "Local Mac Console",
    nodeId: overrides.nodeId ?? "yeonjang-main",
    supportProfile: overrides.supportProfile ?? "desktop_interactive",
    platform: overrides.platform ?? "macos",
    arch: overrides.arch ?? "arm64",
    hostFingerprint: overrides.hostFingerprint ?? "gateway-host",
    installFingerprint: overrides.installFingerprint ?? "gateway-install",
    sessionId: overrides.sessionId ?? "sess-local-main",
    clientId: overrides.clientId ?? "client-local-main",
    connectionState: overrides.connectionState ?? "online",
    message: overrides.message ?? "ready",
    version: overrides.version ?? "0.1.0",
    protocolVersion: overrides.protocolVersion ?? "2026-04-16.capability-matrix.v1",
    capabilityHash: overrides.capabilityHash ?? "cap-local-main",
    transport: overrides.transport ?? ["mqtt-json"],
    permissions: overrides.permissions ?? { allow_shell_exec: true },
    toolHealth: overrides.toolHealth ?? { "system.exec": { status: "ready" } },
    capabilityMatrix: overrides.capabilityMatrix ?? {
      "system.exec": { supported: true, requiresPermission: true, permissionSetting: "allow_shell_exec" },
    },
    methodCount: overrides.methodCount ?? 1,
    startupMode: overrides.startupMode ?? "manual",
    windowMode: overrides.windowMode ?? "visible",
    trayState: overrides.trayState ?? "visible",
    ...(overrides.workspaceScopeId !== undefined ? { workspaceScopeId: overrides.workspaceScopeId } : {}),
    ...(overrides.trustState !== undefined ? { trustState: overrides.trustState } : {}),
    observedAt,
  })
}

function createContext(): ToolContext {
  return {
    sessionId: "session-1",
    runId: "run-1",
    requestGroupId: "request-group-1",
    workDir: process.cwd(),
    userMessage: "연장 액션 실행",
    source: "telegram",
    allowWebAccess: false,
    onProgress: vi.fn(),
    signal: new AbortController().signal,
  }
}

describe("yeonjang action tools", () => {
  beforeEach(() => {
    useTempState()
    canYeonjangHandleMethod.mockReset()
    invokeYeonjangMethod.mockReset()
    isYeonjangUnavailableError.mockClear()
    getMqttExtensionSnapshots.mockReturnValue([
      {
        extensionId: "yeonjang-main",
        displayName: "Yeonjang-osx",
        instanceId: "inst-local-main",
        instanceAlias: "local-mac",
        state: "online",
        message: "macOS connected",
        platform: "macos",
        methods: ["mouse.action", "keyboard.action"],
        sessionId: "sess-local-main",
      },
      {
        extensionId: "yeonjang-dongwooshinc28b-92049",
        displayName: "Yeonjang-windows",
        instanceId: "inst-remote-windows",
        instanceAlias: "windows-test-pc",
        state: "online",
        message: "windows connected",
        platform: "windows",
        methods: ["system.exec"],
        sessionId: "sess-remote-windows",
      },
    ])
  })

  afterEach(() => {
    closeDb()
    if (previousStateDir === undefined) delete process.env["KNOWBEE_STATE_DIR"]
    else process.env["KNOWBEE_STATE_DIR"] = previousStateDir
    if (previousConfig === undefined) delete process.env["KNOWBEE_CONFIG"]
    else process.env["KNOWBEE_CONFIG"] = previousConfig
    reloadConfig()
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()
      if (dir) rmSync(dir, { recursive: true, force: true })
    }
  })

  it("forwards shell env and timeout to Yeonjang system.exec", async () => {
    expect(seedObservation({
      instanceId: "inst-remote-windows",
      instanceAlias: "windows-test-pc",
      displayName: "Windows Operator Console",
      nodeId: "yeonjang-dongwooshinc28b-92049",
      platform: "windows",
      arch: "x64",
      hostFingerprint: "remote-host",
      installFingerprint: "remote-install",
      sessionId: "sess-remote-windows",
      workspaceScopeId: "workspace:local-default",
      trustState: "trusted",
      permissions: { allow_shell_exec: true },
      toolHealth: { "system.exec": { status: "ready" } },
      capabilityMatrix: {
        "system.exec": { supported: true, requiresPermission: true, permissionSetting: "allow_shell_exec" },
      },
    })).toEqual(expect.objectContaining({ ok: true }))
    canYeonjangHandleMethod.mockResolvedValue(true)
    invokeYeonjangMethod.mockResolvedValue({
      success: true,
      exit_code: 0,
      stdout: "ok",
      stderr: "",
    })

    await shellExecTool.execute(
      {
        command: "echo $HELLO",
        timeoutSec: 12,
        env: { HELLO: "world" },
        extensionId: "yeonjang-dongwooshinc28b-92049",
      },
      createContext(),
    )

    expect(canYeonjangHandleMethod).toHaveBeenCalledWith(
      "system.exec",
      {
        extensionId: "yeonjang-dongwooshinc28b-92049",
        metadata: {
          runId: "run-1",
          requestGroupId: "request-group-1",
          sessionId: "session-1",
          targetSessionId: "sess-remote-windows",
          source: "telegram",
        },
      },
    )
    expect(invokeYeonjangMethod).toHaveBeenCalledWith(
      "system.exec",
      {
        command: "echo $HELLO",
        args: [],
        shell: true,
        env: { HELLO: "world" },
        timeout_sec: 12,
      },
      {
        timeoutMs: 12_000,
        extensionId: "yeonjang-dongwooshinc28b-92049",
        metadata: {
          runId: "run-1",
          requestGroupId: "request-group-1",
          sessionId: "session-1",
          targetSessionId: "sess-remote-windows",
          source: "telegram",
        },
      },
    )
  })

  it("uses Yeonjang mouse.action for scroll requests", async () => {
    canYeonjangHandleMethod.mockResolvedValue(true)
    invokeYeonjangMethod.mockResolvedValue({
      accepted: true,
      action: "scroll",
      delta_x: 10,
      delta_y: -40,
      message: "Mouse scroll completed.",
    })

    const result = await mouseActionTool.execute(
      {
        action: "scroll",
        deltaX: 10,
        deltaY: -40,
      },
      createContext(),
    )

    expect(invokeYeonjangMethod).toHaveBeenCalledWith(
      "mouse.action",
      {
        action: "scroll",
        delta_x: 10,
        delta_y: -40,
      },
      {
        extensionId: "yeonjang-main",
        timeoutMs: 15_000,
        metadata: {
          runId: "run-1",
          requestGroupId: "request-group-1",
          sessionId: "session-1",
          targetSessionId: "sess-local-main",
          source: "telegram",
        },
      },
    )
    expect(result.success).toBe(true)
    expect(result.details).toMatchObject({
      via: "yeonjang",
      action: "scroll",
      deltaX: 10,
      deltaY: -40,
    })
  })

  it("uses Yeonjang keyboard.action for key press requests", async () => {
    canYeonjangHandleMethod.mockResolvedValue(true)
    invokeYeonjangMethod.mockResolvedValue({
      accepted: true,
      action: "key_press",
      key: "c",
      modifiers: ["meta"],
      message: "Keyboard key_press completed.",
    })

    const result = await keyboardActionTool.execute(
      {
        action: "key_press",
        key: "c",
        modifiers: ["meta"],
      },
      createContext(),
    )

    expect(invokeYeonjangMethod).toHaveBeenCalledWith(
      "keyboard.action",
      {
        action: "key_press",
        key: "c",
        modifiers: ["meta"],
      },
      {
        extensionId: "yeonjang-main",
        timeoutMs: 15_000,
        metadata: {
          runId: "run-1",
          requestGroupId: "request-group-1",
          sessionId: "session-1",
          targetSessionId: "sess-local-main",
          source: "telegram",
        },
      },
    )
    expect(result.success).toBe(true)
    expect(result.details).toMatchObject({
      via: "yeonjang",
      action: "key_press",
      key: "c",
      modifiers: ["meta"],
    })
  })
})
