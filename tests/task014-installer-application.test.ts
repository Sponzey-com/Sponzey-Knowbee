import { mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import { applyInstallerCandidate } from "../installer/application/install-application.mjs"

const directories: string[] = []

function temporaryDirectory(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix))
  directories.push(directory)
  return directory
}

function fixture() {
  const root = temporaryDirectory("knowbee-install-app-")
  const sourceBundleRoot = join(root, "verified-stage")
  const installRoot = join(root, "install")
  const installerStateRoot = join(root, "installer-state")
  const launcherDirectory = join(root, "launchers")
  const applicationStateRoot = join(root, "knowbee-state")
  mkdirSync(join(sourceBundleRoot, "bin"), { recursive: true })
  writeFileSync(join(sourceBundleRoot, "bin/knowbee"), "#!/bin/sh\nexit 0\n")
  writeFileSync(
    join(sourceBundleRoot, "bundle-inventory.json"),
    `${JSON.stringify({
      kind: "knowbee.installer.bundle_inventory",
      schemaVersion: 1,
      packageVersion: "9.8.7",
      target: "darwin-arm64",
      node: { version: "24.18.0", moduleAbi: 137 },
      entrypoint: "bin/knowbee",
      files: [],
    })}\n`,
  )
  return {
    sourceBundleRoot,
    installRoot,
    installerStateRoot,
    launcherDirectory,
    applicationStateRoot,
    candidate: {
      releaseVersion: "9.8.7",
      target: "darwin-arm64",
      manifestSha256: `sha256:${"a".repeat(64)}`,
      entrypoint: "bin/knowbee",
    },
  }
}

afterEach(() => {
  while (directories.length > 0) {
    const directory = directories.pop()
    if (directory) rmSync(directory, { recursive: true, force: true })
  }
})

describe("task014 installer application", () => {
  it("atomically activates a verified candidate without touching application state", async () => {
    const input = fixture()
    const result = await applyInstallerCandidate({
      ...input,
      owner: { pid: process.pid, token: "task014-owner", startedAt: 1 },
      isProcessAlive: () => false,
    })
    expect(result).toMatchObject({
      status: "activated",
      releaseVersion: "9.8.7",
      previousReleaseVersion: null,
      next: "service_registration",
    })
    expect(readlinkSync(join(input.installRoot, "current"))).toBe("versions/9.8.7")
    expect(readlinkSync(join(input.launcherDirectory, "knowbee"))).toBe(
      join(input.installRoot, "current/bin/knowbee"),
    )
    expect(readFileSync(join(input.installRoot, "versions/9.8.7/bin/knowbee"), "utf8")).toContain(
      "exit 0",
    )
    expect(() => readFileSync(join(input.applicationStateRoot, "config.json"))).toThrow()

    const transaction = JSON.parse(
      readFileSync(join(input.installerStateRoot, result.operationKey, "transaction.json"), "utf8"),
    )
    expect(transaction).toMatchObject({ phase: "activated", desiredVersion: "9.8.7", revision: 5 })
  })

  it("is idempotent for the same active inventory", async () => {
    const input = fixture()
    const first = await applyInstallerCandidate({
      ...input,
      owner: { pid: process.pid, token: "task014-first", startedAt: 1 },
      isProcessAlive: () => false,
    })
    expect(first.status).toBe("activated")
    const second = await applyInstallerCandidate({
      ...input,
      owner: { pid: process.pid, token: "task014-second", startedAt: 2 },
      isProcessAlive: () => false,
    })
    expect(second).toMatchObject({ status: "already_active", releaseVersion: "9.8.7" })
  })

  it("reconverges the same version when the requested effect profile changes", async () => {
    const input = fixture()
    const noServiceCompletion = vi.fn(async () => ({ status: "committed" as const }))
    const standardCompletion = vi.fn(async () => ({ status: "committed" as const }))
    expect(
      await applyInstallerCandidate({
        ...input,
        profileKey: "service-0_start-0_path-1_browser-0_yeonjang-0",
        complete: noServiceCompletion,
        owner: { pid: process.pid, token: "profile-no-service", startedAt: 1 },
        isProcessAlive: () => false,
      }),
    ).toMatchObject({ status: "committed" })
    expect(
      await applyInstallerCandidate({
        ...input,
        profileKey: "service-1_start-1_path-1_browser-1_yeonjang-0",
        complete: standardCompletion,
        owner: { pid: process.pid, token: "profile-standard", startedAt: 2 },
        isProcessAlive: () => false,
      }),
    ).toMatchObject({ status: "committed" })
    expect(noServiceCompletion).toHaveBeenCalledOnce()
    expect(standardCompletion).toHaveBeenCalledOnce()

    const repeated = await applyInstallerCandidate({
      ...input,
      profileKey: "service-1_start-1_path-1_browser-1_yeonjang-0",
      complete: standardCompletion,
      owner: { pid: process.pid, token: "profile-standard-repeat", startedAt: 3 },
      isProcessAlive: () => false,
    })
    expect(repeated.status).toBe("already_active")
    expect(standardCompletion).toHaveBeenCalledOnce()
  })
})
