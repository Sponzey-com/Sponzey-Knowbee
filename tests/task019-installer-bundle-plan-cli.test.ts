import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { INSTALLER_PLATFORM_PROFILES } from "../scripts/lib/installer-platforms.mjs"
import { runInstallerBundlePlanCli } from "../scripts/prepare-installer-bundle-plans.mjs"

const directories: string[] = []

afterEach(() => {
  while (directories.length > 0) {
    const directory = directories.pop()
    if (directory) rmSync(directory, { recursive: true, force: true })
  }
})

function receipt(fileName: string, index: number) {
  return { fileName, sizeBytes: 100 + index, sha256: index.toString(16).padStart(64, "0") }
}

describe("task019 installer bundle plan CLI", () => {
  it("writes one immutable exact-input plan for every supported target", async () => {
    const root = mkdtempSync(join(tmpdir(), "knowbee-plan-cli-"))
    directories.push(root)
    const inputPath = join(root, "input.json")
    const outputDirectory = join(root, "plans")
    const npmNames = ["@sponzey/cli", "@sponzey/core", "@sponzey/knowbee", "@sponzey/webui"]
    writeFileSync(
      inputPath,
      `${JSON.stringify({
        packageVersion: "9.8.7",
        nodeArchives: INSTALLER_PLATFORM_PROFILES.map((profile, index) => ({
          target: profile.target,
          ...receipt(profile.nodeRuntimeArchive, index),
          sha256: profile.nodeRuntimeSha256,
        })),
        npmPackages: npmNames.map((packageName, index) => ({
          packageName,
          packageVersion: "9.8.7",
          ...receipt(`${packageName.replace("@", "").replace("/", "-")}-9.8.7.tgz`, index + 10),
        })),
        yeonjangPackages: INSTALLER_PLATFORM_PROFILES.map((profile, index) => ({
          target: profile.target,
          packageName: profile.yeonjangPackage,
          packageVersion: "9.8.7",
          ...receipt(`yeonjang-${profile.target}.tgz`, index + 20),
        })),
      })}\n`,
    )

    expect(
      await runInstallerBundlePlanCli(["--input", inputPath, "--output-dir", outputDirectory]),
    ).toEqual({
      status: "ready",
      packageVersion: "9.8.7",
      targets: INSTALLER_PLATFORM_PROFILES.map((profile) => profile.target),
    })
    for (const profile of INSTALLER_PLATFORM_PROFILES) {
      expect(
        JSON.parse(readFileSync(join(outputDirectory, `${profile.target}.json`), "utf8")),
      ).toMatchObject({
        target: profile.target,
        packageVersion: "9.8.7",
        yeonjang: { status: "included", packageName: profile.yeonjangPackage },
      })
    }
  })
})
