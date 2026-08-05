import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { closeDb, getDb } from "../packages/core/src/db/index.js"
import {
  listYeonjangRegistryInstances,
  upsertYeonjangRegistryObservation,
} from "../packages/core/src/yeonjang/registry.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const tempDirs: string[] = []

function observe(params: {
  instanceId: string
  instanceAlias: string
  sessionId: string
  installFingerprint?: string
  observedAt?: number
}) {
  return upsertYeonjangRegistryObservation({
    instanceId: params.instanceId,
    instanceAlias: params.instanceAlias,
    displayName: `${params.instanceAlias} display`,
    nodeId: params.instanceId,
    supportProfile: "desktop_interactive",
    hostFingerprint: `${params.instanceId}-host`,
    ...(params.installFingerprint ? { installFingerprint: params.installFingerprint } : {}),
    sessionId: params.sessionId,
    clientId: `${params.sessionId}-client`,
    connectionState: "online",
    protocolVersion: "2026-04-16.capability-matrix.v1",
    methodCount: 1,
    capabilityMatrix: { "system.exec": { supported: true } },
    trustState: "trusted",
    workspaceScopeId: "workspace:local-default",
    observedAt: params.observedAt ?? Date.now(),
  })
}

beforeEach(() => {
  closeDb()
  const stateDir = mkdtempSync(join(tmpdir(), "knowbee-task033-identity-"))
  tempDirs.push(stateDir)
  initializeTestDbRuntime(stateDir)
})

afterEach(() => {
  closeDb()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("Task 033 Yeonjang installation identity", () => {
  it("rejects a different instance ID claiming an accepted installation fingerprint", () => {
    const now = Date.now()
    expect(
      observe({
        instanceId: "office-primary",
        instanceAlias: "office-primary",
        sessionId: "office-session-1",
        installFingerprint: "install-secret-shared",
        observedAt: now,
      }),
    ).toMatchObject({ ok: true, claimOutcome: "accepted" })

    expect(
      observe({
        instanceId: "office-impostor",
        instanceAlias: "office-impostor",
        sessionId: "impostor-session-1",
        installFingerprint: "install-secret-shared",
        observedAt: now + 1,
      }),
    ).toMatchObject({ ok: false, code: "installation_identity_conflict" })

    const instances = listYeonjangRegistryInstances({ now: now + 1 })
    expect(instances.map((instance) => instance.instanceId)).toEqual(["office-primary"])
    expect(JSON.stringify(instances)).not.toContain("install-secret-shared")
    const audit = getDb()
      .prepare<[], { params: string }>(
        `SELECT params FROM audit_logs
         WHERE source = 'yeonjang-governance'
           AND tool_name = 'yeonjang_installation_identity_conflict_rejected'
         ORDER BY timestamp DESC
         LIMIT 1`,
      )
      .get()
    expect(audit?.params).toContain("installation_identity_conflict")
    expect(audit?.params).not.toContain("install-secret-shared")
    expect(
      getDb()
        .prepare<[], { count: number }>(
          "SELECT COUNT(*) AS count FROM yeonjang_instance_sessions WHERE instance_id = 'office-impostor'",
        )
        .get()?.count,
    ).toBe(0)
    expect(
      getDb()
        .prepare<[], { count: number }>(
          "SELECT COUNT(*) AS count FROM yeonjang_instance_heartbeats WHERE instance_id = 'office-impostor'",
        )
        .get()?.count,
    ).toBe(0)
  })

  it("accepts the same instance identity and does not invent uniqueness without a fingerprint", () => {
    const now = Date.now()
    expect(
      observe({
        instanceId: "restart-box",
        instanceAlias: "restart-box",
        sessionId: "restart-session-1",
        installFingerprint: "restart-install",
        observedAt: now,
      }),
    ).toMatchObject({ ok: true })
    expect(
      observe({
        instanceId: "restart-box",
        instanceAlias: "restart-box",
        sessionId: "restart-session-2",
        installFingerprint: "restart-install",
        observedAt: now + 1,
      }),
    ).toMatchObject({ ok: true, claimOutcome: "replaced" })
    expect(
      observe({
        instanceId: "legacy-a",
        instanceAlias: "legacy-a",
        sessionId: "legacy-session-a",
        observedAt: now + 2,
      }),
    ).toMatchObject({ ok: true })
    expect(
      observe({
        instanceId: "legacy-b",
        instanceAlias: "legacy-b",
        sessionId: "legacy-session-b",
        observedAt: now + 3,
      }),
    ).toMatchObject({ ok: true })

    const legacyInstances = listYeonjangRegistryInstances({ now: now + 3 }).filter((instance) =>
      instance.instanceId.startsWith("legacy-"),
    )
    expect(legacyInstances).toHaveLength(2)
    expect(legacyInstances.every((instance) => instance.trustState === "pending")).toBe(true)
    expect(legacyInstances.every((instance) => !instance.runnableTarget)).toBe(true)
  })
})
