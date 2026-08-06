import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { writeInstallerFilesystemBundle } from "../scripts/lib/installer-archive.mjs"
import { assembleInstallerBundleLayout } from "../scripts/lib/installer-bundle-layout.mjs"

const directories: string[] = []

function temporaryDirectory(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix))
  directories.push(directory)
  return directory
}

function fixture() {
  const root = temporaryDirectory("knowbee-layout-")
  const nodeRuntimeDirectory = join(root, "node-runtime")
  const applicationDirectory = join(root, "application")
  const outputDirectory = join(root, "bundle")
  const archiveOutputDirectory = join(root, "archives")
  mkdirSync(join(nodeRuntimeDirectory, "bin"), { recursive: true })
  mkdirSync(join(applicationDirectory, "bin"), { recursive: true })
  for (const packageName of ["cli", "core", "webui"]) {
    const packageDirectory = join(applicationDirectory, "node_modules", "@sponzey", packageName)
    mkdirSync(packageDirectory, { recursive: true })
    writeFileSync(
      join(packageDirectory, "package.json"),
      `${JSON.stringify({ name: `@sponzey/${packageName}`, version: "9.8.7" })}\n`,
    )
  }
  const privateNodeLog = join(root, "private-node.log")
  const node = join(nodeRuntimeDirectory, "bin/node")
  writeFileSync(
    node,
    `#!/bin/sh
if [ "$1" = "--version" ]; then printf '%s\\n' 'v24.18.0'; exit 0; fi
if [ "$1" = "--print" ]; then printf '%s\\n' '137'; exit 0; fi
printf '%s\\n' "$@" >"$PRIVATE_NODE_LOG"
`,
  )
  chmodSync(node, 0o755)
  writeFileSync(
    join(applicationDirectory, "package.json"),
    `${JSON.stringify({ name: "@sponzey/knowbee", version: "9.8.7", type: "module" })}\n`,
  )
  writeFileSync(join(applicationDirectory, "bin/knowbee.js"), "console.log('knowbee')\n")
  return {
    root,
    nodeRuntimeDirectory,
    applicationDirectory,
    outputDirectory,
    archiveOutputDirectory,
    privateNodeLog,
    plan: {
      kind: "knowbee.installer.bundle_plan",
      schemaVersion: 1,
      packageVersion: "9.8.7",
      target: "darwin-arm64",
      archive: "tar.gz",
      outputName: "knowbee-9.8.7-darwin-arm64.tar.gz",
      entrypoint: "bin/knowbee",
      node: { version: "24.18.0", moduleAbi: 137 },
      inputs: [{ id: "node", fileName: "node.tar.gz", sizeBytes: 100, sha256: "a".repeat(64) }],
      yeonjang: { status: "absent" },
    },
  }
}

afterEach(() => {
  while (directories.length > 0) {
    const directory = directories.pop()
    if (directory) rmSync(directory, { recursive: true, force: true })
  }
})

describe("task014 installer bundle layout", () => {
  it("assembles an inventory-bound layout whose launcher selects private Node", async () => {
    const input = fixture()
    const result = await assembleInstallerBundleLayout(input)
    expect(result.status).toBe("ready")
    if (result.status !== "ready") return

    const launcher = readFileSync(join(input.outputDirectory, "bin/knowbee"), "utf8")
    expect(launcher).toContain('"$ROOT/runtime/node/bin/node"')
    expect(launcher).toContain("app/installer/uninstall.mjs")
    expect(launcher).not.toContain("env node")
    const invocation = spawnSync(join(input.outputDirectory, "bin/knowbee"), ["doctor"], {
      encoding: "utf8",
      env: { PRIVATE_NODE_LOG: input.privateNodeLog },
    })
    expect(invocation.status, invocation.stderr).toBe(0)
    expect(readFileSync(input.privateNodeLog, "utf8")).toContain("app/bin/knowbee.js\ndoctor\n")

    const stableDirectory = join(input.root, "stable-bin")
    mkdirSync(stableDirectory)
    const stableLauncher = join(stableDirectory, "knowbee")
    symlinkSync(join(input.outputDirectory, "bin/knowbee"), stableLauncher)
    const linkedInvocation = spawnSync(stableLauncher, ["doctor"], {
      encoding: "utf8",
      env: { PRIVATE_NODE_LOG: input.privateNodeLog },
    })
    expect(linkedInvocation.status, linkedInvocation.stderr).toBe(0)

    const inventory = JSON.parse(
      readFileSync(join(input.outputDirectory, "bundle-inventory.json"), "utf8"),
    )
    expect(inventory).toMatchObject({
      kind: "knowbee.installer.bundle_inventory",
      schemaVersion: 1,
      packageVersion: "9.8.7",
      target: "darwin-arm64",
      node: { version: "24.18.0", moduleAbi: 137 },
    })
    expect(inventory.files.map((file: { path: string }) => file.path)).toEqual(
      expect.arrayContaining([
        "app/bin/knowbee.js",
        "app/installer/apply.mjs",
        "app/installer/install-application.mjs",
        "app/installer/lifecycle.mjs",
        "app/installer/uninstall.mjs",
        "app/installer/windows-scheduled-task.ps1",
        "app/installer/windows-service.mjs",
        "app/package.json",
        "bin/knowbee",
        "runtime/node/bin/node",
      ]),
    )

    const archived = await writeInstallerFilesystemBundle({
      plan: input.plan,
      layoutDirectory: input.outputDirectory,
      outputDirectory: input.archiveOutputDirectory,
    })
    expect(archived.status, JSON.stringify(archived)).toBe("ready")
    if (archived.status !== "ready") return
    const listing = spawnSync("tar", ["-tzf", archived.path], { encoding: "utf8" })
    expect(listing.status, listing.stderr).toBe(0)
    expect(listing.stdout.trim().split("\n")).toEqual(
      expect.arrayContaining([
        "app/bin/knowbee.js",
        "app/installer/apply.mjs",
        "bin/knowbee",
        "bundle-inventory.json",
        "runtime/node/bin/node",
      ]),
    )
  })

  it("rejects an application version mismatch without leaving a partial layout", async () => {
    const input = fixture()
    writeFileSync(
      join(input.applicationDirectory, "package.json"),
      `${JSON.stringify({ name: "@sponzey/knowbee", version: "9.8.6" })}\n`,
    )
    expect(await assembleInstallerBundleLayout(input)).toEqual({
      status: "rejected",
      reasonCode: "bundle_application_identity_mismatch",
    })
    expect(() => readFileSync(join(input.outputDirectory, "bin/knowbee"))).toThrow()
  })

  it("rejects a missing same-version application component", async () => {
    const input = fixture()
    rmSync(join(input.applicationDirectory, "node_modules/@sponzey/core"), {
      recursive: true,
      force: true,
    })
    expect(await assembleInstallerBundleLayout(input)).toEqual({
      status: "rejected",
      reasonCode: "bundle_application_component_mismatch:@sponzey/core",
    })
  })

  it("verifies the selected Yeonjang package target and binary identity", async () => {
    const input = fixture()
    const packageDirectory = join(
      input.applicationDirectory,
      "node_modules/@sponzey/yeonjang-darwin-arm64",
    )
    const binaryDirectory = join(packageDirectory, "app/Yeonjang.app/Contents/MacOS")
    const binary = Buffer.from("signed-native-binary")
    mkdirSync(binaryDirectory, { recursive: true })
    writeFileSync(
      join(packageDirectory, "package.json"),
      `${JSON.stringify({
        name: "@sponzey/yeonjang-darwin-arm64",
        version: "9.8.7",
        os: ["darwin"],
        cpu: ["arm64"],
      })}\n`,
    )
    writeFileSync(join(binaryDirectory, "Yeonjang"), binary)
    writeFileSync(
      join(packageDirectory, "release-identity.json"),
      `${JSON.stringify({
        schemaId: "yeonjang.package-identity.v1",
        schemaVersion: 1,
        packageVersion: "9.8.7",
        target: { key: "darwin-arm64", os: "darwin", cpu: "arm64" },
        binary: {
          name: "Yeonjang",
          relativePath: "app/Yeonjang.app/Contents/MacOS/Yeonjang",
          targetKey: "darwin-arm64",
          sizeBytes: binary.byteLength,
          sha256: `sha256:${createHash("sha256").update(binary).digest("hex")}`,
        },
        applicationBundle: { relativePath: "app/Yeonjang.app" },
      })}\n`,
    )
    input.plan.inputs.push({
      id: "yeonjang:@sponzey/yeonjang-darwin-arm64",
      fileName: "yeonjang.tgz",
      sizeBytes: 200,
      sha256: "b".repeat(64),
    })
    input.plan.yeonjang = {
      status: "included",
      packageName: "@sponzey/yeonjang-darwin-arm64",
    }

    expect(await assembleInstallerBundleLayout(input)).toMatchObject({ status: "ready" })

    const tampered = fixture()
    const tamperedPackage = join(
      tampered.applicationDirectory,
      "node_modules/@sponzey/yeonjang-darwin-arm64",
    )
    mkdirSync(join(tamperedPackage, "bin"), { recursive: true })
    writeFileSync(
      join(tamperedPackage, "package.json"),
      `${JSON.stringify({
        name: "@sponzey/yeonjang-darwin-arm64",
        version: "9.8.7",
        os: ["darwin"],
        cpu: ["x64"],
      })}\n`,
    )
    tampered.plan.yeonjang = {
      status: "included",
      packageName: "@sponzey/yeonjang-darwin-arm64",
    }
    expect(await assembleInstallerBundleLayout(tampered)).toEqual({
      status: "rejected",
      reasonCode: "bundle_yeonjang_identity_mismatch",
    })
  })
})
