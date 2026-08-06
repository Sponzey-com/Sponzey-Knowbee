import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import { applyInstallerCandidate } from "../installer/application/install-application.mjs"
import {
  INSTALL_ROOT_MARKER,
  parseInstallerLifecycleArguments,
  uninstallKnowbee,
} from "../installer/application/lifecycle.mjs"
import { createLifecycleServiceRemovalPort } from "../installer/application/uninstall.mjs"

const directories: string[] = []

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "knowbee-lifecycle-"))
  directories.push(root)
  const installRoot = join(root, "knowbee")
  const installerStateRoot = join(installRoot, "installer-state")
  const launcherDirectory = join(root, "launchers")
  const applicationStateRoot = join(root, ".knowbee")
  mkdirSync(join(installRoot, "versions", "9.8.7"), { recursive: true })
  mkdirSync(installerStateRoot, { recursive: true })
  mkdirSync(launcherDirectory, { recursive: true })
  mkdirSync(applicationStateRoot, { recursive: true })
  writeFileSync(
    join(installRoot, INSTALL_ROOT_MARKER),
    `${JSON.stringify({
      kind: "knowbee.install_root",
      schemaVersion: 1,
      installationId: "11111111-1111-4111-8111-111111111111",
    })}\n`,
  )
  symlinkSync(join("versions", "9.8.7"), join(installRoot, "current"))
  writeFileSync(join(installerStateRoot, "receipt.json"), "{}\n")
  writeFileSync(join(launcherDirectory, "knowbee"), "launcher\n")
  writeFileSync(join(applicationStateRoot, "config.json"), '{"preserved":true}\n')
  return {
    installRoot,
    installerStateRoot,
    launcherDirectory,
    applicationStateRoot,
    platform: "linux",
    owner: { pid: process.pid, token: "task017-owner", startedAt: 1 },
    isProcessAlive: () => false,
  }
}

function candidateFixture() {
  const root = mkdtempSync(join(tmpdir(), "knowbee-lifecycle-candidates-"))
  directories.push(root)
  const sourceBundleRoot = join(root, "stage")
  mkdirSync(join(sourceBundleRoot, "bin"), { recursive: true })
  writeFileSync(join(sourceBundleRoot, "bin", "knowbee"), "#!/bin/sh\nexit 0\n")
  const common = {
    sourceBundleRoot,
    installRoot: join(root, "knowbee"),
    installerStateRoot: join(root, "knowbee", "installer-state"),
    launcherDirectory: join(root, "launchers"),
    applicationStateRoot: join(root, ".knowbee"),
    isProcessAlive: () => false,
  }
  function release(version: string, digest: string) {
    writeFileSync(
      join(sourceBundleRoot, "bundle-inventory.json"),
      `${JSON.stringify({
        kind: "knowbee.installer.bundle_inventory",
        schemaVersion: 1,
        packageVersion: version,
        target: "linux-x64",
        node: { version: "24.18.0", moduleAbi: 137 },
        entrypoint: "bin/knowbee",
        files: [],
      })}\n`,
    )
    return {
      ...common,
      candidate: {
        releaseVersion: version,
        target: "linux-x64",
        manifestSha256: `sha256:${digest.repeat(64)}`,
        entrypoint: "bin/knowbee",
      },
    }
  }
  return { ...common, release }
}

afterEach(() => {
  while (directories.length > 0) {
    const directory = directories.pop()
    if (directory) rmSync(directory, { recursive: true, force: true })
  }
})

describe("task017 installer lifecycle", () => {
  it("has a closed uninstall/purge command contract", () => {
    expect(parseInstallerLifecycleArguments(["uninstall"])).toEqual({
      command: "uninstall",
      purge: false,
    })
    expect(parseInstallerLifecycleArguments(["uninstall", "--purge"])).toEqual({
      command: "uninstall",
      purge: true,
    })
    expect(parseInstallerLifecycleArguments(["uninstall", "--unknown"])).toEqual({
      status: "rejected",
      reasonCode: "installer_lifecycle_arguments_invalid",
    })
  })

  it("removes only installer-owned runtime and preserves application state by default", async () => {
    const input = fixture()
    const stop = vi.fn(async () => ({ status: "stopped" as const }))
    const result = await uninstallKnowbee({ ...input, service: { stop } })
    expect(result).toMatchObject({ status: "uninstalled", state: "preserved" })
    expect(stop).toHaveBeenCalledOnce()
    expect(existsSync(input.installRoot)).toBe(false)
    expect(existsSync(join(input.launcherDirectory, "knowbee"))).toBe(false)
    expect(readFileSync(join(input.applicationStateRoot, "config.json"), "utf8")).toContain(
      "preserved",
    )
  })

  it("purges application state only with the explicit purge contract", async () => {
    const input = fixture()
    expect(
      await uninstallKnowbee({
        ...input,
        purge: true,
        service: {
          async stop() {
            return { status: "stopped" }
          },
        },
      }),
    ).toMatchObject({ status: "uninstalled", state: "purged" })
    expect(existsSync(input.applicationStateRoot)).toBe(false)
  })

  it("blocks a live lifecycle owner before stopping service or deleting files", async () => {
    const input = fixture()
    mkdirSync(join(input.installRoot, ".lifecycle-lock"))
    writeFileSync(
      join(input.installRoot, ".lifecycle-lock", "owner.json"),
      `${JSON.stringify({ pid: 321, tokenHash: "a".repeat(64), startedAt: 1 })}\n`,
    )
    const stop = vi.fn()
    expect(
      await uninstallKnowbee({
        ...input,
        owner: { pid: 654, token: "other", startedAt: 2 },
        isProcessAlive: (pid: number) => pid === 321,
        service: { stop },
      }),
    ).toEqual({ status: "blocked", reasonCode: "installer_lifecycle_busy" })
    expect(stop).not.toHaveBeenCalled()
    expect(existsSync(join(input.installRoot, "versions", "9.8.7"))).toBe(true)
  })

  it("rejects unsafe or unowned roots before service mutation", async () => {
    const input = fixture()
    rmSync(join(input.installRoot, INSTALL_ROOT_MARKER))
    const stop = vi.fn()
    expect(await uninstallKnowbee({ ...input, service: { stop } })).toEqual({
      status: "rejected",
      reasonCode: "installer_lifecycle_root_unowned",
    })
    expect(stop).not.toHaveBeenCalled()
  })

  it("converges first, same, upgrade, downgrade and failed-candidate pointer rollback", async () => {
    const input = candidateFixture()
    const first = await applyInstallerCandidate({
      ...input.release("9.8.7", "a"),
      owner: { pid: process.pid, token: "first", startedAt: 1 },
    })
    expect(first).toMatchObject({ status: "activated", previousReleaseVersion: null })
    const same = await applyInstallerCandidate({
      ...input.release("9.8.7", "a"),
      owner: { pid: process.pid, token: "same", startedAt: 2 },
    })
    expect(same.status).toBe("already_active")
    const upgrade = await applyInstallerCandidate({
      ...input.release("9.9.0", "b"),
      owner: { pid: process.pid, token: "upgrade", startedAt: 3 },
    })
    expect(upgrade).toMatchObject({ status: "activated", previousReleaseVersion: "9.8.7" })
    const downgrade = await applyInstallerCandidate({
      ...input.release("9.8.6", "c"),
      owner: { pid: process.pid, token: "downgrade", startedAt: 4 },
    })
    expect(downgrade).toMatchObject({ status: "activated", previousReleaseVersion: "9.9.0" })
    const failed = await applyInstallerCandidate({
      ...input.release("10.0.0", "d"),
      owner: { pid: process.pid, token: "failed", startedAt: 5 },
      async complete({ rollbackFilesystem }: { rollbackFilesystem: () => Promise<unknown> }) {
        return rollbackFilesystem()
      },
    })
    expect(failed.status).toBe("rolled_back")
    expect(readlinkSync(join(input.installRoot, "current"))).toBe("versions/9.8.6")
    expect(existsSync(join(input.installRoot, "versions", "10.0.0"))).toBe(true)
  })

  it("serializes different install candidates against a live lifecycle operation", async () => {
    const input = candidateFixture()
    const candidate = input.release("9.8.7", "a")
    mkdirSync(candidate.installRoot, { recursive: true })
    writeFileSync(
      join(candidate.installRoot, INSTALL_ROOT_MARKER),
      `${JSON.stringify({
        kind: "knowbee.install_root",
        schemaVersion: 1,
        installationId: "11111111-1111-4111-8111-111111111111",
      })}\n`,
    )
    mkdirSync(join(candidate.installRoot, ".lifecycle-lock"))
    writeFileSync(
      join(candidate.installRoot, ".lifecycle-lock", "owner.json"),
      `${JSON.stringify({ pid: 777, tokenHash: "b".repeat(64), startedAt: 1 })}\n`,
    )
    expect(
      await applyInstallerCandidate({
        ...candidate,
        owner: { pid: process.pid, token: "candidate", startedAt: 2 },
        isProcessAlive: (pid: number) => pid === 777,
      }),
    ).toEqual({ status: "blocked", reasonCode: "installer_lifecycle_busy" })
    expect(existsSync(join(candidate.installRoot, "versions"))).toBe(false)
  })

  it("does not reinterpret a Linux service inspection transport failure as absence", async () => {
    const root = mkdtempSync(join(tmpdir(), "knowbee-lifecycle-service-"))
    directories.push(root)
    const calls: string[][] = []
    const service = createLifecycleServiceRemovalPort({
      platform: "linux",
      homeDirectory: root,
      uid: 501,
      childEnvironment: {},
      async runner(_command: string, args: string[]) {
        calls.push(args)
        return { status: 1, stdout: "", stderr: "transport unavailable" }
      },
    })
    expect(await service.stop()).toEqual({
      status: "rejected",
      reasonCode: "installer_lifecycle_service_inspection_failed",
    })
    expect(calls).toHaveLength(1)
  })
})
