import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { runRewriteInstallerApplicationPackage } from "../scripts/rewrite-installer-application-package.mjs"

const directories: string[] = []

afterEach(() => {
  while (directories.length > 0) {
    const directory = directories.pop()
    if (directory) rmSync(directory, { recursive: true, force: true })
  }
})

describe("task019 installer application package", () => {
  it("pins main and exact-target optional packages to candidate-local tarballs", async () => {
    const root = mkdtempSync(join(tmpdir(), "knowbee-app-package-"))
    directories.push(root)
    const application = join(root, "application")
    const input = join(root, "input")
    mkdirSync(application)
    mkdirSync(input)
    const packagePath = join(application, "package.json")
    writeFileSync(
      packagePath,
      `${JSON.stringify({ name: "@sponzey/knowbee", version: "9.8.7", dependencies: {} })}\n`,
    )
    for (const name of ["cli", "core", "knowbee", "webui", "yeonjang-linux-x64"]) {
      writeFileSync(join(input, `sponzey-${name}-9.8.7.tgz`), name)
    }

    expect(
      await runRewriteInstallerApplicationPackage([
        "--package",
        packagePath,
        "--input-dir",
        input,
        "--package-version",
        "9.8.7",
        "--target",
        "linux-x64",
      ]),
    ).toEqual({ status: "ready", target: "linux-x64", packageVersion: "9.8.7" })
    const rewritten = JSON.parse(readFileSync(packagePath, "utf8"))
    expect(rewritten.dependencies).toEqual({
      "@sponzey/cli": "file:../input/sponzey-cli-9.8.7.tgz",
      "@sponzey/core": "file:../input/sponzey-core-9.8.7.tgz",
      "@sponzey/webui": "file:../input/sponzey-webui-9.8.7.tgz",
    })
    expect(rewritten.optionalDependencies).toEqual({
      "@sponzey/yeonjang-linux-x64": "file:../input/sponzey-yeonjang-linux-x64-9.8.7.tgz",
    })
  })

  it("rejects an unsupported target without changing package metadata", async () => {
    const root = mkdtempSync(join(tmpdir(), "knowbee-app-package-reject-"))
    directories.push(root)
    const packagePath = join(root, "package.json")
    const original = `${JSON.stringify({ name: "@sponzey/knowbee", version: "9.8.7" })}\n`
    writeFileSync(packagePath, original)
    expect(
      await runRewriteInstallerApplicationPackage([
        "--package",
        packagePath,
        "--input-dir",
        root,
        "--package-version",
        "9.8.7",
        "--target",
        "linux-arm64",
      ]),
    ).toEqual({ status: "rejected", reasonCode: "installer_application_package_arguments_invalid" })
    expect(readFileSync(packagePath, "utf8")).toBe(original)
  })
})
