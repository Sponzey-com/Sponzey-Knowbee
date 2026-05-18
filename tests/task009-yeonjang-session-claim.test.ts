import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { reloadConfig } from "../packages/core/src/config/index.js"
import { closeDb, getDb } from "../packages/core/src/db/index.js"
import {
  listYeonjangRegistryInstances,
  upsertYeonjangRegistryObservation,
} from "../packages/core/src/yeonjang/registry.ts"

const previousStateDir = process.env["NOBIE_STATE_DIR"]
const previousConfig = process.env["NOBIE_CONFIG"]
const tempDirs: string[] = []

function useTempState(): void {
  closeDb()
  const stateDir = mkdtempSync(join(tmpdir(), "nobie-task009-yeonjang-session-claim-"))
  tempDirs.push(stateDir)
  process.env["NOBIE_STATE_DIR"] = stateDir
  delete process.env["NOBIE_CONFIG"]
  reloadConfig()
}

function seedObservation(overrides: Partial<Parameters<typeof upsertYeonjangRegistryObservation>[0]> = {}) {
  const observedAt = overrides.observedAt ?? Date.now()
  return upsertYeonjangRegistryObservation({
    instanceId: overrides.instanceId ?? "inst-remote-1",
    instanceAlias: overrides.instanceAlias ?? "windows-test-pc",
    displayName: overrides.displayName ?? "Windows Review Console",
    nodeId: overrides.nodeId ?? "yeonjang-windows",
    supportProfile: overrides.supportProfile ?? "desktop_interactive",
    platform: overrides.platform ?? "windows",
    arch: overrides.arch ?? "x64",
    hostFingerprint: overrides.hostFingerprint ?? "remote-host-1",
    installFingerprint: overrides.installFingerprint ?? "install-remote-1",
    sessionId: overrides.sessionId ?? "ys-inst-remote-1-1000",
    clientId: overrides.clientId ?? "client-1",
    connectionState: overrides.connectionState ?? "online",
    message: overrides.message ?? "ready",
    version: overrides.version ?? "0.1.0",
    protocolVersion: overrides.protocolVersion ?? "2026-04-16.capability-matrix.v1",
    capabilityHash: overrides.capabilityHash ?? "cap-remote-1",
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

describe("task009 yeonjang session claim", () => {
  it("replaces the previous live session on same-install restart", () => {
    expect(seedObservation({
      sessionId: "ys-inst-remote-1-1000",
      observedAt: 1_000,
    })).toEqual(expect.objectContaining({ ok: true, claimOutcome: "accepted" }))

    expect(seedObservation({
      sessionId: "ys-inst-remote-1-2000",
      observedAt: 2_000,
    })).toEqual(expect.objectContaining({
      ok: true,
      claimOutcome: "replaced",
      replacedSessionIds: ["ys-inst-remote-1-1000"],
    }))

    const current = listYeonjangRegistryInstances({ now: 2_000 })
      .find((item) => item.instanceId === "inst-remote-1")
    expect(current).toEqual(expect.objectContaining({
      state: "online",
      liveSessionCount: 1,
      session: expect.objectContaining({
        sessionId: "ys-inst-remote-1-2000",
      }),
    }))

    const replaced = getDb()
      .prepare<[string], { session_state: string; ended_at: number | null }>(
        "SELECT session_state, ended_at FROM yeonjang_instance_sessions WHERE session_id = ?",
      )
      .get("ys-inst-remote-1-1000")
    expect(replaced).toEqual(expect.objectContaining({
      session_state: "session_replaced",
      ended_at: 2_000,
    }))
  })

  it("quarantines a duplicate claim from a different install fingerprint and keeps the healthy session active", () => {
    expect(seedObservation({
      sessionId: "ys-inst-remote-1-1000",
      observedAt: 1_000,
    })).toEqual(expect.objectContaining({ ok: true }))

    expect(seedObservation({
      sessionId: "ys-inst-remote-1-3000",
      installFingerprint: "install-rogue-1",
      clientId: "client-rogue",
      observedAt: 3_000,
    })).toEqual(expect.objectContaining({
      ok: true,
      claimOutcome: "quarantined",
      reasonCode: "duplicate_instance_conflict:install_fingerprint_mismatch",
    }))

    const current = listYeonjangRegistryInstances({ now: 3_000 })
      .find((item) => item.instanceId === "inst-remote-1")
    expect(current).toEqual(expect.objectContaining({
      state: "online",
      liveSessionCount: 1,
      session: expect.objectContaining({
        sessionId: "ys-inst-remote-1-1000",
      }),
    }))

    const rejected = getDb()
      .prepare<[string], { session_state: string; session_message: string | null; ended_at: number | null }>(
        "SELECT session_state, session_message, ended_at FROM yeonjang_instance_sessions WHERE session_id = ?",
      )
      .get("ys-inst-remote-1-3000")
    expect(rejected).toEqual(expect.objectContaining({
      session_state: "duplicate_instance_conflict",
      ended_at: 3_000,
    }))
    expect(rejected?.session_message).toContain("install_fingerprint_mismatch")
  })

  it("quarantines a foreign-scope claim instead of replacing the current live session", () => {
    expect(seedObservation({
      sessionId: "ys-inst-remote-1-1000",
      workspaceScopeId: "workspace:local-default",
      observedAt: 1_000,
    })).toEqual(expect.objectContaining({ ok: true }))

    expect(seedObservation({
      sessionId: "ys-inst-remote-1-4000",
      workspaceScopeId: "workspace:foreign",
      observedAt: 4_000,
    })).toEqual(expect.objectContaining({
      ok: true,
      claimOutcome: "quarantined",
      reasonCode: "duplicate_instance_conflict:foreign_scope",
    }))

    const current = listYeonjangRegistryInstances({ now: 4_000 })
      .find((item) => item.instanceId === "inst-remote-1")
    expect(current?.session?.sessionId).toBe("ys-inst-remote-1-1000")
  })
})
