import { lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { applyInstallerCandidate } from "../installer/application/install-application.mjs"
import {
  buildWindowsScheduledTaskDefinition,
  completeWindowsInstallerTransaction,
  createWindowsServicePort,
} from "../installer/application/windows-service.mjs"
import { startInstallerTransaction } from "../packages/core/src/release/installer-transaction.js"
import { renderPowerShellInstaller } from "../scripts/lib/installer-bootstrap-render.mjs"

const directories: string[] = []

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "knowbee-windows-install-"))
  directories.push(root)
  const sourceBundleRoot = join(root, "verified-stage")
  mkdirSync(join(sourceBundleRoot, "bin"), { recursive: true })
  writeFileSync(join(sourceBundleRoot, "bin/knowbee.cmd"), "@echo off\r\nexit /b 0\r\n")
  writeFileSync(
    join(sourceBundleRoot, "bundle-inventory.json"),
    `${JSON.stringify({
      kind: "knowbee.installer.bundle_inventory",
      schemaVersion: 1,
      packageVersion: "9.8.7",
      target: "win32-x64",
      node: { version: "24.18.0", moduleAbi: 137 },
      entrypoint: "bin/knowbee.cmd",
      files: [],
    })}\n`,
  )
  return {
    root,
    sourceBundleRoot,
    installRoot: join(root, "LocalAppData/Knowbee"),
    installerStateRoot: join(root, "LocalAppData/Knowbee/installer-state"),
    launcherDirectory: join(root, "LocalAppData/Knowbee/bin"),
    applicationStateRoot: join(root, ".knowbee"),
    candidate: {
      releaseVersion: "9.8.7",
      target: "win32-x64",
      manifestSha256: `sha256:${"a".repeat(64)}`,
      entrypoint: "bin/knowbee.cmd",
    },
  }
}

afterEach(() => {
  while (directories.length > 0) {
    const directory = directories.pop()
    if (directory) rmSync(directory, { recursive: true, force: true })
  }
})

describe("task016 Windows installer", () => {
  it("activates through an atomic pointer file and stable launcher without symlinks", async () => {
    const input = fixture()
    const result = await applyInstallerCandidate({
      ...input,
      owner: { pid: process.pid, token: "task016-owner", startedAt: 1 },
      isProcessAlive: () => false,
    })
    expect(result.status).toBe("activated")
    expect(readFileSync(join(input.installRoot, "current-version"), "utf8")).toBe("9.8.7\n")
    expect(() => lstatSync(join(input.installRoot, "current"))).toThrow()
    const launcher = readFileSync(join(input.launcherDirectory, "knowbee.cmd"), "utf8")
    expect(launcher).toContain("current-version")
    expect(launcher).toContain("versions\\%KNOWBEE_VERSION%\\bin\\knowbee.cmd")
    expect(lstatSync(join(input.launcherDirectory, "knowbee.cmd")).isSymbolicLink()).toBe(false)
  })

  it("binds ScheduledTask directly to the selected private Node and exact principal", () => {
    expect(
      buildWindowsScheduledTaskDefinition({
        installRoot: "C:\\Users\\Bee\\AppData\\Local\\Knowbee",
        releaseVersion: "9.8.7",
        stateDirectory: "C:\\Users\\Bee\\.knowbee",
        userId: "DESKTOP\\Bee",
      }),
    ).toEqual({
      status: "ready",
      taskName: "Sponzey Knowbee",
      execute: "C:\\Users\\Bee\\AppData\\Local\\Knowbee\\versions\\9.8.7\\runtime\\node\\node.exe",
      arguments: [
        "C:\\Users\\Bee\\AppData\\Local\\Knowbee\\versions\\9.8.7\\app\\bin\\knowbee.js",
        "serve",
      ],
      workingDirectory: "C:\\Users\\Bee\\AppData\\Local\\Knowbee\\versions\\9.8.7",
      environment: {
        KNOWBEE_DISPLAY_VERSION: "9.8.7",
        KNOWBEE_STATE_DIR: "C:\\Users\\Bee\\.knowbee",
      },
      principal: { userId: "DESKTOP\\Bee", logonType: "InteractiveToken", runLevel: "Limited" },
    })
  })

  it("keeps the PowerShell bootstrap FullLanguage, native-arch, bounded TLS and eval-free", () => {
    const template = readFileSync("installer/install.ps1", "utf8")
    expect(template).toContain("FullLanguage")
    expect(template).toContain("RuntimeInformation]::OSArchitecture")
    expect(template).toContain("-lt 22000")
    expect(template).toContain("Tls12")
    expect(template).toContain("HttpCompletionOption]::ResponseHeadersRead")
    expect(template).toContain("MaximumBytes")
    expect(template.match(/Read-Host/gu)).toHaveLength(1)
    expect(template).not.toMatch(/Invoke-Expression|Set-ExecutionPolicy|cmd\.exe|npm|pnpm/iu)

    const rendered = renderPowerShellInstaller({
      template,
      verifierSha256ByTarget: {
        "win32-arm64": "a".repeat(64),
        "win32-x64": "b".repeat(64),
      },
    })
    expect(rendered).not.toMatch(/@@[A-Z0-9_]+@@/u)
  })

  it("uses a static ScheduledTask helper without a policy bypass and verifies its projection", async () => {
    const calls: Array<{ command: string; args: string[] }> = []
    const definition = buildWindowsScheduledTaskDefinition({
      installRoot: "C:\\Users\\Bee\\AppData\\Local\\Knowbee",
      releaseVersion: "9.8.7",
      stateDirectory: "C:\\Users\\Bee\\.knowbee",
      userId: "DESKTOP\\Bee",
    })
    expect(definition.status).toBe("ready")
    if (definition.status !== "ready") return
    const port = createWindowsServicePort({
      helperPath:
        "C:\\Users\\Bee\\AppData\\Local\\Knowbee\\versions\\9.8.7\\installer\\application\\windows-scheduled-task.ps1",
      runner: async (command: string, args: string[]) => {
        calls.push({ command, args })
        return {
          status: 0,
          stdout: `${JSON.stringify({
            status: args[args.indexOf("-Operation") + 1] === "Inspect" ? "active" : "registered",
            taskName: definition.taskName,
            execute: definition.execute,
            arguments: definition.arguments,
            workingDirectory: definition.workingDirectory,
            principal: definition.principal,
          })}\n`,
          stderr: "",
        }
      },
    })
    expect(await port.register(definition)).toEqual({ status: "registered" })
    expect(await port.inspect(definition)).toMatchObject({
      status: "active",
      execute: definition.execute,
      principal: definition.principal,
    })
    expect(calls).toHaveLength(2)
    expect(calls[0]?.command).toBe("powershell.exe")
    expect(calls[0]?.args.join(" ")).not.toMatch(/ExecutionPolicy|EncodedCommand/iu)
  })

  it("registers a Windows task without starting for the no-start policy", async () => {
    const definition = buildWindowsScheduledTaskDefinition({
      installRoot: "C:\\Users\\Bee\\AppData\\Local\\Knowbee",
      releaseVersion: "9.8.7",
      stateDirectory: "C:\\Users\\Bee\\.knowbee",
      userId: "DESKTOP\\Bee",
    })
    if (definition.status !== "ready") throw new Error(definition.reasonCode)
    const calls: string[][] = []
    const port = createWindowsServicePort({
      helperPath: "C:\\Knowbee\\windows-scheduled-task.ps1",
      async runner(_command: string, args: string[]) {
        calls.push(args)
        return {
          status: 0,
          stdout: `${JSON.stringify({
            status: "registered",
            taskName: definition.taskName,
            execute: definition.execute,
            arguments: definition.arguments,
            workingDirectory: definition.workingDirectory,
            principal: definition.principal,
          })}\n`,
          stderr: "",
        }
      },
    })
    expect(await port.register(definition, { start: false })).toEqual({ status: "registered" })
    expect(await port.inspect(definition, { start: false })).toMatchObject({ status: "registered" })
    expect(calls.every((args) => args.includes("RegisterOnly"))).toBe(true)
    expect(readFileSync("installer/application/windows-scheduled-task.ps1", "utf8")).toContain(
      'if ($StartMode -eq "Start")',
    )
  })

  it("commits only after exact task identity and health identity pass", async () => {
    let state = startInstallerTransaction({
      operationId: "installer:task016",
      idempotencyKey: "candidate:task016",
      targetFingerprint: `sha256:${"a".repeat(64)}`,
      desiredVersion: "9.8.7",
    })
    const types = [
      "preflight_passed",
      "bundle_downloaded",
      "bundle_verified",
      "stage_prepared",
      "activation_completed",
    ] as const
    const { reduceInstallerTransaction } = await import(
      "../packages/core/src/release/installer-transaction.js"
    )
    for (const type of types) {
      const reduced = reduceInstallerTransaction(state, {
        type,
        eventId: `task016-${state.revision + 1}`,
        operationId: state.operationId,
        targetFingerprint: state.targetFingerprint,
        expectedRevision: state.revision,
        receiptRef: `receipt:${type}`,
        ...(type === "activation_completed" ? { previousReleaseId: null } : {}),
      })
      expect(reduced.status).toBe("applied")
      if (reduced.status === "applied") state = reduced.state
    }
    const saved: unknown[] = []
    const result = await completeWindowsInstallerTransaction({
      state,
      store: {
        async save(value: unknown) {
          saved.push(value)
          return { status: "saved" }
        },
      },
      installRoot: "C:\\Users\\Bee\\AppData\\Local\\Knowbee",
      releaseVersion: "9.8.7",
      stateDirectory: "C:\\Users\\Bee\\.knowbee",
      userId: "DESKTOP\\Bee",
      service: {
        async register() {
          return { status: "registered" }
        },
        async inspect(definition: ReturnType<typeof buildWindowsScheduledTaskDefinition>) {
          if (definition.status !== "ready") return definition
          return {
            status: "active",
            taskName: definition.taskName,
            execute: definition.execute,
            arguments: definition.arguments,
            workingDirectory: definition.workingDirectory,
            principal: definition.principal,
          }
        },
      },
      health: {
        async inspect() {
          const { createHash } = await import("node:crypto")
          return {
            status: "healthy",
            releaseVersion: "9.8.7",
            stateDirectoryFingerprint: `sha256:${createHash("sha256").update("C:\\Users\\Bee\\.knowbee").digest("hex")}`,
          }
        },
      },
      async rollback() {
        return { status: "rolled_back" }
      },
    })
    expect(result.status).toBe("committed")
    expect(result.state.revision).toBe(8)
    expect(saved).toHaveLength(3)
  })
})
