import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { closeDb } from "../packages/core/src/db/index.js"
import {
  getYeonjangRegistrySummary,
  listYeonjangRegistryInstances,
  normalizeYeonjangCallName,
  upsertYeonjangRegistryObservation,
} from "../packages/core/src/yeonjang/registry.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const tempDirs: string[] = []

function useTempState(): void {
  closeDb()
  const stateDir = mkdtempSync(join(tmpdir(), "knowbee-task001-yeonjang-registry-"))
  tempDirs.push(stateDir)
  initializeTestDbRuntime(stateDir)
}

function seedObservation(
  overrides: Partial<Parameters<typeof upsertYeonjangRegistryObservation>[0]> = {},
) {
  const observedAt = overrides.observedAt ?? Date.now()
  const instanceId = overrides.instanceId ?? "inst-local-1"
  return upsertYeonjangRegistryObservation({
    instanceId,
    instanceAlias: overrides.instanceAlias ?? "윈도우 테스트 PC",
    displayName: overrides.displayName ?? "Windows Test PC",
    nodeId: overrides.nodeId ?? "yeonjang-main",
    supportProfile: overrides.supportProfile ?? "desktop_interactive",
    platform: overrides.platform ?? "windows",
    arch: overrides.arch ?? "x64",
    hostFingerprint: overrides.hostFingerprint ?? `${instanceId}-host-fingerprint-raw`,
    installFingerprint: overrides.installFingerprint ?? `${instanceId}-install-fingerprint-raw`,
    sessionId: overrides.sessionId ?? "sess-1",
    clientId: overrides.clientId ?? "client-1",
    connectionState: overrides.connectionState ?? "online",
    message: overrides.message ?? "ready",
    version: overrides.version ?? "0.1.0",
    protocolVersion: overrides.protocolVersion ?? "2026-04-16.capability-matrix.v1",
    capabilityHash: overrides.capabilityHash ?? "cap-hash-1",
    transport: overrides.transport ?? ["mqtt-json"],
    permissions: overrides.permissions ?? {
      allow_screen_capture: true,
      allow_shell_exec: true,
      allow_mouse_control: true,
      allow_keyboard_control: true,
      allow_application_launch: true,
      allow_system_control: true,
    },
    toolHealth: overrides.toolHealth ?? {
      "screen.capture": { status: "ready" },
    },
    capabilityMatrix: overrides.capabilityMatrix ?? {
      "screen.capture": {
        supported: true,
        requiresPermission: true,
        permissionSetting: "allow_screen_capture",
      },
    },
    methodCount: overrides.methodCount ?? 1,
    startupMode: overrides.startupMode ?? "manual",
    windowMode: overrides.windowMode ?? "visible",
    trayState: overrides.trayState ?? "unknown",
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

describe("task001 yeonjang registry baseline", () => {
  it("normalizes call names by folding case and spacing separators", () => {
    expect(normalizeYeonjangCallName(" 윈도우 테스트_PC ")).toBe("윈도우-테스트-pc")
    expect(normalizeYeonjangCallName("Windows-Test PC")).toBe("windows-test-pc")
  })

  it("rejects reserved aliases and cross-instance call-name collisions", () => {
    const reserved = seedObservation({ instanceAlias: "local", displayName: "Local Box" })
    expect(reserved).toEqual(
      expect.objectContaining({
        ok: false,
        code: "reserved_call_name",
      }),
    )

    const reservedSelector = seedObservation({
      instanceId: "inst-selector",
      instanceAlias: "call_name",
      displayName: "Selector Box",
      sessionId: "sess-selector",
    })
    expect(reservedSelector).toEqual(
      expect.objectContaining({
        ok: false,
        code: "reserved_call_name",
      }),
    )

    const first = seedObservation({
      instanceId: "inst-a",
      instanceAlias: "윈도우 테스트 PC",
      displayName: "Primary Box",
      sessionId: "sess-a",
    })
    expect(first).toEqual(expect.objectContaining({ ok: true }))

    const collision = seedObservation({
      instanceId: "inst-b",
      instanceAlias: "backup-box",
      displayName: "윈도우-테스트-PC",
      sessionId: "sess-b",
      nodeId: "yeonjang-secondary",
    })
    expect(collision).toEqual(
      expect.objectContaining({
        ok: false,
        code: "call_name_conflict",
      }),
    )
  })

  it("projects online, offline, permission_required, and same-install restart replacement states", () => {
    const now = Date.now()
    expect(
      seedObservation({
        instanceId: "inst-online",
        instanceAlias: "online-box",
        displayName: "Online Control Box",
        sessionId: "sess-online",
        observedAt: now - 120_000,
      }),
    ).toEqual(expect.objectContaining({ ok: true }))

    expect(
      seedObservation({
        instanceId: "inst-permission",
        instanceAlias: "permission-box",
        displayName: "Permission Review Box",
        nodeId: "yeonjang-permission",
        sessionId: "sess-permission",
        observedAt: now,
        permissions: {
          allow_screen_capture: false,
          allow_shell_exec: true,
          allow_mouse_control: true,
          allow_keyboard_control: true,
          allow_application_launch: true,
          allow_system_control: true,
        },
      }),
    ).toEqual(expect.objectContaining({ ok: true }))

    expect(
      seedObservation({
        instanceId: "inst-restart",
        instanceAlias: "restart-box",
        displayName: "Restart Monitor Box",
        nodeId: "yeonjang-duplicate",
        sessionId: "ys-inst-restart-1000",
        observedAt: now,
        trustState: "trusted",
        workspaceScopeId: "workspace:local-default",
      }),
    ).toEqual(expect.objectContaining({ ok: true, claimOutcome: "accepted" }))
    expect(
      seedObservation({
        instanceId: "inst-restart",
        instanceAlias: "restart-box",
        displayName: "Restart Monitor Box",
        nodeId: "yeonjang-duplicate",
        sessionId: "ys-inst-restart-2000",
        clientId: "client-2",
        observedAt: now + 1,
        trustState: "trusted",
        workspaceScopeId: "workspace:local-default",
      }),
    ).toEqual(expect.objectContaining({ ok: true, claimOutcome: "replaced" }))

    const views = listYeonjangRegistryInstances({ now })
    const online = views.find((item) => item.instanceId === "inst-online")
    const permission = views.find((item) => item.instanceId === "inst-permission")
    const restarted = views.find((item) => item.instanceId === "inst-restart")

    expect(online).toEqual(
      expect.objectContaining({
        state: "offline",
        session: expect.objectContaining({ sessionId: "sess-online" }),
      }),
    )
    expect(permission).toEqual(
      expect.objectContaining({
        state: "permission_required",
      }),
    )
    expect(restarted).toEqual(
      expect.objectContaining({
        state: "online",
        liveSessionCount: 1,
        duplicateLiveSessionDetected: false,
        session: expect.objectContaining({
          sessionId: "ys-inst-restart-2000",
        }),
      }),
    )

    expect(getYeonjangRegistrySummary({ now })).toEqual(
      expect.objectContaining({
        totalInstances: 3,
        offline: 1,
        permissionRequired: 1,
        degraded: 0,
        localInstances: 1,
        remoteInstances: 2,
      }),
    )
  })

  it("keeps an instance online when an optional capability is disabled but another capability is ready", () => {
    const now = Date.now()
    expect(
      seedObservation({
        instanceId: "inst-partial-permission",
        instanceAlias: "partial-permission-box",
        displayName: "Ready System Information Box",
        nodeId: "yeonjang-partial-permission",
        sessionId: "sess-partial-permission",
        observedAt: now,
        permissions: {
          allow_browser_control: false,
        },
        toolHealth: {
          "browser.focus": { status: "permission_disabled" },
          "browser.active_tab_info": { status: "permission_disabled" },
          "system.info": { status: "ready" },
        },
        capabilityMatrix: {
          "browser.focus": {
            supported: true,
            requiresPermission: true,
            permissionSetting: "allow_browser_control",
          },
          "browser.active_tab_info": {
            supported: false,
            requiresPermission: true,
            permissionSetting: "allow_browser_read",
          },
          "system.info": {
            supported: true,
            requiresPermission: false,
          },
        },
      }),
    ).toEqual(expect.objectContaining({ ok: true }))

    expect(listYeonjangRegistryInstances({ now })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          instanceId: "inst-partial-permission",
          state: "online",
        }),
      ]),
    )
  })

  it("keeps instance identity while a restarted process reports a new session id", () => {
    const now = Date.now()
    expect(
      seedObservation({
        instanceId: "inst-restart",
        instanceAlias: "restart-box",
        displayName: "Restart Control Box",
        sessionId: "sess-old",
        observedAt: now - 120_000,
      }),
    ).toEqual(expect.objectContaining({ ok: true }))

    expect(
      seedObservation({
        instanceId: "inst-restart",
        instanceAlias: "restart-box",
        displayName: "Restart Control Box",
        sessionId: "sess-new",
        observedAt: now,
      }),
    ).toEqual(expect.objectContaining({ ok: true }))

    const views = listYeonjangRegistryInstances({ now })
    const restarted = views.find((item) => item.instanceId === "inst-restart")
    expect(restarted).toEqual(
      expect.objectContaining({
        instanceId: "inst-restart",
        state: "online",
        liveSessionCount: 1,
        session: expect.objectContaining({
          sessionId: "sess-new",
        }),
      }),
    )
  })
})
