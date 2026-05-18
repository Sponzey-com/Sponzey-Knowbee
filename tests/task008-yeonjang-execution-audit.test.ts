import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { reloadConfig } from "../packages/core/src/config/index.js"
import { closeDb, getDb } from "../packages/core/src/db/index.js"
import { upsertYeonjangRegistryObservation } from "../packages/core/src/yeonjang/registry.ts"
import type { ToolContext } from "../packages/core/src/tools/types.ts"

const canYeonjangHandleMethod = vi.fn()
const getYeonjangCapabilities = vi.fn()
const invokeYeonjangMethod = vi.fn()
const isYeonjangUnavailableError = vi.fn((error: unknown) => error === "unavailable")
const getMqttExtensionSnapshots = vi.fn()

vi.mock("../packages/core/src/yeonjang/mqtt-client.js", () => ({
  canYeonjangHandleMethod,
  getYeonjangCapabilities,
  doesYeonjangCapabilitySupportMethod: () => true,
  doesYeonjangCapabilitySupportOutputMode: () => true,
  hasYeonjangCapabilityMatrix: () => true,
  invokeYeonjangMethod,
  isYeonjangUnavailableError,
  DEFAULT_YEONJANG_EXTENSION_ID: "yeonjang-main",
}))

vi.mock("../packages/core/src/mqtt/broker.js", () => ({
  getMqttExtensionSnapshots,
}))

const { shellExecTool } = await import("../packages/core/src/tools/builtin/shell.ts")
const { yeonjangBroadcastRunTool } = await import("../packages/core/src/tools/builtin/yeonjang-broadcast.ts")

const previousStateDir = process.env["NOBIE_STATE_DIR"]
const previousConfig = process.env["NOBIE_CONFIG"]
const tempDirs: string[] = []

function useTempState(): void {
  closeDb()
  const stateDir = mkdtempSync(join(tmpdir(), "nobie-task008-yeonjang-audit-"))
  tempDirs.push(stateDir)
  process.env["NOBIE_STATE_DIR"] = stateDir
  delete process.env["NOBIE_CONFIG"]
  reloadConfig()
}

function createContext(userMessage = "원격 연장을 실행해줘"): ToolContext {
  return {
    sessionId: "session-1",
    runId: "run-1",
    requestGroupId: "request-group-1",
    workDir: process.cwd(),
    userMessage,
    source: "telegram",
    allowWebAccess: false,
    onProgress: vi.fn(),
    signal: new AbortController().signal,
  }
}

function seedObservation(overrides: Partial<Parameters<typeof upsertYeonjangRegistryObservation>[0]> = {}) {
  const observedAt = overrides.observedAt ?? Date.now()
  return upsertYeonjangRegistryObservation({
    instanceId: overrides.instanceId ?? "inst-local",
    instanceAlias: overrides.instanceAlias ?? "local-mac",
    displayName: overrides.displayName ?? "Local Mac Console",
    nodeId: overrides.nodeId ?? "yeonjang-main",
    supportProfile: overrides.supportProfile ?? "desktop_interactive",
    platform: overrides.platform ?? "macos",
    arch: overrides.arch ?? "arm64",
    hostFingerprint: overrides.hostFingerprint ?? "gateway-host",
    installFingerprint: overrides.installFingerprint ?? "gateway-install",
    sessionId: overrides.sessionId ?? "sess-local",
    clientId: overrides.clientId ?? "client-local",
    connectionState: overrides.connectionState ?? "online",
    message: overrides.message ?? "ready",
    version: overrides.version ?? "0.1.0",
    protocolVersion: overrides.protocolVersion ?? "2026-04-16.capability-matrix.v1",
    capabilityHash: overrides.capabilityHash ?? "cap-local",
    transport: overrides.transport ?? ["mqtt-json"],
    permissions: overrides.permissions ?? { allow_screen_capture: true, allow_shell_exec: true },
    toolHealth: overrides.toolHealth ?? { "screen.capture": { status: "ready" } },
    capabilityMatrix: overrides.capabilityMatrix ?? {
      "screen.capture": { supported: true, requiresPermission: true, permissionSetting: "allow_screen_capture" },
      "system.exec": { supported: true, requiresPermission: true, permissionSetting: "allow_shell_exec" },
    },
    methodCount: overrides.methodCount ?? 2,
    startupMode: overrides.startupMode ?? "manual",
    windowMode: overrides.windowMode ?? "visible",
    trayState: overrides.trayState ?? "visible",
    ...(overrides.workspaceScopeId !== undefined ? { workspaceScopeId: overrides.workspaceScopeId } : {}),
    ...(overrides.trustState !== undefined ? { trustState: overrides.trustState } : {}),
    observedAt,
  })
}

beforeEach(() => {
  useTempState()
  canYeonjangHandleMethod.mockReset().mockResolvedValue(true)
  getYeonjangCapabilities.mockReset().mockResolvedValue({
    capabilityMatrix: {
      "screen.capture": { supported: true, outputModes: ["base64", "file"] },
    },
  })
  invokeYeonjangMethod.mockReset()
  isYeonjangUnavailableError.mockClear()
  seedObservation()
  seedObservation({
    instanceId: "inst-remote",
    instanceAlias: "windows-test-pc",
    displayName: "Windows Operator Console",
    nodeId: "yeonjang-windows",
    platform: "windows",
    arch: "x64",
    hostFingerprint: "remote-host",
    installFingerprint: "remote-install",
    sessionId: "sess-remote",
    workspaceScopeId: "workspace:local-default",
    trustState: "trusted",
  })
  getMqttExtensionSnapshots.mockReturnValue([
    {
      extensionId: "yeonjang-main",
      displayName: "Local Mac Console",
      instanceId: "inst-local",
      instanceAlias: "local-mac",
      workspaceScopeId: "workspace:local-default",
      state: "online",
      message: "ready",
      platform: "macos",
      methods: ["screen.capture", "system.exec"],
      sessionId: "sess-local",
    },
    {
      extensionId: "yeonjang-windows",
      displayName: "Windows Operator Console",
      instanceId: "inst-remote",
      instanceAlias: "windows-test-pc",
      workspaceScopeId: "workspace:local-default",
      state: "online",
      message: "ready",
      platform: "windows",
      methods: ["screen.capture", "system.exec"],
      sessionId: "sess-remote",
    },
  ])
})

afterEach(() => {
  closeDb()
  if (previousStateDir === undefined) delete process.env["NOBIE_STATE_DIR"]
  else process.env["NOBIE_STATE_DIR"] = previousStateDir
  if (previousConfig === undefined) delete process.env["NOBIE_CONFIG"]
  else process.env["NOBIE_CONFIG"] = previousConfig
  reloadConfig()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task008 yeonjang execution audit", () => {
  it("records explicit remote execution approval before single-target invoke", async () => {
    invokeYeonjangMethod.mockResolvedValueOnce({
      success: true,
      exit_code: 0,
      stdout: "ok",
      stderr: "",
    })

    const result = await shellExecTool.execute({
      command: "echo ok",
      targetSelector: { type: "instance_alias", instanceAlias: "windows-test-pc" },
    }, createContext())

    expect(result.success).toBe(true)
    const audit = getDb()
      .prepare<[], { tool_name: string; params: string }>(
        "SELECT tool_name, params FROM audit_logs WHERE source = 'yeonjang-governance' AND tool_name = 'yeonjang_remote_execution_approved' ORDER BY timestamp DESC LIMIT 1",
      )
      .get()
    expect(audit?.tool_name).toBe("yeonjang_remote_execution_approved")
    expect(audit?.params).toContain("\"toolName\":\"system.exec\"")
    expect(audit?.params).toContain("\"instanceId\":\"inst-remote\"")
  })

  it("records broadcast approval with target proof before fan-out execution", async () => {
    invokeYeonjangMethod
      .mockResolvedValueOnce({
        base64_data: Buffer.from("png-local").toString("base64"),
        mime_type: "image/png",
        file_name: "local.png",
        file_extension: "png",
        size_bytes: 9,
        message: "local ok",
      })
      .mockResolvedValueOnce({
        base64_data: Buffer.from("png-remote").toString("base64"),
        mime_type: "image/png",
        file_name: "remote.png",
        file_extension: "png",
        size_bytes: 9,
        message: "remote ok",
      })

    const result = await yeonjangBroadcastRunTool.execute({
      toolName: "screen_capture",
      targetSelector: { type: "all_online" },
      broadcastIntent: { confirm: true },
    }, createContext("모든 연장 화면을 캡처해줘"))

    expect(result.success).toBe(true)
    const audit = getDb()
      .prepare<[], { tool_name: string; params: string }>(
        "SELECT tool_name, params FROM audit_logs WHERE source = 'yeonjang-governance' AND tool_name = 'yeonjang_broadcast_execution_approved' ORDER BY timestamp DESC LIMIT 1",
      )
      .get()
    expect(audit?.tool_name).toBe("yeonjang_broadcast_execution_approved")
    expect(audit?.params).toContain("\"toolName\":\"screen_capture\"")
    expect(audit?.params).toContain("\"broadcastRunId\"")
    expect(audit?.params).toContain("\"instanceId\":\"inst-remote\"")
  })
})
