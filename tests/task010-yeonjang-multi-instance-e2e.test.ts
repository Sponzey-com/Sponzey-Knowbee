import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { reloadConfig } from "../packages/core/src/config/index.js"
import { closeDb } from "../packages/core/src/db/index.ts"
import type { ToolContext } from "../packages/core/src/tools/types.ts"
import {
  listYeonjangRegistryInstances,
  upsertYeonjangRegistryObservation,
} from "../packages/core/src/yeonjang/registry.ts"
import {
  resolveYeonjangTargetSelection,
  revalidateYeonjangTargetSelection,
} from "../packages/core/src/tools/builtin/yeonjang-target.ts"

const {
  getYeonjangCapabilities,
  invokeYeonjangMethod,
  isYeonjangUnavailableError,
  getMqttExtensionSnapshots,
} = vi.hoisted(() => ({
  getYeonjangCapabilities: vi.fn(),
  invokeYeonjangMethod: vi.fn(),
  isYeonjangUnavailableError: vi.fn((error: unknown) => error === "unavailable"),
  getMqttExtensionSnapshots: vi.fn(),
}))

vi.mock("../packages/core/src/yeonjang/mqtt-client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../packages/core/src/yeonjang/mqtt-client.js")>()
  return {
    ...actual,
    getYeonjangCapabilities,
    invokeYeonjangMethod,
    isYeonjangUnavailableError,
    DEFAULT_YEONJANG_EXTENSION_ID: "yeonjang-main",
  }
})

vi.mock("../packages/core/src/mqtt/broker.js", () => ({
  getMqttExtensionSnapshots,
}))

const { screenCaptureTool } = await import("../packages/core/src/tools/builtin/ui/screen.ts")
const { yeonjangBroadcastRunTool } = await import("../packages/core/src/tools/builtin/yeonjang-broadcast.ts")
const { createYeonjangCommandDispatch } = await import("../packages/core/src/yeonjang/mqtt-client.ts")

const previousStateDir = process.env["KNOWBEE_STATE_DIR"]
const previousConfig = process.env["KNOWBEE_CONFIG"]
const tempDirs: string[] = []
let observedBase = 0

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
  const stateDir = mkdtempSync(join(tmpdir(), "knowbee-task010-yeonjang-e2e-"))
  tempDirs.push(stateDir)
  process.env["KNOWBEE_STATE_DIR"] = stateDir
  delete process.env["KNOWBEE_CONFIG"]
  reloadConfig()
}

function seedObservation(overrides: Partial<Parameters<typeof upsertYeonjangRegistryObservation>[0]> = {}) {
  const observedAt = overrides.observedAt ?? Date.now()
  return upsertYeonjangRegistryObservation({
    instanceId: overrides.instanceId ?? "inst-local",
    instanceAlias: overrides.instanceAlias ?? "local-main",
    displayName: overrides.displayName ?? "Local Main Console",
    nodeId: overrides.nodeId ?? "yeonjang-main",
    supportProfile: overrides.supportProfile ?? "desktop_interactive",
    platform: overrides.platform ?? "macos",
    arch: overrides.arch ?? "arm64",
    hostFingerprint: overrides.hostFingerprint ?? gatewayHostFingerprintRaw(),
    installFingerprint: overrides.installFingerprint ?? "install-local",
    sessionId: overrides.sessionId ?? "ys-inst-local-1000",
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
    },
    methodCount: overrides.methodCount ?? 1,
    startupMode: overrides.startupMode ?? "manual",
    windowMode: overrides.windowMode ?? "visible",
    trayState: overrides.trayState ?? "visible",
    workspaceScopeId: overrides.workspaceScopeId ?? "workspace:local-default",
    pairingFingerprint: overrides.pairingFingerprint ?? "pairing-fp-1",
    trustState: overrides.trustState ?? "trusted",
    observedAt,
  })
}

function createContext(userMessage = "연장 작업을 실행해줘"): ToolContext {
  return {
    sessionId: "session-task010",
    runId: "run-task010",
    requestGroupId: "request-group-task010",
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
  observedBase = Date.now()
  expect(seedObservation({
    instanceId: "inst-local",
    instanceAlias: "local-main",
    displayName: "Local Main Console",
    nodeId: "yeonjang-main",
    sessionId: "ys-inst-local-1000",
    workspaceScopeId: "workspace:local-default",
    trustState: "trusted",
    observedAt: observedBase,
  })).toEqual(expect.objectContaining({ ok: true }))
  expect(seedObservation({
    instanceId: "inst-win",
    instanceAlias: "windows-box",
    displayName: "Windows Review Console",
    nodeId: "yeonjang-win",
    platform: "windows",
    arch: "x64",
    hostFingerprint: "remote-host-win",
    installFingerprint: "install-win",
    sessionId: "ys-inst-win-1000",
    workspaceScopeId: "workspace:local-default",
    trustState: "trusted",
    observedAt: observedBase,
  })).toEqual(expect.objectContaining({ ok: true }))
  expect(seedObservation({
    instanceId: "inst-linux",
    instanceAlias: "linux-box",
    displayName: "Zulu Linux Console",
    nodeId: "yeonjang-linux",
    platform: "linux",
    arch: "x64",
    hostFingerprint: "remote-host-linux",
    installFingerprint: "install-linux",
    sessionId: "ys-inst-linux-1000",
    workspaceScopeId: "workspace:local-default",
    trustState: "trusted",
    observedAt: observedBase,
  })).toEqual(expect.objectContaining({ ok: true }))
  expect(seedObservation({
    instanceId: "inst-revoked",
    instanceAlias: "revoked-box",
    displayName: "Revoked Console",
    nodeId: "yeonjang-revoked",
    platform: "windows",
    arch: "x64",
    hostFingerprint: "remote-host-revoked",
    installFingerprint: "install-revoked",
    sessionId: "ys-inst-revoked-1000",
    workspaceScopeId: "workspace:local-default",
    trustState: "revoked",
    observedAt: observedBase,
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
      extensionId: "yeonjang-main",
      displayName: "Local Main Console",
      instanceId: "inst-local",
      instanceAlias: "local-main",
      state: "online",
      message: "ready",
      platform: "macos",
      methods: ["screen.capture"],
      sessionId: "ys-inst-local-1000",
      trustState: "trusted",
      lastSeenAt: observedBase,
    },
    {
      extensionId: "yeonjang-win",
      displayName: "Windows Review Console",
      instanceId: "inst-win",
      instanceAlias: "windows-box",
      state: "online",
      message: "ready",
      platform: "windows",
      methods: ["screen.capture"],
      sessionId: "ys-inst-win-1000",
      trustState: "trusted",
      lastSeenAt: observedBase,
    },
    {
      extensionId: "yeonjang-linux",
      displayName: "Zulu Linux Console",
      instanceId: "inst-linux",
      instanceAlias: "linux-box",
      state: "online",
      message: "ready",
      platform: "linux",
      methods: ["screen.capture"],
      sessionId: "ys-inst-linux-1000",
      trustState: "trusted",
      lastSeenAt: observedBase,
    },
    {
      extensionId: "yeonjang-revoked",
      displayName: "Revoked Console",
      instanceId: "inst-revoked",
      instanceAlias: "revoked-box",
      state: "online",
      message: "ready",
      platform: "windows",
      methods: ["screen.capture"],
      sessionId: "ys-inst-revoked-1000",
      trustState: "revoked",
      lastSeenAt: observedBase,
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

describe("task010 yeonjang multi-instance e2e", () => {
  it("routes an exact target to the intended remote instance and passes bound session metadata", async () => {
    invokeYeonjangMethod.mockResolvedValueOnce({
      base64_data: Buffer.from("png-windows").toString("base64"),
      mime_type: "image/png",
      file_name: "windows.png",
      file_extension: "png",
      size_bytes: 11,
      message: "windows ok",
    })

    const result = await screenCaptureTool.execute({
      targetSelector: { type: "instance_alias", instanceAlias: "windows-box" },
    }, createContext("windows-box 화면을 캡처해줘"))

    expect(result.success).toBe(true)
    expect(result.details).toEqual(expect.objectContaining({
      via: "yeonjang",
      extensionId: "yeonjang-win",
      instanceId: "inst-win",
      targetSessionId: "ys-inst-win-1000",
      selectionStatus: "exact_match",
    }))
    expect(invokeYeonjangMethod).toHaveBeenCalledWith(
      "screen.capture",
      expect.objectContaining({
        inline_base64: true,
      }),
      expect.objectContaining({
        extensionId: "yeonjang-win",
        metadata: expect.objectContaining({
          targetSessionId: "ys-inst-win-1000",
          runId: "run-task010",
          requestGroupId: "request-group-task010",
        }),
      }),
    )
  })

  it("fails with ambiguity for local selector when multiple local candidates are present", () => {
    expect(seedObservation({
      instanceId: "inst-local-side",
      instanceAlias: "local-side",
      displayName: "Local Side Console",
      nodeId: "yeonjang-local-side",
      sessionId: "ys-inst-local-side-1000",
      hostFingerprint: gatewayHostFingerprintRaw(),
      installFingerprint: "install-local-side",
      observedAt: observedBase + 500,
    })).toEqual(expect.objectContaining({ ok: true }))

    const selection = resolveYeonjangTargetSelection({
      targetSelector: { type: "local" },
    })

    expect(selection).toEqual(expect.objectContaining({
      ok: false,
      status: "ambiguous_state",
      uiAction: "ui_selection",
    }))
    expect(selection.proof.candidateList).toHaveLength(2)
  })

  it("blocks revoked targets and does not fall back to another online instance", async () => {
    const result = await screenCaptureTool.execute({
      targetSelector: { type: "instance_alias", instanceAlias: "revoked-box" },
    }, createContext("revoked-box 화면을 캡처해줘"))

    expect(result.success).toBe(false)
    expect(result.error).toBe("YEONJANG_TARGET_UNAVAILABLE")
    expect(String(result.output)).toContain("신뢰가 철회")
    expect(invokeYeonjangMethod).not.toHaveBeenCalled()
  })

  it("keeps a replaced live session active, rejects duplicate install claims, and marks stale selections", () => {
    const initialSelection = resolveYeonjangTargetSelection({
      targetSelector: { type: "instance_alias", instanceAlias: "windows-box" },
    })
    expect(initialSelection).toEqual(expect.objectContaining({
      ok: true,
      targetSessionId: "ys-inst-win-1000",
    }))

    expect(seedObservation({
      instanceId: "inst-win",
      instanceAlias: "windows-box",
      displayName: "Windows Review Console",
      nodeId: "yeonjang-win",
      platform: "windows",
      arch: "x64",
      hostFingerprint: "remote-host-win",
      installFingerprint: "install-win",
      sessionId: "ys-inst-win-2000",
      workspaceScopeId: "workspace:local-default",
      trustState: "trusted",
      observedAt: observedBase + 1_000,
    })).toEqual(expect.objectContaining({
      ok: true,
      claimOutcome: "replaced",
      replacedSessionIds: ["ys-inst-win-1000"],
    }))

    const staleSelection = revalidateYeonjangTargetSelection({
      selection: initialSelection,
    })
    expect(staleSelection).toEqual(expect.objectContaining({
      ok: false,
      status: "stale_target",
    }))

    expect(seedObservation({
      instanceId: "inst-win",
      instanceAlias: "windows-box",
      displayName: "Windows Review Console",
      nodeId: "yeonjang-win",
      platform: "windows",
      arch: "x64",
      hostFingerprint: "remote-host-rogue",
      installFingerprint: "install-rogue",
      sessionId: "ys-inst-win-3000",
      clientId: "client-rogue",
      workspaceScopeId: "workspace:local-default",
      trustState: "trusted",
      observedAt: observedBase + 2_000,
    })).toEqual(expect.objectContaining({
      ok: true,
      claimOutcome: "quarantined",
      reasonCode: "duplicate_instance_conflict:install_fingerprint_mismatch",
    }))

    const current = listYeonjangRegistryInstances({ now: observedBase + 2_000 }).find((item) => item.instanceId === "inst-win")
    expect(current?.session?.sessionId).toBe("ys-inst-win-2000")

  })

  it("retries only incomplete broadcast targets and preserves artifact namespaces", async () => {
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
        base64_data: Buffer.from("png-win").toString("base64"),
        mime_type: "image/png",
        file_name: "win.png",
        file_extension: "png",
        size_bytes: 7,
        message: "win ok",
      })
      .mockRejectedValueOnce(new Error("timed out"))

    const first = await yeonjangBroadcastRunTool.execute({
      toolName: "screen_capture",
      targetSelector: { type: "all_online" },
      broadcastIntent: { confirm: true },
    }, createContext("모든 연장 화면을 캡처해줘"))

    expect(first.success).toBe(true)
    expect(first.details).toEqual(expect.objectContaining({
      kind: "yeonjang_broadcast_result",
      summaryReceipt: expect.objectContaining({
        successCount: 2,
        failedCount: 1,
        partialSuccess: true,
      }),
    }))
    expect(first.details?.skippedTargets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        instanceId: "inst-revoked",
        reasonCodes: expect.arrayContaining(["target_trust_revoked"]),
      }),
    ]))
    const firstReceipts = (first.details?.targetReceipts ?? []) as Array<Record<string, unknown>>
    const failedReceipt = firstReceipts.find((receipt) => receipt["status"] === "failed")
    expect(failedReceipt).toBeTruthy()
    const succeededReceipts = firstReceipts.filter((receipt) => receipt["status"] === "succeeded")
    expect(succeededReceipts.every((receipt) => {
      const path = String(receipt["artifactPath"] ?? "")
      return path.includes(String(first.details?.broadcastRunId))
        && path.includes(String(receipt["instanceId"]))
        && path.includes(String(receipt["sessionId"]))
    })).toBe(true)

    invokeYeonjangMethod.mockReset().mockResolvedValueOnce({
      base64_data: Buffer.from("png-linux-retry").toString("base64"),
      mime_type: "image/png",
      file_name: "linux-retry.png",
      file_extension: "png",
      size_bytes: 15,
      message: "linux retry ok",
    })

    const second = await yeonjangBroadcastRunTool.execute({
      toolName: "screen_capture",
      targetSelector: { type: "all_online" },
      broadcastIntent: { confirm: true },
      retryReceipt: {
        previousBroadcastRunId: String(first.details?.broadcastRunId),
        targetReceipts: [
          ...firstReceipts.map((receipt) => ({
            instanceId: String(receipt["instanceId"]),
            extensionId: String(receipt["extensionId"]),
            status: receipt["status"] === "succeeded" ? "succeeded" : "failed",
          })),
        ],
        skippedTargets: [
          ...((first.details?.skippedTargets ?? []) as Array<Record<string, unknown>>).map((target) => ({
            instanceId: String(target["instanceId"]),
            extensionId: String(target["extensionId"]),
            reasonCodes: Array.isArray(target["reasonCodes"]) ? target["reasonCodes"] as string[] : [],
          })),
        ],
      },
    }, createContext("실패한 연장만 다시 캡처해줘"))

    expect(second.success).toBe(true)
    expect(invokeYeonjangMethod).toHaveBeenCalledTimes(1)
    expect(invokeYeonjangMethod).toHaveBeenCalledWith(
      "screen.capture",
      expect.objectContaining({
        inline_base64: true,
      }),
      expect.objectContaining({
        extensionId: failedReceipt?.["extensionId"],
      }),
    )
    expect(second.details).toEqual(expect.objectContaining({
      retryReceipt: expect.objectContaining({
        requested: true,
        retryMode: "failed_only",
      }),
      summaryReceipt: expect.objectContaining({
        retryRequested: true,
        retrySkippedSucceededCount: expect.any(Number),
      }),
    }))
  })

  it("keeps command identity stable while rotating delivery ids for repeated sends", () => {
    const first = createYeonjangCommandDispatch("screen.capture", { display: 0 }, {
      extensionId: "yeonjang-win",
      metadata: {
        commandId: "command-fixed",
        targetSessionId: "ys-inst-win-2000",
      },
    })
    const second = createYeonjangCommandDispatch("screen.capture", { display: 0 }, {
      extensionId: "yeonjang-win",
      metadata: {
        commandId: "command-fixed",
        targetSessionId: "ys-inst-win-2000",
      },
    })

    expect(first.commandId).toBe("command-fixed")
    expect(first.commandId).toBe(second.commandId)
    expect(first.idempotencyKey).toBe(second.idempotencyKey)
    expect(first.deliveryId).not.toBe(second.deliveryId)
  })
})
