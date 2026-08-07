import { createHash } from "node:crypto"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { inspectLinuxInstallerNative } from "../scripts/inspect-installer-linux-native.mjs"

const directories: string[] = []

afterEach(() => {
  while (directories.length > 0) {
    const directory = directories.pop()
    if (directory) rmSync(directory, { recursive: true, force: true })
  }
})

function elf(): Buffer {
  const bytes = Buffer.alloc(64)
  bytes.set([0x7f, 0x45, 0x4c, 0x46, 2, 1], 0)
  bytes.writeUInt16LE(62, 18)
  return bytes
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "knowbee-linux-inspect-"))
  directories.push(root)
  const stageRoot = join(root, "stage")
  mkdirSync(join(stageRoot, "runtime/node/bin"), { recursive: true })
  mkdirSync(join(stageRoot, "app/native"), { recursive: true })
  writeFileSync(join(stageRoot, "runtime/node/bin/node"), elf())
  writeFileSync(join(stageRoot, "app/native/addon.node"), elf())
  const verifierPath = join(root, "knowbee-installer-verify-linux-x64")
  writeFileSync(verifierPath, elf())
  const verifierSha256 = createHash("sha256").update(elf()).digest("hex")
  return { root, stageRoot, verifierPath, verifierSha256 }
}

describe("task020 Linux native inspector", () => {
  it("measures every staged ELF and verifier without emitting raw paths", async () => {
    const input = fixture()
    const result = await inspectLinuxInstallerNative(
      {
        stageRoot: input.stageRoot,
        verifiedReceipt: {
          status: "verified",
          target: "linux-x64",
          originTrust: "unsigned_origin_unverified",
          manifestSha256: `sha256:${"a".repeat(64)}`,
          sha256: "b".repeat(64),
        },
        verifierPath: input.verifierPath,
        verifierReceipt: {
          target: "linux-x64",
          sha256: input.verifierSha256,
        },
      },
      {
        readVersions: async (path: string) =>
          path === input.verifierPath
            ? "Name: GLIBC_2.28"
            : "Name: GLIBC_2.28 Name: GLIBCXX_3.4.25",
      },
    )

    expect(result).toEqual({
      status: "ready",
      attestation: {
        kind: "knowbee.installer.native_attestation",
        schemaVersion: 1,
        target: "linux-x64",
        candidateId: `sha256:${"a".repeat(64)}`,
        artifactSha256: "b".repeat(64),
        verifierSha256: input.verifierSha256,
        status: "passed",
        originTrust: "unsigned_origin_unverified",
        maxGlibc: "2.28",
        maxGlibcxx: "3.4.25",
        verifierMaxGlibc: "2.28",
        nativeFileCount: 2,
      },
    })
    expect(JSON.stringify(result)).not.toContain(input.root)
  })

  it("blocks a newer staged GLIBC requirement", async () => {
    const input = fixture()
    expect(
      await inspectLinuxInstallerNative(
        {
          stageRoot: input.stageRoot,
          verifiedReceipt: {
            status: "verified",
            target: "linux-x64",
            originTrust: "unsigned_origin_unverified",
            manifestSha256: `sha256:${"a".repeat(64)}`,
            sha256: "b".repeat(64),
          },
          verifierPath: input.verifierPath,
          verifierReceipt: { target: "linux-x64", sha256: input.verifierSha256 },
        },
        { readVersions: async () => "Name: GLIBC_2.31" },
      ),
    ).toEqual({
      status: "blocked",
      reasonCode: "installer_linux_abi_floor_exceeded",
      maxGlibc: "2.31",
      verifierMaxGlibc: "2.31",
    })
  })
})
