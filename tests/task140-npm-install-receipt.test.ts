import { execFileSync, spawnSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import {
  type StagedNpmPackageDigest,
  buildNpmCleanInstallReceipt,
  verifyNpmCleanInstallReceipt,
} from "../packages/core/src/release/npm-install-receipt.js"
import { runNpmCleanInstallSmoke } from "../scripts/smoke-npm-install.mjs"

const tempDirs: string[] = []
const digest = (character: string) => character.repeat(64)

function packages(): StagedNpmPackageDigest[] {
  return [
    { name: "@sponzey/cli", version: "9.8.7", digestSha256: digest("a") },
    { name: "@sponzey/core", version: "9.8.7", digestSha256: digest("b") },
    { name: "@sponzey/knowbee", version: "9.8.7", digestSha256: digest("c") },
    { name: "@sponzey/webui", version: "9.8.7", digestSha256: digest("d") },
  ]
}

const runtime = {
  nodeVersion: "v22.17.0",
  npmVersion: "10.9.2",
  platform: "darwin",
  arch: "arm64",
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const directory = tempDirs.pop()
    if (directory) rmSync(directory, { recursive: true, force: true })
  }
})

describe("task140 npm install receipt", () => {
  it("builds and verifies a bounded receipt for the exact canonical package set", () => {
    const built = buildNpmCleanInstallReceipt({
      packages: packages().reverse(),
      runtime,
      issuedAt: 1_768_521_600_000,
      cliHelpVerified: true,
    })

    expect(built.status).toBe("ready")
    if (built.status !== "ready") return
    expect(built.receipt).toMatchObject({
      kind: "knowbee.release.npm_clean_install_receipt",
      schemaVersion: 1,
      status: "passed",
      issuedAt: 1_768_521_600_000,
      packageVersion: "9.8.7",
      packageCount: 4,
      runtime,
      installMode: "local_tarballs",
      cliEntrypoint: "@sponzey/knowbee/bin/knowbee.js",
      cliContract: "help_usage_verified",
      packageSetDigestSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
    expect(built.receipt.packages.map((item) => item.name)).toEqual([
      "@sponzey/cli",
      "@sponzey/core",
      "@sponzey/knowbee",
      "@sponzey/webui",
    ])
    expect(verifyNpmCleanInstallReceipt({ receipt: built.receipt, packages: packages() })).toEqual({
      status: "verified",
    })
    expect(JSON.stringify(built.receipt)).not.toMatch(/cliOutput|processEnv|SECRET_/)
  })

  it.each([
    ["missing", packages().slice(1), "package_set_missing:@sponzey/cli"],
    [
      "extra",
      [...packages(), { name: "@sponzey/extra", version: "9.8.7", digestSha256: digest("e") }],
      "package_set_extra:@sponzey/extra",
    ],
    ["duplicate", [...packages(), packages()[0]], "package_set_duplicate:@sponzey/cli"],
    [
      "version mismatch",
      packages().map((item) =>
        item.name === "@sponzey/cli" ? { ...item, version: "9.8.8" } : item,
      ),
      "package_version_mismatch",
    ],
  ])("rejects a %s package set", (_name, selectedPackages, reasonCode) => {
    expect(
      buildNpmCleanInstallReceipt({
        packages: selectedPackages,
        runtime,
        issuedAt: 1,
        cliHelpVerified: true,
      }),
    ).toEqual({ status: "rejected", reasonCode })
  })

  it("rejects a receipt after staged package content changes", () => {
    const built = buildNpmCleanInstallReceipt({
      packages: packages(),
      runtime,
      issuedAt: 1,
      cliHelpVerified: true,
    })
    expect(built.status).toBe("ready")
    if (built.status !== "ready") return
    const mutated = packages().map((item) =>
      item.name === "@sponzey/core" ? { ...item, digestSha256: digest("f") } : item,
    )
    expect(verifyNpmCleanInstallReceipt({ receipt: built.receipt, packages: mutated })).toEqual({
      status: "rejected",
      reasonCode: "package_digest_mismatch:@sponzey/core",
    })
  })

  it("rejects malformed external receipt structures without throwing", () => {
    expect(
      verifyNpmCleanInstallReceipt({
        receipt: {
          kind: "knowbee.release.npm_clean_install_receipt",
          schemaVersion: 1,
          status: "passed",
          issuedAt: 1,
          packageVersion: "9.8.7",
          packageCount: 4,
          packages: [null],
          packageSetDigestSha256: digest("a"),
          runtime: { nodeVersion: "v22" },
          installMode: "local_tarballs",
          cliEntrypoint: "@sponzey/knowbee/bin/knowbee.js",
          cliContract: "help_usage_verified",
        },
        packages: packages(),
      }),
    ).toEqual({ status: "rejected", reasonCode: "install_receipt_invalid" })
  })

  it("emits the bounded receipt from the install smoke API and JSON CLI", () => {
    const stageDir = mkdtempSync(join(tmpdir(), "knowbee-task140-stage-"))
    const workDir = mkdtempSync(join(tmpdir(), "knowbee-task140-work-"))
    tempDirs.push(stageDir, workDir)
    execFileSync(
      process.execPath,
      ["scripts/package-npm.mjs", "--version", "9.8.7", "--output-dir", stageDir],
      { cwd: resolve("."), stdio: "pipe" },
    )

    const receipt = runNpmCleanInstallSmoke({
      stageDir,
      workDir,
      platform: process.platform,
      arch: process.arch,
      nodeCommand: process.execPath,
      processEnv: { ...process.env, TASK140_SECRET_CANARY: "SECRET_TASK140" },
      issuedAt: 1_768_521_600_000,
    })
    expect(receipt).toMatchObject({
      kind: "knowbee.release.npm_clean_install_receipt",
      schemaVersion: 1,
      status: "passed",
      packageVersion: "9.8.7",
      packageCount: 4,
      packages: expect.arrayContaining([
        expect.objectContaining({
          name: "@sponzey/core",
          digestSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      ]),
      packageSetDigestSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
    expect(JSON.stringify(receipt)).not.toMatch(/cliOutput|processEnv|SECRET_TASK140/)

    const command = spawnSync(
      process.execPath,
      ["scripts/smoke-npm-install.mjs", "--stage-dir", stageDir, "--json"],
      {
        cwd: resolve("."),
        encoding: "utf8",
        env: { ...process.env, TASK140_SECRET_CANARY: "SECRET_TASK140" },
      },
    )
    expect(command.status, command.stderr).toBe(0)
    expect(JSON.parse(command.stdout)).toMatchObject({
      kind: "knowbee.release.npm_clean_install_receipt",
      schemaVersion: 1,
      status: "passed",
      packageVersion: "9.8.7",
    })
    expect(command.stdout).not.toMatch(/cliOutput|processEnv|SECRET_TASK140/)
  }, 120_000)
})
