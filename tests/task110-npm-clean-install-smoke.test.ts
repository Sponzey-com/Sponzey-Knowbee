import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { inspectStagedPackageSet, runNpmCleanInstallSmoke } from "../scripts/self/smoke-npm-install.mjs"

const tempDirs: string[] = []

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("Task110 npm clean install smoke", () => {
  it("rejects a staged package set whose public packages do not share one version", () => {
    expect(() =>
      inspectStagedPackageSet([
        { directory: "/stage/core", name: "@sponzey/core", version: "1.0.0" },
        { directory: "/stage/webui", name: "@sponzey/webui", version: "1.0.0" },
        { directory: "/stage/cli", name: "@sponzey/cli", version: "1.0.1" },
        { directory: "/stage/knowbee", name: "@sponzey/knowbee", version: "1.0.0" },
      ]),
    ).toThrow("one version")
  })

  it("packs, clean-installs, and starts the public Knowbee CLI from local tarballs", () => {
    const stageDir = makeTempDir("knowbee-task110-stage-")
    const workDir = makeTempDir("knowbee-task110-consumer-")
    execFileSync(
      "node",
      ["scripts/package-npm.mjs", "--version", "9.8.7", "--output-dir", stageDir],
      { cwd: process.cwd(), stdio: "pipe" },
    )

    const summary = runNpmCleanInstallSmoke({
      stageDir,
      workDir,
      platform: process.platform,
      nodeCommand: process.execPath,
      processEnv: { ...process.env },
    })

    expect(summary).toMatchObject({
      kind: "knowbee.release.npm_clean_install_receipt",
      schemaVersion: 1,
      status: "passed",
      packageVersion: "9.8.7",
      packageCount: 4,
      packageSetDigestSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      installMode: "local_tarballs",
      cliEntrypoint: "@sponzey/knowbee/bin/knowbee.js",
      cliContract: "help_usage_verified",
    })
    expect(summary.packages.map((item) => item.name)).toEqual([
      "@sponzey/cli",
      "@sponzey/core",
      "@sponzey/knowbee",
      "@sponzey/webui",
    ])
    expect(JSON.stringify(summary)).not.toContain("cliOutput")
    expect(readFileSync(join(workDir, "package.json"), "utf-8")).not.toContain("workspace:")
  }, 120_000)
})
