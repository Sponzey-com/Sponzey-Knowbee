import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { parseUnsignedInstallerManifest } from "../packages/core/src/release/installer-contract.js"
import {
  buildUnsignedInstallerManifestCandidate,
  writeInstallerPlatformBundle,
} from "../scripts/lib/installer-archive.mjs"

const tempDirs: string[] = []
const sha256 = (value: Uint8Array): string => createHash("sha256").update(value).digest("hex")

function makeTempDir(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix))
  tempDirs.push(directory)
  return directory
}

function fixture(target: "darwin-arm64" | "win32-arm64") {
  const inputDirectory = makeTempDir("knowbee-bundle-input-")
  const nodeBytes = Buffer.from(`node:${target}`, "utf8")
  const knowbeeBytes = Buffer.from("knowbee:9.8.7", "utf8")
  writeFileSync(join(inputDirectory, "node-runtime.bin"), nodeBytes)
  writeFileSync(join(inputDirectory, "knowbee.tgz"), knowbeeBytes)
  const archive = target.startsWith("win32-") ? "zip" : "tar.gz"
  return {
    inputDirectory,
    plan: {
      kind: "knowbee.installer.bundle_plan",
      schemaVersion: 1,
      packageVersion: "9.8.7",
      target,
      archive,
      outputName: `knowbee-9.8.7-${target}.${archive}`,
      entrypoint: target.startsWith("win32-") ? "bin/knowbee.cmd" : "bin/knowbee",
      node: { version: "24.18.0", moduleAbi: 137 },
      inputs: [
        {
          id: "node",
          fileName: "node-runtime.bin",
          sizeBytes: nodeBytes.byteLength,
          sha256: sha256(nodeBytes),
        },
        {
          id: "npm:@sponzey/knowbee",
          fileName: "knowbee.tgz",
          sizeBytes: knowbeeBytes.byteLength,
          sha256: sha256(knowbeeBytes),
        },
      ],
      yeonjang: { status: "absent" },
    },
  }
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const directory = tempDirs.pop()
    if (directory) rmSync(directory, { recursive: true, force: true })
  }
})

describe("task006 deterministic installer archive", () => {
  it.each([
    ["darwin-arm64", "tar.gz", "tar", ["-tzf"]],
    ["win32-arm64", "zip", "unzip", ["-Z1"]],
  ] as const)(
    "writes repeatable %s archives and valid listings",
    async (target, archive, command, args) => {
      const input = fixture(target)
      const firstOutput = makeTempDir("knowbee-bundle-output-a-")
      const secondOutput = makeTempDir("knowbee-bundle-output-b-")
      const first = await writeInstallerPlatformBundle({ ...input, outputDirectory: firstOutput })
      const second = await writeInstallerPlatformBundle({ ...input, outputDirectory: secondOutput })

      expect(first.status).toBe("ready")
      expect(second.status).toBe("ready")
      if (first.status !== "ready" || second.status !== "ready") return
      expect(first.artifact).toEqual(second.artifact)
      expect(first.artifact).toMatchObject({
        target,
        archive,
        entrypoint: input.plan.entrypoint,
        nodeModuleAbi: 137,
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      })
      expect(readFileSync(first.path)).toEqual(readFileSync(second.path))

      const listing = execFileSync(command, [...args, first.path], { encoding: "utf8" })
        .trim()
        .split("\n")
      expect(listing).toEqual([
        "bundle-plan.json",
        "payload/knowbee.tgz",
        "payload/node-runtime.bin",
      ])
      if (archive === "zip") {
        expect(() => execFileSync("unzip", ["-t", first.path], { stdio: "pipe" })).not.toThrow()
      }
    },
  )

  it("removes partial output when an input differs from its receipt", async () => {
    const input = fixture("darwin-arm64")
    const outputDirectory = makeTempDir("knowbee-bundle-output-tamper-")
    writeFileSync(join(input.inputDirectory, "knowbee.tgz"), "tampered")

    expect(await writeInstallerPlatformBundle({ ...input, outputDirectory })).toEqual({
      status: "rejected",
      reasonCode: "bundle_input_size_mismatch:npm:@sponzey/knowbee",
    })
    expect(existsSync(join(outputDirectory, input.plan.outputName))).toBe(false)
    expect(readdirSync(outputDirectory)).toEqual([])
  })

  it("rejects target/archive mismatch before reading inputs", async () => {
    const input = fixture("win32-arm64")
    const outputDirectory = makeTempDir("knowbee-bundle-output-wrong-target-")
    expect(
      await writeInstallerPlatformBundle({
        inputDirectory: join(input.inputDirectory, "missing"),
        outputDirectory,
        plan: { ...input.plan, archive: "tar.gz" },
      }),
    ).toEqual({ status: "rejected", reasonCode: "bundle_plan_invalid" })
  })

  it("builds canonical raw manifest bytes accepted by the public v1 parser", () => {
    const digest = "a".repeat(64)
    const targets = [
      ["darwin-arm64", "tar.gz"],
      ["darwin-x64", "tar.gz"],
      ["linux-x64", "tar.gz"],
      ["win32-arm64", "zip"],
      ["win32-x64", "zip"],
    ] as const
    const artifacts = targets.map(([target, archive], index) => ({
      target,
      archive,
      name: `knowbee-9.8.7-${target}.${archive}`,
      sizeBytes: 1_000 + index,
      sha256: digest,
      entrypoint: target.startsWith("win32-") ? "bin/knowbee.cmd" : "bin/knowbee",
      nodeModuleAbi: 137,
      ...(target === "linux-x64" ? { libc: "glibc" } : {}),
    }))

    const built = buildUnsignedInstallerManifestCandidate({
      releaseVersion: "9.8.7",
      artifacts,
    })
    expect(built.status).toBe("ready")
    if (built.status !== "ready") return
    expect(built.rawManifestBytes.at(-1)).toBe(0x0a)
    expect(parseUnsignedInstallerManifest(JSON.parse(built.rawManifestBytes.toString("utf8")))).toEqual({
      status: "accepted",
      manifest: built.manifest,
    })
  })
})
