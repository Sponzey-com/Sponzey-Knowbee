import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { INSTALLER_TARGETS } from "../packages/core/src/release/installer-contract.js"
import {
  INSTALLER_NODE_RUNTIME,
  INSTALLER_PLATFORM_PROFILES,
} from "../scripts/lib/installer-platforms.mjs"

const tempDirs: string[] = []

function makeTempDir(): string {
  const directory = mkdtempSync(join(tmpdir(), "knowbee-installer-platforms-"))
  tempDirs.push(directory)
  return directory
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const directory = tempDirs.pop()
    if (directory) rmSync(directory, { recursive: true, force: true })
  }
})

describe("task003 installer platform packaging", () => {
  it("defines one deterministic inventory for the five native installer targets", () => {
    expect(INSTALLER_NODE_RUNTIME).toEqual({ version: "24.18.0", moduleAbi: 137 })
    expect(INSTALLER_PLATFORM_PROFILES).toEqual([
      expect.objectContaining({ target: "darwin-arm64", os: "darwin", cpu: "arm64" }),
      expect.objectContaining({ target: "darwin-x64", os: "darwin", cpu: "x64" }),
      expect.objectContaining({ target: "linux-x64", os: "linux", cpu: "x64", libc: "glibc" }),
      expect.objectContaining({ target: "win32-arm64", os: "win32", cpu: "arm64" }),
      expect.objectContaining({ target: "win32-x64", os: "win32", cpu: "x64" }),
    ])
    expect(new Set(INSTALLER_PLATFORM_PROFILES.map((profile) => profile.target)).size).toBe(5)
    expect(INSTALLER_PLATFORM_PROFILES.map((profile) => profile.target)).toEqual(INSTALLER_TARGETS)
    expect(INSTALLER_PLATFORM_PROFILES.map((profile) => profile.yeonjangPackage).sort()).toEqual([
      "@sponzey/yeonjang-darwin-arm64",
      "@sponzey/yeonjang-darwin-x64",
      "@sponzey/yeonjang-linux-x64",
      "@sponzey/yeonjang-win32-arm64",
      "@sponzey/yeonjang-win32-x64",
    ])
  })

  it("stages exact optional Yeonjang dependencies and runtime inventory for all targets", () => {
    const outputDir = makeTempDir()
    execFileSync(
      process.execPath,
      ["scripts/package-npm.mjs", "--version", "9.8.7", "--output-dir", outputDir],
      { cwd: process.cwd(), stdio: "pipe" },
    )

    const metaPackage = readJson(join(outputDir, "knowbee", "package.json"))
    expect(metaPackage.optionalDependencies).toEqual({
      "@sponzey/yeonjang-darwin-arm64": "9.8.7",
      "@sponzey/yeonjang-darwin-x64": "9.8.7",
      "@sponzey/yeonjang-linux-x64": "9.8.7",
      "@sponzey/yeonjang-win32-arm64": "9.8.7",
      "@sponzey/yeonjang-win32-x64": "9.8.7",
    })
    expect(readJson(join(outputDir, "installer-package-inventory.json"))).toEqual({
      schemaId: "knowbee.installer.package-inventory.v1",
      schemaVersion: 1,
      packageVersion: "9.8.7",
      node: INSTALLER_NODE_RUNTIME,
      profiles: INSTALLER_PLATFORM_PROFILES,
    })
  }, 120_000)

  it("builds every native profile on a matching GitHub runner with pinned Node 24", () => {
    const workflow = readFileSync(".github/workflows/npm-release.yml", "utf8")
    const configuredNodeVersions = [...workflow.matchAll(/node-version:\s*([^\s]+)/g)].map(
      (match) => match[1],
    )
    expect(configuredNodeVersions.length).toBeGreaterThan(0)
    expect(new Set(configuredNodeVersions)).toEqual(new Set(["24.18.0"]))
    expect(workflow).toMatch(/os:\s*macos-latest[\s\S]*target:\s*darwin-arm64/)
    expect(workflow).toMatch(/os:\s*macos-15-intel[\s\S]*target:\s*darwin-x64/)
    expect(workflow).toMatch(/os:\s*windows-latest[\s\S]*target:\s*win32-x64/)
    expect(workflow).toMatch(/os:\s*windows-11-arm[\s\S]*target:\s*win32-arm64/)
    expect(workflow).toContain("--target linux-x64")
  })
})
