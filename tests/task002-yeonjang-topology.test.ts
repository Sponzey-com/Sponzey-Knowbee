import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { reloadConfig } from "../packages/core/src/config/index.js"
import { closeDb } from "../packages/core/src/db/index.js"
import type { MqttExtensionSnapshot } from "../packages/core/src/mqtt/broker.ts"
import {
  buildYeonjangFleetProjection,
  normalizeYeonjangSupportProfile,
  resolveYeonjangDefaultTargetSelection,
} from "../packages/core/src/yeonjang/topology.ts"
import { upsertYeonjangRegistryObservation } from "../packages/core/src/yeonjang/registry.ts"

const previousStateDir = process.env["KNOWBEE_STATE_DIR"]
const previousConfig = process.env["KNOWBEE_CONFIG"]
const tempDirs: string[] = []

function useTempState(): void {
  closeDb()
  const stateDir = mkdtempSync(join(tmpdir(), "knowbee-task002-yeonjang-topology-"))
  tempDirs.push(stateDir)
  process.env["KNOWBEE_STATE_DIR"] = stateDir
  delete process.env["KNOWBEE_CONFIG"]
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
    process.env["KNOWBEE_HOSTNAME"]?.trim()
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
    ...(overrides.workspaceScopeId !== undefined ? { workspaceScopeId: overrides.workspaceScopeId } : {}),
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

describe("task002 yeonjang topology projection", () => {
  it("classifies local/remote/profile, builds diff summary, and emits prompt projection", () => {
    const now = Date.now()
    expect(seedObservation({
      instanceId: "inst-local",
      instanceAlias: "local-mac",
      displayName: "Primary Local Mac",
      nodeId: "yeonjang-main",
      hostFingerprint: gatewayHostFingerprintRaw(),
      installFingerprint: "install-local-a",
      version: "0.2.0",
      observedAt: now - 10,
    })).toEqual(expect.objectContaining({ ok: true }))
    expect(seedObservation({
      instanceId: "inst-remote",
      instanceAlias: "remote-linux",
      displayName: "Remote Linux Worker",
      nodeId: "yeonjang-remote",
      supportProfile: "headless_managed",
      platform: "linux",
      arch: "x64",
      hostFingerprint: "remote-host-fingerprint",
      installFingerprint: "install-remote-a",
      sessionId: "sess-remote-1",
      clientId: "client-remote-1",
      version: "0.3.0",
      observedAt: now - 30,
    })).toEqual(expect.objectContaining({ ok: true }))

    const snapshots: MqttExtensionSnapshot[] = [
      {
        extensionId: "yeonjang-main",
        clientId: "client-local-1",
        displayName: "Local Mac",
        instanceId: "inst-local",
        instanceAlias: "local-mac",
        nodeId: "yeonjang-main",
        supportProfile: "desktop_interactive",
        state: "online",
        message: "ready",
        version: "0.2.0",
        protocolVersion: "2026-04-16.capability-matrix.v1",
        buildTarget: "darwin-arm64",
        platform: "macos",
        os: "macos",
        arch: "arm64",
        methods: ["screen.capture", "application.launch"],
        sessionId: "sess-local-1",
        hostFingerprint: gatewayHostFingerprintRaw(),
        installFingerprint: "install-local-a",
        transport: ["mqtt-json"],
        lastSeenAt: now - 10,
      },
      {
        extensionId: "yeonjang-remote",
        clientId: "client-remote-1",
        displayName: "Remote Linux",
        instanceId: "inst-remote",
        instanceAlias: "remote-linux",
        nodeId: "yeonjang-remote",
        supportProfile: "headless_managed",
        state: "online",
        message: "ready",
        version: "0.3.0",
        protocolVersion: "2026-05-01.capability-matrix.v2",
        buildTarget: "linux-x64",
        platform: "linux",
        os: "linux",
        arch: "x64",
        methods: ["screen.capture", "system.exec"],
        sessionId: "sess-remote-1",
        hostFingerprint: "remote-host-fingerprint",
        installFingerprint: "install-remote-a",
        transport: ["mqtt-json"],
        lastSeenAt: now - 30,
      },
    ]

    const projection = buildYeonjangFleetProjection({ snapshots, now })
    const local = projection.instances.find((instance) => instance.instanceId === "inst-local")
    const remote = projection.instances.find((instance) => instance.instanceId === "inst-remote")
    const diff = projection.diffSummaries[0]

    expect(local).toEqual(expect.objectContaining({
      location: "local",
      localityConfidence: "high",
      supportProfile: "desktop_interactive",
      interactiveDesktop: true,
      trayWindowExpected: true,
      defaultTargetEligible: true,
    }))
    expect(remote).toEqual(expect.objectContaining({
      location: "remote",
      supportProfile: "headless_managed",
      interactiveDesktop: false,
      trayWindowExpected: false,
      defaultTargetEligible: false,
    }))
    expect(projection.summary).toEqual(expect.objectContaining({
      totalInstances: 2,
      localInstances: 1,
      remoteInstances: 1,
      supportProfiles: {
        desktopInteractive: 1,
        desktopLimited: 0,
        headlessManaged: 1,
      },
      defaultTarget: expect.objectContaining({
        ok: true,
        status: "auto_selected_local_interactive",
      }),
    }))
    expect(diff).toEqual(expect.objectContaining({
      localInstanceId: "inst-local",
      remoteInstanceId: "inst-remote",
      reasonCodes: expect.arrayContaining([
        "version_mismatch",
        "protocol_version_mismatch",
        "build_target_mismatch",
        "platform_mismatch",
        "missing_capability_on_remote",
        "missing_capability_on_local",
      ]),
      supportedMethods: {
        localOnly: ["application.launch"],
        remoteOnly: ["system.exec"],
      },
    }))
    expect(projection.promptProjection).toEqual(expect.objectContaining({
      registrySummary: expect.objectContaining({
        localInstances: 1,
        remoteInstances: 1,
      }),
      exactTargetCandidates: [
        expect.objectContaining({
          instanceId: "inst-local",
          nodeId: "yeonjang-main",
          location: "local",
          supportProfile: "desktop_interactive",
          defaultTargetEligible: true,
        }),
      ],
    }))
  })

  it("refuses remote-only auto selection unless a pinned remote default is present", () => {
    const now = Date.now()
    expect(seedObservation({
      instanceId: "inst-remote-only",
      instanceAlias: "remote-only",
      displayName: "Pinned Remote Worker",
      nodeId: "yeonjang-remote-only",
      supportProfile: "desktop_interactive",
      platform: "windows",
      arch: "x64",
      hostFingerprint: "remote-only-host",
      installFingerprint: "install-remote-only",
      sessionId: "sess-remote-only",
      clientId: "client-remote-only",
      workspaceScopeId: "workspace:local-default",
      trustState: "trusted",
      observedAt: now,
    })).toEqual(expect.objectContaining({ ok: true }))

    const snapshots: MqttExtensionSnapshot[] = [{
      extensionId: "yeonjang-remote-only",
      clientId: "client-remote-only",
      displayName: "Remote Only",
      instanceId: "inst-remote-only",
      instanceAlias: "remote-only",
      nodeId: "yeonjang-remote-only",
      supportProfile: "desktop_interactive",
      state: "online",
      message: "ready",
      version: "0.2.0",
      protocolVersion: "2026-04-16.capability-matrix.v1",
      buildTarget: "windows-x64",
      platform: "windows",
      os: "windows",
      arch: "x64",
      methods: ["screen.capture"],
      sessionId: "sess-remote-only",
      hostFingerprint: "remote-only-host",
      installFingerprint: "install-remote-only",
      transport: ["mqtt-json"],
      lastSeenAt: now,
    }]

    expect(resolveYeonjangDefaultTargetSelection({ snapshots, now })).toEqual(expect.objectContaining({
      ok: false,
      status: "selection_required",
      reasonCodes: ["remote_only_requires_explicit_selection"],
    }))

    expect(resolveYeonjangDefaultTargetSelection({
      snapshots,
      now,
      pinnedDefaultRemoteInstanceId: "inst-remote-only",
    })).toEqual(expect.objectContaining({
      ok: true,
      status: "auto_selected_pinned_remote",
      extensionId: "yeonjang-remote-only",
      instanceId: "inst-remote-only",
    }))
  })

  it("marks multiple local instances as ambiguous instead of auto-selecting", () => {
    const now = Date.now()
    expect(seedObservation({
      instanceId: "inst-local-a",
      instanceAlias: "local-a",
      displayName: "Local Alpha",
      nodeId: "yeonjang-main",
      hostFingerprint: gatewayHostFingerprintRaw(),
      installFingerprint: "install-local-a",
      sessionId: "sess-local-a",
      observedAt: now,
    })).toEqual(expect.objectContaining({ ok: true }))
    expect(seedObservation({
      instanceId: "inst-local-b",
      instanceAlias: "local-b",
      displayName: "Local Beta",
      nodeId: "yeonjang-secondary-local",
      hostFingerprint: gatewayHostFingerprintRaw(),
      installFingerprint: "install-local-b",
      sessionId: "sess-local-b",
      observedAt: now + 1,
    })).toEqual(expect.objectContaining({ ok: true }))

    const snapshots: MqttExtensionSnapshot[] = [
      {
        extensionId: "yeonjang-main",
        clientId: "client-local-a",
        displayName: "Local A",
        instanceId: "inst-local-a",
        instanceAlias: "local-a",
        nodeId: "yeonjang-main",
        supportProfile: "desktop_interactive",
        state: "online",
        message: "ready",
        version: "0.2.0",
        protocolVersion: "2026-04-16.capability-matrix.v1",
        platform: "macos",
        os: "macos",
        arch: "arm64",
        methods: ["screen.capture"],
        sessionId: "sess-local-a",
        hostFingerprint: gatewayHostFingerprintRaw(),
        installFingerprint: "install-local-a",
        transport: ["mqtt-json"],
        lastSeenAt: now,
      },
      {
        extensionId: "yeonjang-secondary-local",
        clientId: "client-local-b",
        displayName: "Local B",
        instanceId: "inst-local-b",
        instanceAlias: "local-b",
        nodeId: "yeonjang-secondary-local",
        supportProfile: "desktop_interactive",
        state: "online",
        message: "ready",
        version: "0.2.0",
        protocolVersion: "2026-04-16.capability-matrix.v1",
        platform: "macos",
        os: "macos",
        arch: "arm64",
        methods: ["screen.capture"],
        sessionId: "sess-local-b",
        hostFingerprint: gatewayHostFingerprintRaw(),
        installFingerprint: "install-local-b",
        transport: ["mqtt-json"],
        lastSeenAt: now + 1,
      },
    ]

    const selection = resolveYeonjangDefaultTargetSelection({ snapshots, now })
    expect(selection).toEqual(expect.objectContaining({
      ok: true,
      status: "auto_selected_local_interactive",
      instanceId: "inst-local-a",
      reasonCodes: ["trusted_local_marker"],
    }))
    expect(normalizeYeonjangSupportProfile("HEADLESS_MANAGED")).toBe("headless_managed")
  })
})
