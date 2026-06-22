import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { reloadConfig } from "../packages/core/src/config/index.js"
import { closeDb } from "../packages/core/src/db/index.js"
import {
  approveYeonjangInstancePairing,
  assignYeonjangLocalMarker,
  hashYeonjangPairingSecret,
  listYeonjangRegistryInstances,
  renameYeonjangRegistryInstance,
  updateYeonjangInstanceTrustState,
  upsertYeonjangRegistryObservation,
} from "../packages/core/src/yeonjang/registry.ts"
import {
  buildYeonjangFleetProjection,
  resolveYeonjangDefaultTargetSelection,
} from "../packages/core/src/yeonjang/topology.ts"
import { resolveYeonjangTargetSelection } from "../packages/core/src/tools/builtin/yeonjang-target.ts"

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
  const stateDir = mkdtempSync(join(tmpdir(), "knowbee-task008-yeonjang-governance-"))
  tempDirs.push(stateDir)
  process.env["KNOWBEE_STATE_DIR"] = stateDir
  delete process.env["KNOWBEE_CONFIG"]
  reloadConfig()
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
    ...(overrides.workspaceScopeId !== undefined ? { workspaceScopeId: overrides.workspaceScopeId } : {}),
    ...(overrides.pairingFingerprint !== undefined ? { pairingFingerprint: overrides.pairingFingerprint } : {}),
    ...(overrides.trustState !== undefined ? { trustState: overrides.trustState } : {}),
    observedAt,
  })
}

beforeEach(() => {
  useTempState()
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

describe("task008 yeonjang governance", () => {
  it("keeps remote instances pending until pairing secret approval succeeds", () => {
    expect(seedObservation()).toEqual(expect.objectContaining({ ok: true }))
    expect(seedObservation({
      instanceId: "inst-remote",
      instanceAlias: "windows-test-pc",
      displayName: "Windows Operator Console",
      nodeId: "yeonjang-windows",
      hostFingerprint: "remote-host-1",
      installFingerprint: "install-remote-1",
      sessionId: "sess-remote-1",
      platform: "windows",
      arch: "x64",
      workspaceScopeId: "workspace:local-default",
      pairingFingerprint: hashYeonjangPairingSecret("pair-me"),
    })).toEqual(expect.objectContaining({ ok: true }))

    const before = listYeonjangRegistryInstances()
    expect(before.find((item) => item.instanceId === "inst-local-1")).toEqual(expect.objectContaining({
      trustState: "trusted",
      scopeAccess: "allowed",
      runnableTarget: true,
    }))
    expect(before.find((item) => item.instanceId === "inst-remote")).toEqual(expect.objectContaining({
      trustState: "pending",
      scopeAccess: "allowed",
      runnableTarget: false,
      runnableReasonCodes: expect.arrayContaining(["target_trust_pending"]),
    }))

    const selectionBefore = resolveYeonjangTargetSelection({
      targetSelector: { type: "instance_alias", instanceAlias: "windows-test-pc" },
    })
    expect(selectionBefore).toEqual(expect.objectContaining({
      ok: false,
      status: "target_unavailable",
      reasonCodes: expect.arrayContaining(["target_trust_pending"]),
    }))

    expect(approveYeonjangInstancePairing({
      instanceId: "inst-remote",
      pairingSecret: "wrong-secret",
      actor: "webui:operator",
    })).toEqual(expect.objectContaining({
      ok: false,
      code: "invalid_pairing_secret",
    }))

    expect(approveYeonjangInstancePairing({
      instanceId: "inst-remote",
      pairingSecret: "pair-me",
      actor: "webui:operator",
      ownerUserId: "user:alice",
      workspaceScopeId: "workspace:local-default",
      reason: "approved for test",
    })).toEqual(expect.objectContaining({
      ok: true,
      trustState: "trusted",
    }))

    const selectionAfter = resolveYeonjangTargetSelection({
      targetSelector: { type: "instance_alias", instanceAlias: "windows-test-pc" },
    })
    expect(selectionAfter).toEqual(expect.objectContaining({
      ok: true,
      status: "exact_match",
      instanceId: "inst-remote",
      targetSessionId: "sess-remote-1",
    }))
  })

  it("isolates foreign workspace instances, preserves revoke on heartbeat, and reassigns local marker", () => {
    expect(seedObservation()).toEqual(expect.objectContaining({ ok: true }))
    expect(seedObservation({
      instanceId: "inst-foreign",
      instanceAlias: "foreign-box",
      displayName: "Foreign Review Terminal",
      nodeId: "yeonjang-foreign",
      hostFingerprint: "remote-host-2",
      installFingerprint: "install-remote-2",
      sessionId: "sess-foreign-1",
      platform: "windows",
      arch: "x64",
      workspaceScopeId: "workspace:foreign",
      trustState: "trusted",
    })).toEqual(expect.objectContaining({ ok: true }))
    expect(seedObservation({
      instanceId: "inst-review",
      instanceAlias: "review-box",
      displayName: "Review Control Terminal",
      nodeId: "yeonjang-review",
      hostFingerprint: "remote-host-3",
      installFingerprint: "install-remote-3",
      sessionId: "sess-review-1",
      platform: "linux",
      arch: "x64",
      workspaceScopeId: "workspace:local-default",
      trustState: "trusted",
    })).toEqual(expect.objectContaining({ ok: true }))

    const fleet = buildYeonjangFleetProjection()
    expect(fleet.instances.find((item) => item.instanceId === "inst-foreign")).toEqual(expect.objectContaining({
      scopeAccess: "foreign",
      runnableTarget: false,
      runnableReasonCodes: expect.arrayContaining(["workspace_scope_forbidden"]),
    }))
    expect(fleet.promptProjection.exactTargetCandidates.map((item) => item.instanceId)).not.toContain("inst-foreign")

    expect(updateYeonjangInstanceTrustState({
      instanceId: "inst-foreign",
      trustState: "revoked",
      actor: "webui:operator",
      reason: "revoked for test",
    })).toEqual(expect.objectContaining({
      ok: true,
      trustState: "revoked",
    }))
    expect(seedObservation({
      instanceId: "inst-foreign",
      instanceAlias: "foreign-box",
      displayName: "Foreign Review Terminal",
      nodeId: "yeonjang-foreign",
      hostFingerprint: "remote-host-2",
      installFingerprint: "install-remote-2",
      sessionId: "sess-foreign-2",
      platform: "linux",
      arch: "x64",
      workspaceScopeId: "workspace:foreign",
      trustState: "trusted",
    })).toEqual(expect.objectContaining({ ok: true }))

    expect(renameYeonjangRegistryInstance({
      instanceId: "inst-review",
      instanceAlias: "foreign-box",
      actor: "webui:operator",
    })).toEqual(expect.objectContaining({
      ok: false,
      code: "call_name_conflict",
    }))

    expect(assignYeonjangLocalMarker({
      instanceId: "inst-review",
      actor: "webui:operator",
      reason: "switch local baseline",
    })).toEqual(expect.objectContaining({ ok: true }))

    const instances = listYeonjangRegistryInstances()
    expect(instances.find((item) => item.instanceId === "inst-foreign")).toEqual(expect.objectContaining({
      trustState: "revoked",
    }))
    expect(instances.find((item) => item.instanceId === "inst-review")).toEqual(expect.objectContaining({
      localMarker: true,
      isLocalCandidate: true,
    }))

    expect(resolveYeonjangDefaultTargetSelection()).toEqual(expect.objectContaining({
      ok: true,
      instanceId: "inst-review",
      status: "auto_selected_local_interactive",
    }))
  })
})
