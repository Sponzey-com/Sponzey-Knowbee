import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"

import {
  buildPosixServiceDefinition,
  completePosixInstallerTransaction,
  createLocalInstallerHealthPort,
  createPosixServicePort,
} from "../installer/application/posix-service.mjs"
import { buildInstallerHealthIdentity } from "../packages/core/src/release/installer-health.js"
import {
  reduceInstallerTransaction,
  startInstallerTransaction,
} from "../packages/core/src/release/installer-transaction.js"

function activatedState() {
  let state = startInstallerTransaction({
    operationId: "installer:task015",
    idempotencyKey: "candidate:task015",
    targetFingerprint: `sha256:${"a".repeat(64)}`,
    desiredVersion: "9.8.7",
  })
  const events = [
    ["preflight_passed", "preflight"],
    ["bundle_downloaded", "download"],
    ["bundle_verified", "verification"],
    ["stage_prepared", "stage"],
    ["activation_completed", "activation"],
  ] as const
  for (const [type, receiptRef] of events) {
    const reduced = reduceInstallerTransaction(state, {
      type,
      eventId: `event-${type}`,
      operationId: state.operationId,
      targetFingerprint: state.targetFingerprint,
      expectedRevision: state.revision,
      receiptRef,
      ...(type === "activation_completed" ? { previousReleaseId: null } : {}),
    })
    if (reduced.status !== "applied") throw new Error(reduced.reasonCode)
    state = reduced.state
  }
  return state
}

const serviceInput = {
  launcherPath: "/Users/bee/.local/share/knowbee/current/bin/knowbee",
  stateDirectory: "/Users/bee/.knowbee",
  logsDirectory: "/Users/bee/.knowbee/logs",
  releaseVersion: "9.8.7",
  uid: 501,
}

describe("task015 POSIX installer service and commit", () => {
  it("projects a bounded release/state identity for the unauthenticated health check", () => {
    expect(
      buildInstallerHealthIdentity({
        releaseVersion: "9.8.7",
        stateDirectory: serviceInput.stateDirectory,
      }),
    ).toEqual({
      releaseVersion: "9.8.7",
      stateDirectoryFingerprint: `sha256:${createHash("sha256")
        .update(serviceInput.stateDirectory)
        .digest("hex")}`,
    })
  })

  it.each(["darwin", "linux"] as const)(
    "builds an exact private %s service definition without linger or shell commands",
    (platform) => {
      const built = buildPosixServiceDefinition({ platform, ...serviceInput })
      expect(built.status).toBe("ready")
      if (built.status !== "ready") return
      expect(built.command).toEqual([serviceInput.launcherPath, "serve"])
      expect(built.content).toContain(serviceInput.launcherPath)
      expect(built.content).toContain(serviceInput.stateDirectory)
      expect(built.content).toContain("KNOWBEE_DISPLAY_VERSION")
      expect(built.content).not.toContain("which node")
      expect(built.content).not.toContain("enable-linger")
      expect(built.content).not.toContain("sh -c")
    },
  )

  it("commits only after exact service and health identity post-checks", async () => {
    const stateDirectoryFingerprint = `sha256:${createHash("sha256")
      .update(serviceInput.stateDirectory)
      .digest("hex")}`
    const save = vi.fn(async () => ({ status: "saved" as const }))
    const rollback = vi.fn(async () => ({ status: "rolled_back" as const }))
    const result = await completePosixInstallerTransaction({
      state: activatedState(),
      platform: "darwin",
      ...serviceInput,
      store: { save },
      service: {
        register: async () => ({ status: "registered" as const }),
        inspect: async () => ({
          status: "active" as const,
          ownerUid: 501,
          command: [serviceInput.launcherPath, "serve"],
        }),
      },
      health: {
        inspect: async () => ({
          status: "healthy" as const,
          releaseVersion: "9.8.7",
          stateDirectoryFingerprint,
        }),
      },
      rollback,
    })
    expect(result).toMatchObject({
      status: "committed",
      state: { phase: "committed", revision: 8 },
    })
    expect(save).toHaveBeenCalledTimes(3)
    expect(rollback).not.toHaveBeenCalled()
  })

  it("uses systemctl argv and verifies the stored unit, active state and ExecStart", async () => {
    const homeDirectory = mkdtempSync(join(tmpdir(), "knowbee-systemd-adapter-"))
    try {
      const calls: Array<[string, string[]]> = []
      const runner = vi.fn(async (command: string, args: string[]) => {
        calls.push([command, args])
        if (args.includes("--property=ActiveState"))
          return { status: 0, stdout: "active\n", stderr: "" }
        if (args.includes("--property=ExecStart")) {
          return {
            status: 0,
            stdout: `{ path=${serviceInput.launcherPath} ; argv[]=${serviceInput.launcherPath} serve ; }\n`,
            stderr: "",
          }
        }
        return { status: 0, stdout: "", stderr: "" }
      })
      const definition = buildPosixServiceDefinition({ platform: "linux", ...serviceInput })
      if (definition.status !== "ready") throw new Error(definition.reasonCode)
      const port = createPosixServicePort({
        platform: "linux",
        homeDirectory,
        logsDirectory: join(homeDirectory, "logs"),
        uid: 501,
        runner,
      })
      expect(await port.register(definition)).toEqual({ status: "registered" })
      expect(await port.inspect(definition)).toEqual({
        status: "active",
        ownerUid: 501,
        command: [serviceInput.launcherPath, "serve"],
      })
      expect(readFileSync(port.definitionPath, "utf8")).toBe(definition.content)
      expect(calls.some(([command]) => command === "loginctl")).toBe(false)
      expect(calls).toContainEqual(["systemctl", ["--user", "daemon-reload"]])
    } finally {
      rmSync(homeDirectory, { recursive: true, force: true })
    }
  })

  it("registers a systemd-user definition without starting it for no-start", async () => {
    const homeDirectory = mkdtempSync(join(tmpdir(), "knowbee-systemd-no-start-"))
    try {
      const calls: Array<[string, string[]]> = []
      const runner = async (command: string, args: string[]) => {
        calls.push([command, args])
        if (args[1] === "is-enabled") return { status: 0, stdout: "enabled\n", stderr: "" }
        if (args.includes("--property=ExecStart")) {
          return {
            status: 0,
            stdout: `{ path=${serviceInput.launcherPath} ; argv[]=${serviceInput.launcherPath} serve ; }\n`,
            stderr: "",
          }
        }
        return { status: 0, stdout: "", stderr: "" }
      }
      const definition = buildPosixServiceDefinition({ platform: "linux", ...serviceInput })
      if (definition.status !== "ready") throw new Error(definition.reasonCode)
      const port = createPosixServicePort({
        platform: "linux",
        homeDirectory,
        logsDirectory: join(homeDirectory, "logs"),
        uid: 501,
        runner,
      })
      expect(await port.register(definition, { start: false })).toEqual({ status: "registered" })
      expect(await port.inspect(definition, { start: false })).toMatchObject({
        status: "registered",
        ownerUid: 501,
        command: definition.command,
      })
      expect(calls).toContainEqual(["systemctl", ["--user", "enable", definition.label]])
      expect(calls.flatMap(([, args]) => args)).not.toContain("--now")
    } finally {
      rmSync(homeDirectory, { recursive: true, force: true })
    }
  })

  it("parses only the bounded local health identity", async () => {
    const port = createLocalInstallerHealthPort({
      fetch: async () =>
        new Response(
          JSON.stringify({
            ok: true,
            service: "knowbee-gateway",
            installIdentity: {
              releaseVersion: "9.8.7",
              stateDirectoryFingerprint: `sha256:${"a".repeat(64)}`,
            },
          }),
          { status: 200 },
        ),
    })
    expect(await port.inspect()).toEqual({
      status: "healthy",
      releaseVersion: "9.8.7",
      stateDirectoryFingerprint: `sha256:${"a".repeat(64)}`,
    })
  })

  it("records failure and invokes rollback on a wrong health identity", async () => {
    const rollback = vi.fn(async () => ({ status: "rolled_back" as const }))
    const result = await completePosixInstallerTransaction({
      state: activatedState(),
      platform: "linux",
      ...serviceInput,
      store: { save: async () => ({ status: "saved" as const }) },
      service: {
        register: async () => ({ status: "registered" as const }),
        inspect: async () => ({
          status: "active" as const,
          ownerUid: 501,
          command: [serviceInput.launcherPath, "serve"],
        }),
      },
      health: {
        inspect: async () => ({
          status: "healthy" as const,
          releaseVersion: "9.8.6",
          stateDirectoryFingerprint: `sha256:${"b".repeat(64)}`,
        }),
      },
      rollback,
    })
    expect(result).toMatchObject({
      status: "rolled_back",
      reasonCode: "installer_health_identity_mismatch",
      state: { phase: "rolled_back", failure: { recovery: "rollback" } },
    })
    expect(rollback).toHaveBeenCalledOnce()
  })
})
