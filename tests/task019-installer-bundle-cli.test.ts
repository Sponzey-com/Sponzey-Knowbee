import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { runInstallerBundleCli } from "../scripts/build-installer-bundle.mjs"

const directories: string[] = []

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "knowbee-bundle-cli-"))
  directories.push(root)
  const nodeDirectory = join(root, "node")
  const applicationDirectory = join(root, "application")
  const outputDirectory = join(root, "output")
  mkdirSync(join(nodeDirectory, "bin"), { recursive: true })
  const node = join(nodeDirectory, "bin", "node")
  writeFileSync(
    node,
    '#!/bin/sh\nif [ "$1" = "--version" ]; then echo v24.18.0; else echo 137; fi\n',
  )
  chmodSync(node, 0o755)
  mkdirSync(join(applicationDirectory, "bin"), { recursive: true })
  writeFileSync(
    join(applicationDirectory, "package.json"),
    `${JSON.stringify({ name: "@sponzey/knowbee", version: "9.8.7", type: "module" })}\n`,
  )
  writeFileSync(join(applicationDirectory, "bin", "knowbee.js"), "export {}\n")
  for (const name of ["cli", "core", "webui"]) {
    const directory = join(applicationDirectory, "node_modules", "@sponzey", name)
    mkdirSync(directory, { recursive: true })
    writeFileSync(
      join(directory, "package.json"),
      `${JSON.stringify({ name: `@sponzey/${name}`, version: "9.8.7" })}\n`,
    )
  }
  const planPath = join(root, "plan.json")
  writeFileSync(
    planPath,
    `${JSON.stringify({
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
    })}\n`,
  )
  return { root, nodeDirectory, applicationDirectory, outputDirectory, planPath }
}

afterEach(() => {
  while (directories.length > 0) {
    const directory = directories.pop()
    if (directory) rmSync(directory, { recursive: true, force: true })
  }
})

describe("task019 installer bundle CLI", () => {
  it("atomically builds an executable archive and exact artifact receipt", async () => {
    const input = fixture()
    const result = await runInstallerBundleCli([
      "--plan",
      input.planPath,
      "--node-runtime-dir",
      input.nodeDirectory,
      "--application-dir",
      input.applicationDirectory,
      "--output-dir",
      input.outputDirectory,
    ])

    expect(result).toMatchObject({
      status: "ready",
      target: "darwin-arm64",
      artifact: {
        name: "knowbee-9.8.7-darwin-arm64.tar.gz",
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
      },
    })
    expect(
      JSON.parse(readFileSync(join(input.outputDirectory, "artifact-receipt.json"), "utf8")),
    ).toEqual(result.artifact)
    expect(readFileSync(join(input.outputDirectory, result.artifact.name)).byteLength).toBe(
      result.artifact.sizeBytes,
    )
  })

  it("rejects an existing destination before building a partial layout", async () => {
    const input = fixture()
    mkdirSync(input.outputDirectory)
    expect(
      await runInstallerBundleCli([
        "--plan",
        input.planPath,
        "--node-runtime-dir",
        input.nodeDirectory,
        "--application-dir",
        input.applicationDirectory,
        "--output-dir",
        input.outputDirectory,
      ]),
    ).toEqual({ status: "rejected", reasonCode: "installer_bundle_output_exists" })
  })
})
