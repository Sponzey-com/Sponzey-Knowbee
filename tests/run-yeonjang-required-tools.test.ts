import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { reloadConfig } from "../packages/core/src/config/index.js"
import { closeDb } from "../packages/core/src/db/index.js"
import type { ToolContext } from "../packages/core/src/tools/types.ts"
import { upsertYeonjangRegistryObservation } from "../packages/core/src/yeonjang/registry.ts"

const canYeonjangHandleMethod = vi.fn()
const getYeonjangCapabilities = vi.fn()
const invokeYeonjangMethod = vi.fn()
const isYeonjangUnavailableError = vi.fn((error: unknown) => error === "unavailable")
const getMqttExtensionSnapshots = vi.fn()

vi.mock("../packages/core/src/yeonjang/mqtt-client.js", () => ({
  canYeonjangHandleMethod,
  getYeonjangCapabilities,
  doesYeonjangCapabilitySupportMethod: (capabilities: { capabilityMatrix?: Record<string, { supported?: boolean }>; methods?: Array<{ name: string; implemented: boolean }> }, method: string) => {
    const matrixEntry = capabilities.capabilityMatrix?.[method]
    if (matrixEntry && typeof matrixEntry.supported === "boolean") return matrixEntry.supported
    return capabilities.methods?.find((candidate) => candidate.name === method)?.implemented ?? false
  },
  doesYeonjangCapabilitySupportOutputMode: (capabilities: { capabilityMatrix?: Record<string, { outputModes?: string[] }> }, method: string, outputMode: string) => {
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

const { shellExecTool } = await import("../packages/core/src/tools/builtin/shell.ts")
const { appLaunchTool } = await import("../packages/core/src/tools/builtin/app.ts")
const { processKillTool } = await import("../packages/core/src/tools/builtin/process.ts")
const { screenCaptureTool } = await import("../packages/core/src/tools/builtin/ui/screen.ts")
const { mouseMoveTool } = await import("../packages/core/src/tools/builtin/ui/mouse.ts")
const { keyboardTypeTool } = await import("../packages/core/src/tools/builtin/ui/keyboard.ts")
const { windowFocusTool } = await import("../packages/core/src/tools/builtin/ui/window.ts")

const previousStateDir = process.env["NOBIE_STATE_DIR"]
const previousConfig = process.env["NOBIE_CONFIG"]
const tempDirs: string[] = []

function useTempState(): void {
  closeDb()
  const stateDir = mkdtempSync(join(tmpdir(), "nobie-run-yeonjang-required-tools-"))
  tempDirs.push(stateDir)
  process.env["NOBIE_STATE_DIR"] = stateDir
  delete process.env["NOBIE_CONFIG"]
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

function createContext(userMessage = "연장으로 실행해줘", source: ToolContext["source"] = "telegram"): ToolContext {
  return {
    sessionId: "session-1",
    runId: "run-1",
    requestGroupId: "request-group-1",
    workDir: process.cwd(),
    userMessage,
    source,
    allowWebAccess: false,
    onProgress: vi.fn(),
    signal: new AbortController().signal,
  }
}

describe("yeonjang required tools", () => {
  beforeEach(() => {
    useTempState()
    canYeonjangHandleMethod.mockReset()
    getYeonjangCapabilities.mockReset().mockResolvedValue({
      capabilityMatrix: {
        "screen.capture": {
          supported: false,
          outputModes: ["base64", "file"],
        },
      },
    })
    invokeYeonjangMethod.mockReset()
    isYeonjangUnavailableError.mockClear()
    canYeonjangHandleMethod.mockResolvedValue(false)
    getMqttExtensionSnapshots.mockReturnValue([
      {
        extensionId: 'yeonjang-main',
        displayName: 'Yeonjang-osx',
        instanceId: 'inst-local-main',
        instanceAlias: 'local-mac',
        state: 'online',
        message: 'macOS connected',
        platform: 'macos',
        methods: ['screen.capture'],
        sessionId: 'sess-local-main',
      },
      {
        extensionId: 'yeonjang-dongwooshinc28b-92049',
        displayName: 'Yeonjang-windows',
        instanceId: 'inst-remote-windows',
        instanceAlias: 'windows-test-pc',
        state: 'online',
        message: 'windows connected',
        platform: 'windows',
        methods: ['screen.capture', 'system.exec'],
        sessionId: 'sess-remote-windows',
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

  it("fails shell execution when Yeonjang system.exec is unavailable", async () => {
    const result = await shellExecTool.execute({ command: "pwd" }, createContext())

    expect(result.success).toBe(false)
    expect(result.error).toBe("YEONJANG_REQUIRED")
    expect(result.output).toContain("system.exec")
  })

  it("fails app launch when Yeonjang application.launch is unavailable", async () => {
    const result = await appLaunchTool.execute({ app: "Safari" }, createContext())

    expect(result.success).toBe(false)
    expect(result.error).toBe("YEONJANG_REQUIRED")
    expect(result.output).toContain("application.launch")
  })

  it("fails screen capture when Yeonjang screen.capture is unavailable", async () => {
    const result = await screenCaptureTool.execute({}, createContext())

    expect(result.success).toBe(false)
    expect(result.error).toBe("YEONJANG_REQUIRED")
    expect(result.output).toContain("screen.capture")
  })

  it("returns a terminal guidance message when remote screen capture hits the Windows path bug", async () => {
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
    })).toEqual(expect.objectContaining({ ok: true }))
    getYeonjangCapabilities.mockResolvedValueOnce({
      capabilityMatrix: {
        "screen.capture": { supported: true, outputModes: ["base64", "file"] },
      },
    })
    invokeYeonjangMethod.mockRejectedValueOnce(new Error(
      'screen capture failed: "1" can not be passed to "GetDirectoryName".',
    ))

    const result = await screenCaptureTool.execute({ extensionId: 'yeonjang-dongwooshinc28b-92049' }, createContext('윈도우 메인화면 캡처해서 보여줘'))

    expect(result.success).toBe(false)
    expect(result.error).toBe('YEONJANG_SCREEN_CAPTURE_PATH_BUG')
    expect(result.output).toContain('Windows 연장의 `screen.capture` 내부 경로 처리 오류')
    expect(result.details).toMatchObject({
      via: 'yeonjang',
      stopAfterFailure: true,
      failureKind: 'path_bug',
      extensionId: 'yeonjang-dongwooshinc28b-92049',
    })
    expect(getYeonjangCapabilities).toHaveBeenCalledWith({
      extensionId: 'yeonjang-dongwooshinc28b-92049',
      metadata: {
        runId: 'run-1',
        requestGroupId: 'request-group-1',
        sessionId: 'session-1',
        targetSessionId: 'sess-remote-windows',
        source: 'telegram',
      },
    })
  })

  it("uses an explicit remote extension target without falling back to yeonjang-main", async () => {
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
    })).toEqual(expect.objectContaining({ ok: true }))
    getYeonjangCapabilities.mockResolvedValueOnce({
      capabilityMatrix: {
        "screen.capture": { supported: true, outputModes: ["base64", "file"] },
      },
    })
    invokeYeonjangMethod.mockResolvedValueOnce({
      base64_data: Buffer.from('png').toString('base64'),
      mime_type: 'image/png',
      file_name: 'screen.png',
      file_extension: 'png',
      size_bytes: 3,
    })

    const result = await screenCaptureTool.execute({
      targetSelector: {
        type: 'instance_alias',
        instanceAlias: 'windows-test-pc',
      },
    }, createContext('윈도우 메인화면 캡처해서 보여줘'))

    expect(result.success).toBe(true)
    expect(getYeonjangCapabilities).toHaveBeenCalledWith({
      extensionId: 'yeonjang-dongwooshinc28b-92049',
      metadata: {
        runId: 'run-1',
        requestGroupId: 'request-group-1',
        sessionId: 'session-1',
        targetSessionId: 'sess-remote-windows',
        source: 'telegram',
      },
    })
    expect(invokeYeonjangMethod).toHaveBeenCalledWith(
      'screen.capture',
      { inline_base64: true },
      expect.objectContaining({
        extensionId: 'yeonjang-dongwooshinc28b-92049',
        timeoutMs: 60000,
        metadata: {
          runId: 'run-1',
          requestGroupId: 'request-group-1',
          sessionId: 'session-1',
          targetSessionId: 'sess-remote-windows',
          source: 'telegram',
        },
      }),
    )
  })

  it("passes the requested second-monitor capture target through to Yeonjang", async () => {
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
    })).toEqual(expect.objectContaining({ ok: true }))
    getYeonjangCapabilities.mockResolvedValueOnce({
      capabilityMatrix: {
        "screen.capture": { supported: true, outputModes: ["base64", "file"] },
      },
    })
    invokeYeonjangMethod.mockResolvedValueOnce({
      base64_data: Buffer.from('png').toString('base64'),
      mime_type: 'image/png',
      file_name: 'screen.png',
      file_extension: 'png',
      size_bytes: 3,
    })

    const result = await screenCaptureTool.execute({ extensionId: 'yeonjang-dongwooshinc28b-92049' }, createContext('윈도우 2번째 모니터 캡쳐해서 보여줘'))

    expect(result.success).toBe(true)
    expect(invokeYeonjangMethod).toHaveBeenCalledWith(
      'screen.capture',
      { inline_base64: true, display: 1 },
      expect.objectContaining({
        extensionId: 'yeonjang-dongwooshinc28b-92049',
        timeoutMs: 60000,
        metadata: {
          runId: 'run-1',
          requestGroupId: 'request-group-1',
          sessionId: 'session-1',
          targetSessionId: 'sess-remote-windows',
          source: 'telegram',
        },
      }),
    )
  })

  it("respects an explicit display parameter when provided", async () => {
    getYeonjangCapabilities.mockResolvedValueOnce({
      capabilityMatrix: {
        "screen.capture": { supported: true, outputModes: ["base64", "file"] },
      },
    })
    invokeYeonjangMethod.mockResolvedValueOnce({
      base64_data: Buffer.from('png').toString('base64'),
      mime_type: 'image/png',
      file_name: 'screen.png',
      file_extension: 'png',
      size_bytes: 3,
    })

    const result = await screenCaptureTool.execute({ display: 1 }, createContext('외부모니터 화면 캡쳐해서 보여줘'))

    expect(result.success).toBe(true)
    expect(invokeYeonjangMethod).toHaveBeenCalledWith(
      'screen.capture',
      { inline_base64: true, display: 1 },
      {
        extensionId: 'yeonjang-main',
        timeoutMs: 60000,
        metadata: {
          runId: 'run-1',
          requestGroupId: 'request-group-1',
          sessionId: 'session-1',
          targetSessionId: 'sess-local-main',
          source: 'telegram',
        },
      },
    )
  })

  it("refuses remote-only auto selection when the target is omitted", async () => {
    getMqttExtensionSnapshots.mockReturnValue([
      {
        extensionId: 'yeonjang-remote-only',
        displayName: 'Yeonjang-remote-only',
        state: 'online',
        message: 'remote connected',
        platform: 'windows',
        methods: ['screen.capture'],
      },
    ])

    const result = await screenCaptureTool.execute({}, createContext('화면 캡쳐해서 보여줘'))

    expect(result.success).toBe(false)
    expect(result.error).toBe('YEONJANG_TARGET_SELECTION_REQUIRED')
    expect(result.output).toContain('정확한 인스턴스를 지정해 주세요')
    expect(getYeonjangCapabilities).not.toHaveBeenCalled()
    expect(invokeYeonjangMethod).not.toHaveBeenCalled()
  })

  it("returns slack artifact delivery details for screen capture requested from slack", async () => {
    getYeonjangCapabilities.mockResolvedValueOnce({
      capabilityMatrix: {
        "screen.capture": { supported: true, outputModes: ["base64", "file"] },
      },
    })
    invokeYeonjangMethod.mockResolvedValueOnce({
      base64_data: Buffer.from('png').toString('base64'),
      mime_type: 'image/png',
      file_name: 'screen.png',
      file_extension: 'png',
      size_bytes: 3,
    })

    const result = await screenCaptureTool.execute({}, createContext('메인 화면 캡쳐해서 보여줘', 'slack'))

    expect(result.success).toBe(true)
    expect(result.details).toMatchObject({
      kind: 'artifact_delivery',
      channel: 'slack',
      source: 'slack',
    })
  })

  it("stops screen capture before execution when Yeonjang is too old to report a capability matrix", async () => {
    getYeonjangCapabilities.mockResolvedValueOnce({
      methods: [{ name: "screen.capture", implemented: true }],
    })

    const result = await screenCaptureTool.execute({}, createContext('메인 화면 캡쳐해서 보여줘'))

    expect(result.success).toBe(false)
    expect(result.error).toBe("YEONJANG_CAPABILITY_MATRIX_REQUIRED")
    expect(invokeYeonjangMethod).not.toHaveBeenCalled()
  })

  it("stops screen capture before execution when base64 output is unsupported", async () => {
    getYeonjangCapabilities.mockResolvedValueOnce({
      capabilityMatrix: {
        "screen.capture": { supported: true, outputModes: ["file"] },
      },
    })

    const result = await screenCaptureTool.execute({}, createContext('메인 화면 캡쳐해서 보여줘'))

    expect(result.success).toBe(false)
    expect(result.error).toBe("YEONJANG_OUTPUT_MODE_UNSUPPORTED")
    expect(invokeYeonjangMethod).not.toHaveBeenCalled()
  })

  it("fails mouse move when Yeonjang mouse.move is unavailable", async () => {
    const result = await mouseMoveTool.execute({ x: 10, y: 20 }, createContext())

    expect(result.success).toBe(false)
    expect(result.error).toBe("YEONJANG_REQUIRED")
    expect(result.output).toContain("mouse.move")
  })

  it("fails keyboard typing when Yeonjang keyboard.type is unavailable", async () => {
    const result = await keyboardTypeTool.execute({ text: "hello" }, createContext())

    expect(result.success).toBe(false)
    expect(result.error).toBe("YEONJANG_REQUIRED")
    expect(result.output).toContain("keyboard.type")
  })

  it("fails process kill because core local process control is disabled", async () => {
    const result = await processKillTool.execute({ pid: 1234 }, createContext())

    expect(result.success).toBe(false)
    expect(result.error).toBe("YEONJANG_REQUIRED")
    expect(result.output).toContain("코어 로컬 경로")
  })

  it("fails window focus because core local window control is disabled", async () => {
    const result = await windowFocusTool.execute({ title: "Safari" }, createContext())

    expect(result.success).toBe(false)
    expect(result.error).toBe("YEONJANG_REQUIRED")
    expect(result.output).toContain("창 포커스")
  })
})
