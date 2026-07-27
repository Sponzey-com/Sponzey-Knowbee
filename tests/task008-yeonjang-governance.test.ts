import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"
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
import { getYeonjangGatewayHostFingerprint } from "../packages/core/src/yeonjang/runtime-identity.ts"
import { resolveYeonjangTargetSelection } from "../packages/core/src/tools/builtin/yeonjang-target.ts"

const tempDirs: string[] = []

function useTempState(): void {
  closeDb()
  const stateDir = mkdtempSync(join(tmpdir(), "knowbee-task008-yeonjang-governance-"))
  tempDirs.push(stateDir)
  initializeTestDbRuntime(stateDir)
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
    hostFingerprint: overrides.hostFingerprint ?? getYeonjangGatewayHostFingerprint(),
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
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task008 yeonjang governance", () => {
  it("allows a locally auto-trusted instance to verify a newly configured pairing secret", () => {
    expect(seedObservation({
      pairingFingerprint: hashYeonjangPairingSecret("local-browser-focus-secret"),
    })).toEqual(expect.objectContaining({ ok: true }))

    const before = listYeonjangRegistryInstances().find((item) => item.instanceId === "inst-local-1")
    expect(before).toEqual(expect.objectContaining({
      trustState: "trusted",
      trustReason: "auto_local_identity",
    }))

    expect(approveYeonjangInstancePairing({
      instanceId: "inst-local-1",
      pairingSecret: "local-browser-focus-secret",
      actor: "webui:operator",
      reason: "browser_focus_signer_provisioning",
    })).toEqual(expect.objectContaining({
      ok: true,
      extensionId: "yeonjang-main",
      trustState: "trusted",
    }))
  })

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
