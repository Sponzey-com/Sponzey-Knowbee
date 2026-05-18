import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { reloadConfig } from "../packages/core/src/config/index.js"
import { validateToolTargetContract, CONTRACT_SCHEMA_VERSION } from "../packages/core/src/contracts/index.ts"
import { closeDb } from "../packages/core/src/db/index.js"
import {
  revalidateYeonjangTargetSelection,
  resolveYeonjangTargetSelection,
} from "../packages/core/src/tools/builtin/yeonjang-target.ts"
import { upsertYeonjangRegistryObservation } from "../packages/core/src/yeonjang/registry.ts"

const previousStateDir = process.env["NOBIE_STATE_DIR"]
const previousConfig = process.env["NOBIE_CONFIG"]
const tempDirs: string[] = []

function useTempState(): void {
  closeDb()
  const stateDir = mkdtempSync(join(tmpdir(), "nobie-task003-yeonjang-target-"))
  tempDirs.push(stateDir)
  process.env["NOBIE_STATE_DIR"] = stateDir
  delete process.env["NOBIE_CONFIG"]
  reloadConfig()
}

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
    process.env["NOBIE_HOSTNAME"]?.trim()
    || process.env["COMPUTERNAME"]?.trim()
    || process.env["HOSTNAME"]?.trim()
    || "localhost"
  const os = process.platform === "darwin" ? "macos" : process.platform === "win32" ? "windows" : process.platform
  const arch = process.arch === "x64" ? "x86_64" : process.arch === "arm64" ? "aarch64" : process.arch === "ia32" ? "x86" : process.arch
  return stableHexHash(`${hostname}|${os}|${arch}`)
}

function seedObservation(overrides: Partial<Parameters<typeof upsertYeonjangRegistryObservation>[0]> = {}) {
  const observedAt = overrides.observedAt ?? Date.now()
  return upsertYeonjangRegistryObservation({
    instanceId: overrides.instanceId ?? "inst-local-1",
    instanceAlias: overrides.instanceAlias ?? "local-box",
    displayName: overrides.displayName ?? "Local Control Terminal",
    nodeId: overrides.nodeId ?? "yeonjang-main",
    supportProfile: overrides.supportProfile ?? "desktop_interactive",
    platform: overrides.platform ?? "macos",
    arch: overrides.arch ?? "arm64",
    hostFingerprint: overrides.hostFingerprint ?? gatewayHostFingerprintRaw(),
    installFingerprint: overrides.installFingerprint ?? "install-local-001",
    sessionId: overrides.sessionId ?? "sess-local-1",
    clientId: overrides.clientId ?? "client-local-1",
    connectionState: overrides.connectionState ?? "online",
    message: overrides.message ?? "ready",
    version: overrides.version ?? "0.1.0",
    protocolVersion: overrides.protocolVersion ?? "2026-04-16.capability-matrix.v1",
    capabilityHash: overrides.capabilityHash ?? "cap-local-1",
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
    trustState: overrides.trustState ?? "trusted",
    observedAt,
  })
}

beforeEach(() => {
  useTempState()
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

describe("task003 yeonjang target selector", () => {
  it("validates structured extension target selectors in the shared tool target contract", () => {
    const valid = validateToolTargetContract({
      schemaVersion: CONTRACT_SCHEMA_VERSION,
      kind: "extension",
      selector: {
        type: "instance_alias",
        instanceAlias: "windows-test-pc",
      },
    })
    expect(valid.ok).toBe(true)

    const invalid = validateToolTargetContract({
      schemaVersion: CONTRACT_SCHEMA_VERSION,
      kind: "extension",
      selector: {
        type: "call_name",
        callName: "all-online",
      },
    })
    expect(invalid.ok).toBe(false)
    expect(invalid.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "$.selector.callName" }),
    ]))
  })

  it("resolves exact instance alias selectors and records target resolution proof", () => {
    expect(seedObservation({
      instanceId: "inst-remote",
      instanceAlias: "windows-test-pc",
      displayName: "Windows Operator Console",
      nodeId: "yeonjang-windows",
      supportProfile: "desktop_interactive",
      platform: "windows",
      arch: "x64",
      hostFingerprint: "remote-host-1",
      installFingerprint: "install-remote-1",
      sessionId: "sess-remote-1",
    })).toEqual(expect.objectContaining({ ok: true }))

    const result = resolveYeonjangTargetSelection({
      targetSelector: {
        type: "instance_alias",
        instanceAlias: "windows-test-pc",
      },
    })

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      status: "exact_match",
      extensionId: "yeonjang-windows",
      instanceId: "inst-remote",
      targetSessionId: "sess-remote-1",
    }))
    expect(result.proof).toEqual(expect.objectContaining({
      selectorSource: "structured_target_selector",
      matchedField: "instance_alias",
      matchedInstanceId: "inst-remote",
      matchedExtensionId: "yeonjang-windows",
      matchedSessionId: "sess-remote-1",
      validationResults: expect.objectContaining({
        selector: "pass",
        availability: "pass",
        sessionBinding: "pass",
      }),
    }))
  })

  it("resolves exact call_name selectors through the shared call-name namespace", () => {
    expect(seedObservation({
      instanceId: "inst-display-name",
      instanceAlias: "remote-node-a",
      displayName: "Windows Test PC",
      nodeId: "yeonjang-windows-a",
      supportProfile: "desktop_interactive",
      platform: "windows",
      arch: "x64",
      hostFingerprint: "remote-host-a",
      installFingerprint: "install-remote-a",
      sessionId: "sess-remote-a",
    })).toEqual(expect.objectContaining({ ok: true }))

    const result = resolveYeonjangTargetSelection({
      targetSelector: {
        type: "call_name",
        callName: "windows test pc",
      },
    })

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      status: "exact_match",
      extensionId: "yeonjang-windows-a",
      instanceId: "inst-display-name",
    }))
    expect(result.proof.matchedField).toBe("call_name")
    expect(result.proof.selectorSerialized).toBe("call-name:windows-test-pc")
  })

  it("fails with ambiguity when explicit local selector matches more than one local candidate", () => {
    expect(seedObservation({
      instanceId: "inst-local-1",
      instanceAlias: "local-primary",
      displayName: "Local Primary Console",
      nodeId: "yeonjang-main",
      sessionId: "sess-local-1",
    })).toEqual(expect.objectContaining({ ok: true }))
    expect(seedObservation({
      instanceId: "inst-local-2",
      instanceAlias: "local-secondary",
      displayName: "Local Secondary Console",
      nodeId: "yeonjang-secondary-local",
      sessionId: "sess-local-2",
      hostFingerprint: gatewayHostFingerprintRaw(),
      installFingerprint: "install-local-002",
    })).toEqual(expect.objectContaining({ ok: true }))

    const result = resolveYeonjangTargetSelection({
      targetSelector: { type: "local" },
    })

    expect(result).toEqual(expect.objectContaining({
      ok: false,
      status: "ambiguous_state",
      uiAction: "ui_selection",
    }))
    expect(result.proof.candidateList).toHaveLength(2)
    expect(result.proof.validationResults.selectorMode).toBe("pass")
  })

  it("blocks offline explicit targets without falling back to another online instance", () => {
    expect(seedObservation({
      instanceId: "inst-online-local",
      instanceAlias: "local-primary",
      displayName: "Local Primary Console",
      nodeId: "yeonjang-main",
      sessionId: "sess-online-local",
    })).toEqual(expect.objectContaining({ ok: true }))
    expect(seedObservation({
      instanceId: "inst-offline-remote",
      instanceAlias: "offline-worker",
      displayName: "Offline Remote Console",
      nodeId: "yeonjang-offline",
      sessionId: "sess-offline",
      connectionState: "offline",
      observedAt: Date.now(),
    })).toEqual(expect.objectContaining({ ok: true }))

    const result = resolveYeonjangTargetSelection({
      targetSelector: {
        type: "instance_id",
        instanceId: "inst-offline-remote",
      },
    })

    expect(result).toEqual(expect.objectContaining({
      ok: false,
      status: "target_unavailable",
      extensionId: "yeonjang-offline",
      instanceId: "inst-offline-remote",
    }))
    expect(result.reasonCodes).toContain("target_state_offline")
    expect(result.proof.matchedExtensionId).toBe("yeonjang-offline")
  })

  it("rejects broadcast selectors for single-target execution", () => {
    const result = resolveYeonjangTargetSelection({
      targetSelector: {
        type: "all_online",
      },
    })

    expect(result).toEqual(expect.objectContaining({
      ok: false,
      status: "unsupported_selector_mode",
    }))
    expect(result.reasonCodes).toContain("broadcast_selector_not_supported_in_single_target_tool")
  })

  it("blocks trust-pending and trust-revoked exact targets without fallback", () => {
    const pending = resolveYeonjangTargetSelection({
      targetSelector: {
        type: "instance_alias",
        instanceAlias: "pending-worker",
      },
      snapshots: [
        {
          extensionId: "yeonjang-pending",
          clientId: "client-pending",
          displayName: "Pending Worker Console",
          instanceId: "inst-pending",
          instanceAlias: "pending-worker",
          nodeId: "yeonjang-pending",
          supportProfile: "desktop_interactive",
          trustState: "pending",
          state: "online",
          message: "trust pending",
          version: "0.1.0",
          methods: ["screen.capture"],
          sessionId: "sess-pending",
          lastSeenAt: Date.now(),
        },
        {
          extensionId: "yeonjang-main",
          clientId: "client-local",
          displayName: "Local Primary Console",
          instanceId: "inst-local",
          instanceAlias: "local-primary",
          nodeId: "yeonjang-main",
          supportProfile: "desktop_interactive",
          trustState: "trusted",
          state: "online",
          message: "ready",
          version: "0.1.0",
          methods: ["screen.capture"],
          sessionId: "sess-local",
          lastSeenAt: Date.now(),
        },
      ],
    })
    expect(pending).toEqual(expect.objectContaining({
      ok: false,
      status: "target_unavailable",
      extensionId: "yeonjang-pending",
      instanceId: "inst-pending",
    }))
    expect(pending.reasonCodes).toContain("target_trust_pending")
    expect(pending.proof.validationResults.trust).toBe("fail")

    const revoked = resolveYeonjangTargetSelection({
      targetSelector: {
        type: "instance_alias",
        instanceAlias: "revoked-worker",
      },
      snapshots: [
        {
          extensionId: "yeonjang-revoked",
          clientId: "client-revoked",
          displayName: "Revoked Worker Console",
          instanceId: "inst-revoked",
          instanceAlias: "revoked-worker",
          nodeId: "yeonjang-revoked",
          supportProfile: "desktop_interactive",
          trustState: "revoked",
          state: "online",
          message: "trust revoked",
          version: "0.1.0",
          methods: ["screen.capture"],
          sessionId: "sess-revoked",
          lastSeenAt: Date.now(),
        },
      ],
    })
    expect(revoked).toEqual(expect.objectContaining({
      ok: false,
      status: "target_unavailable",
      extensionId: "yeonjang-revoked",
      instanceId: "inst-revoked",
    }))
    expect(revoked.reasonCodes).toContain("target_trust_pending")
    expect(revoked.proof.validationResults.trust).toBe("fail")
  })

  it("fails with stale_target when the explicit target session changes before execution", () => {
    expect(seedObservation({
      instanceId: "inst-remote",
      instanceAlias: "windows-test-pc",
      displayName: "Windows Operator Console",
      nodeId: "yeonjang-windows",
      supportProfile: "desktop_interactive",
      platform: "windows",
      arch: "x64",
      hostFingerprint: "remote-host-2",
      installFingerprint: "install-remote-2",
      sessionId: "sess-remote-old",
    })).toEqual(expect.objectContaining({ ok: true }))

    const initial = resolveYeonjangTargetSelection({
      targetSelector: {
        type: "instance_alias",
        instanceAlias: "windows-test-pc",
      },
    })
    expect(initial.ok).toBe(true)
    expect(initial.targetSessionId).toBe("sess-remote-old")

    expect(seedObservation({
      instanceId: "inst-remote",
      instanceAlias: "windows-test-pc",
      displayName: "Windows Operator Console",
      nodeId: "yeonjang-windows",
      supportProfile: "desktop_interactive",
      platform: "windows",
      arch: "x64",
      hostFingerprint: "remote-host-2",
      installFingerprint: "install-remote-2",
      sessionId: "sess-remote-new",
      observedAt: Date.now() + 10,
    })).toEqual(expect.objectContaining({ ok: true }))

    const rebound = revalidateYeonjangTargetSelection({ selection: initial })
    expect(rebound).toEqual(expect.objectContaining({
      ok: false,
      status: "stale_target",
      extensionId: "yeonjang-windows",
      instanceId: "inst-remote",
    }))
    expect(rebound.reasonCodes).toContain("stale_target_session_mismatch")
    expect(rebound.proof.expectedTargetSessionId).toBe("sess-remote-old")
    expect(rebound.proof.matchedSessionId).toBe("sess-remote-new")
    expect(rebound.proof.validationResults.sessionBinding).toBe("fail")
  })
})
