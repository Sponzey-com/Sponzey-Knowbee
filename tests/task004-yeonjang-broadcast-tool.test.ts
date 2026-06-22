import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { reloadConfig } from "../packages/core/src/config/index.js"
import { closeDb, listMessageLedgerEvents } from "../packages/core/src/db/index.ts"
import type { ToolContext } from "../packages/core/src/tools/types.ts"
import { upsertYeonjangRegistryObservation } from "../packages/core/src/yeonjang/registry.ts"

const getYeonjangCapabilities = vi.fn()
const invokeYeonjangMethod = vi.fn()
const isYeonjangUnavailableError = vi.fn((error: unknown) => error === "unavailable")
const getMqttExtensionSnapshots = vi.fn()

vi.mock("../packages/core/src/yeonjang/mqtt-client.js", () => ({
  getYeonjangCapabilities,
  doesYeonjangCapabilitySupportMethod: (
    capabilities: { capabilityMatrix?: Record<string, { supported?: boolean }>; methods?: Array<{ name: string; implemented: boolean }> },
    method: string,
  ) => {
    const matrixEntry = capabilities.capabilityMatrix?.[method]
    if (matrixEntry && typeof matrixEntry.supported === "boolean") return matrixEntry.supported
    return capabilities.methods?.find((candidate) => candidate.name === method)?.implemented ?? false
  },
  doesYeonjangCapabilitySupportOutputMode: (
    capabilities: { capabilityMatrix?: Record<string, { outputModes?: string[] }> },
    method: string,
    outputMode: string,
  ) => {
    const modes = capabilities.capabilityMatrix?.[method]?.outputModes
    if (!modes) return null
    return modes.includes(outputMode)
  },
  hasYeonjangCapabilityMatrix: (capabilities: { capabilityMatrix?: Record<string, unknown> }) => Boolean(capabilities.capabilityMatrix),
  invokeYeonjangMethod,
  isYeonjangUnavailableError,
  DEFAULT_YEONJANG_EXTENSION_ID: "yeonjang-main",
}))

vi.mock("../packages/core/src/mqtt/broker.js", () => ({
  getMqttExtensionSnapshots,
}))

const { yeonjangBroadcastRunTool } = await import("../packages/core/src/tools/builtin/yeonjang-broadcast.ts")

const previousStateDir = process.env["KNOWBEE_STATE_DIR"]
const previousConfig = process.env["KNOWBEE_CONFIG"]
const tempDirs: string[] = []

function stableHexHash(value: string): string {
  let hash = 0xcbf29ce484222325n
  for (const byte of Buffer.from(value, "utf-8")) {
    hash ^= BigInt(byte)
    hash = BigInt.asUintN(64, hash * 0x100000001b3n)
  }
  return hash.toString(16).padStart(16, "0")
}

function gatewayHostFingerprintRaw(): string {
  const hostname =
    process.env["KNOWBEE_HOSTNAME"]?.trim()
    || process.env["COMPUTERNAME"]?.trim()
    || process.env["HOSTNAME"]?.trim()
    || "localhost"
  const os = process.platform === "darwin" ? "macos" : process.platform === "win32" ? "windows" : process.platform
  const arch = process.arch === "x64" ? "x86_64" : process.arch === "arm64" ? "aarch64" : process.arch === "ia32" ? "x86" : process.arch
  return stableHexHash(`${hostname}|${os}|${arch}`)
}

function useTempState(): void {
  closeDb()
  const stateDir = mkdtempSync(join(tmpdir(), "knowbee-task004-yeonjang-broadcast-"))
  tempDirs.push(stateDir)
  process.env["KNOWBEE_STATE_DIR"] = stateDir
  delete process.env["KNOWBEE_CONFIG"]
  reloadConfig()
}

function seedObservation(overrides: Partial<Parameters<typeof upsertYeonjangRegistryObservation>[0]> = {}) {
  const observedAt = overrides.observedAt ?? Date.now()
  return upsertYeonjangRegistryObservation({
    instanceId: overrides.instanceId ?? "inst-local",
    instanceAlias: overrides.instanceAlias ?? "local-mac",
    displayName: overrides.displayName ?? "Local Mac Console",
    nodeId: overrides.nodeId ?? "yeonjang-local",
    supportProfile: overrides.supportProfile ?? "desktop_interactive",
    platform: overrides.platform ?? "macos",
    arch: overrides.arch ?? "arm64",
    hostFingerprint: overrides.hostFingerprint ?? gatewayHostFingerprintRaw(),
    installFingerprint: overrides.installFingerprint ?? "install-local",
    sessionId: overrides.sessionId ?? "sess-local",
    clientId: overrides.clientId ?? "client-local",
    connectionState: overrides.connectionState ?? "online",
    message: overrides.message ?? "ready",
    version: overrides.version ?? "0.1.0",
    protocolVersion: overrides.protocolVersion ?? "2026-04-16.capability-matrix.v1",
    capabilityHash: overrides.capabilityHash ?? "cap-local",
    transport: overrides.transport ?? ["mqtt-json"],
    permissions: overrides.permissions ?? { allow_screen_capture: true },
    toolHealth: overrides.toolHealth ?? { "screen.capture": { status: "ready" } },
    capabilityMatrix: overrides.capabilityMatrix ?? {
      "screen.capture": { supported: true, requiresPermission: true, permissionSetting: "allow_screen_capture" },
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

function createContext(userMessage = "모든 연장 화면을 캡처해줘"): ToolContext {
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

beforeEach(() => {
  useTempState()
  expect(seedObservation({
    instanceId: "inst-local",
    instanceAlias: "local-mac",
    displayName: "Local Mac Console",
    nodeId: "yeonjang-local",
    hostFingerprint: gatewayHostFingerprintRaw(),
    installFingerprint: "install-local",
    sessionId: "sess-local",
    workspaceScopeId: "workspace:local-default",
    trustState: "trusted",
  })).toEqual(expect.objectContaining({ ok: true }))
  expect(seedObservation({
    instanceId: "inst-win",
    instanceAlias: "windows-box",
    displayName: "Alpha Windows Review Station",
    nodeId: "yeonjang-win",
    platform: "windows",
    arch: "x64",
    hostFingerprint: "remote-host-win",
    installFingerprint: "install-win",
    sessionId: "sess-win",
    workspaceScopeId: "workspace:local-default",
    trustState: "trusted",
  })).toEqual(expect.objectContaining({ ok: true }))
  expect(seedObservation({
    instanceId: "inst-linux",
    instanceAlias: "linux-box",
    displayName: "Zulu Linux Review Station",
    nodeId: "yeonjang-linux",
    platform: "linux",
    arch: "x64",
    hostFingerprint: "remote-host-linux",
    installFingerprint: "install-linux",
    sessionId: "sess-linux",
    workspaceScopeId: "workspace:local-default",
    trustState: "trusted",
  })).toEqual(expect.objectContaining({ ok: true }))
  getYeonjangCapabilities.mockReset().mockResolvedValue({
    capabilityMatrix: {
      "screen.capture": {
        supported: true,
        outputModes: ["base64", "file"],
      },
    },
  })
  invokeYeonjangMethod.mockReset()
  isYeonjangUnavailableError.mockClear()
  getMqttExtensionSnapshots.mockReset().mockReturnValue([
    {
      extensionId: "yeonjang-local",
      displayName: "Local Mac",
      instanceId: "inst-local",
      instanceAlias: "local-mac",
      state: "online",
      message: "ready",
      platform: "macos",
      methods: ["screen.capture"],
      sessionId: "sess-local",
      trustState: "trusted",
      lastSeenAt: Date.now(),
    },
    {
      extensionId: "yeonjang-win",
      displayName: "Alpha Windows Review Station",
      instanceId: "inst-win",
      instanceAlias: "windows-box",
      state: "online",
      message: "ready",
      platform: "windows",
      methods: ["screen.capture"],
      sessionId: "sess-win",
      trustState: "trusted",
      lastSeenAt: Date.now(),
    },
    {
      extensionId: "yeonjang-linux",
      displayName: "Zulu Linux Review Station",
      instanceId: "inst-linux",
      instanceAlias: "linux-box",
      state: "online",
      message: "ready",
      platform: "linux",
      methods: ["screen.capture"],
      sessionId: "sess-linux",
      trustState: "trusted",
      lastSeenAt: Date.now(),
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

describe("task004 yeonjang broadcast tool", () => {
  it("captures per-target artifacts in isolated namespaces and returns a partial-success summary", async () => {
    invokeYeonjangMethod
      .mockResolvedValueOnce({
        base64_data: Buffer.from("png-local").toString("base64"),
        mime_type: "image/png",
        file_name: "local.png",
        file_extension: "png",
        size_bytes: 9,
        message: "local ok",
      })
      .mockRejectedValueOnce(new Error("timed out"))
      .mockResolvedValueOnce({
        base64_data: Buffer.from("png-linux").toString("base64"),
        mime_type: "image/png",
        file_name: "linux.png",
        file_extension: "png",
        size_bytes: 9,
        message: "linux ok",
      })

    const result = await yeonjangBroadcastRunTool.execute({
      toolName: "screen_capture",
      targetSelector: { type: "all_online" },
      broadcastIntent: { confirm: true },
    }, createContext())

    expect(result.success).toBe(true)
    expect(result.details).toMatchObject({
      kind: "yeonjang_broadcast_result",
      summaryReceipt: {
        totalTargets: 3,
        successCount: 2,
        failedCount: 1,
        skippedCount: 0,
        partialSuccess: true,
      },
    })
    const details = result.details as {
      broadcastRunId: string
      targetReceipts: Array<{ status: string; artifactPath?: string | null }>
    }
    const artifactPaths = details.targetReceipts
      .filter((receipt) => receipt.status === "succeeded")
      .map((receipt) => receipt.artifactPath)
      .filter((value): value is string => typeof value === "string")
    expect(artifactPaths).toHaveLength(2)
    expect(new Set(artifactPaths).size).toBe(2)
    for (const [index, filePath] of artifactPaths.entries()) {
      expect(filePath).toContain(`/broadcast/${details.broadcastRunId}/`)
      const content = readFileSync(filePath)
      expect(content.length).toBeGreaterThan(0)
      expect(filePath).toContain(index === 0 ? "/inst-local/sess-local/" : "/inst-linux/sess-linux/")
    }

    const events = listMessageLedgerEvents({ runId: "run-1", limit: 20 })
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event_kind: "tool_started",
        summary: "yeonjang broadcast plan created: screen_capture",
      }),
      expect.objectContaining({
        event_kind: "tool_done",
        summary: expect.stringContaining("local-mac"),
      }),
      expect.objectContaining({
        event_kind: "tool_failed",
        summary: expect.stringContaining("windows-box"),
      }),
    ]))

    expect(invokeYeonjangMethod).toHaveBeenNthCalledWith(
      1,
      "screen.capture",
      { inline_base64: true },
      expect.objectContaining({
        extensionId: "yeonjang-local",
        timeoutMs: 60_000,
        metadata: expect.objectContaining({
          broadcastIndex: 0,
          broadcastTotal: 3,
          broadcastRunId: details.broadcastRunId,
          targetSessionId: "sess-local",
        }),
      }),
    )
  })

  it("blocks dangerous shell broadcast before invoking any Yeonjang target", async () => {
    const result = await yeonjangBroadcastRunTool.execute({
      toolName: "shell_exec",
      toolParams: { command: "rm -rf /tmp/demo" },
      targetSelector: { type: "all_online" },
      broadcastIntent: { confirm: true },
    }, createContext("모든 연장에서 명령 실행해"))

    expect(result.success).toBe(false)
    expect(result.error).toBe("YEONJANG_BROADCAST_APPROVAL_REQUIRED")
    expect(result.output).toContain("system.exec broadcast는 기본 차단")
    expect(invokeYeonjangMethod).not.toHaveBeenCalled()
  })

  it("retries only incomplete broadcast targets and skips previously succeeded ones", async () => {
    invokeYeonjangMethod.mockResolvedValueOnce({
      base64_data: Buffer.from("png-win").toString("base64"),
      mime_type: "image/png",
      file_name: "win.png",
      file_extension: "png",
      size_bytes: 7,
      message: "win ok",
    })

    const result = await yeonjangBroadcastRunTool.execute({
      toolName: "screen_capture",
      targetSelector: { type: "all_online" },
      broadcastIntent: { confirm: true },
      retryReceipt: {
        previousBroadcastRunId: "broadcast-prev",
        retryMode: "failed_only",
        targetReceipts: [
          { instanceId: "inst-local", status: "succeeded", sessionId: "sess-local" },
          { instanceId: "inst-win", status: "failed", sessionId: "sess-win" },
        ],
        skippedTargets: [
          { instanceId: "inst-linux", reasonCodes: ["temporary_preflight_failure"] },
        ],
      },
    }, createContext("실패한 연장만 다시 캡처해"))

    expect(result.success).toBe(true)
    expect(invokeYeonjangMethod).toHaveBeenCalledTimes(2)
    expect(invokeYeonjangMethod).toHaveBeenNthCalledWith(
      1,
      "screen.capture",
      { inline_base64: true },
      expect.objectContaining({
        extensionId: "yeonjang-win",
        metadata: expect.objectContaining({
          targetSessionId: "sess-win",
          broadcastIndex: 0,
          broadcastTotal: 2,
        }),
      }),
    )
    expect(invokeYeonjangMethod).toHaveBeenNthCalledWith(
      2,
      "screen.capture",
      { inline_base64: true },
      expect.objectContaining({
        extensionId: "yeonjang-linux",
        metadata: expect.objectContaining({
          targetSessionId: "sess-linux",
          broadcastIndex: 1,
          broadcastTotal: 2,
        }),
      }),
    )

    expect(result.details).toMatchObject({
      kind: "yeonjang_broadcast_result",
      retryReceipt: {
        requested: true,
        previousBroadcastRunId: "broadcast-prev",
        skippedSucceededTargetIds: ["inst-local"],
        retriedTargetIds: ["inst-win", "inst-linux"],
      },
      summaryReceipt: {
        totalTargets: 3,
        successCount: 1,
        failedCount: 1,
        skippedCount: 1,
        retryRequested: true,
        retrySkippedSucceededCount: 1,
        retryTargetCount: 2,
      },
      skippedTargets: [
        expect.objectContaining({
          instanceId: "inst-local",
          reasonCodes: expect.arrayContaining(["retry_target_already_succeeded"]),
        }),
      ],
    })
  })
})
