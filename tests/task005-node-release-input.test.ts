import { createHash } from "node:crypto"
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import { collectVerifiedReleaseArchives } from "../scripts/lib/node-release-input.mjs"

const tempDirs: string[] = []

function makeTempDir(): string {
  const directory = mkdtempSync(join(tmpdir(), "knowbee-node-release-"))
  tempDirs.push(directory)
  return directory
}

const sha256 = (value: Uint8Array): string => createHash("sha256").update(value).digest("hex")

function fixture() {
  const archiveDirectory = makeTempDir()
  const darwin = Buffer.from("node-darwin-arm64", "utf8")
  const windows = Buffer.from("node-win-arm64", "utf8")
  writeFileSync(join(archiveDirectory, "node-test-darwin-arm64.tar.gz"), darwin)
  writeFileSync(join(archiveDirectory, "node-test-win-arm64.zip"), windows)
  const trustedExpectedArchives = [
    {
      target: "darwin-arm64",
      fileName: "node-test-darwin-arm64.tar.gz",
      sha256: sha256(darwin),
    },
    {
      target: "win32-arm64",
      fileName: "node-test-win-arm64.zip",
      sha256: sha256(windows),
    },
  ]
  const shasumsBytes = Buffer.from(
    [
      `${sha256(windows)}  node-test-win-arm64.zip`,
      `${sha256(darwin)}  node-test-darwin-arm64.tar.gz`,
      `${"f".repeat(64)}  unrelated.tar.gz`,
      "",
    ].join("\n"),
    "utf8",
  )
  const signatureBytes = Buffer.from("detached-signature-fixture", "utf8")
  return {
    archiveDirectory,
    darwin,
    windows,
    trustedExpectedArchives,
    shasumsBytes,
    signatureBytes,
  }
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const directory = tempDirs.pop()
    if (directory) rmSync(directory, { recursive: true, force: true })
  }
})

describe("task005 signed Node release input", () => {
  it("binds exact SHASUMS/signature bytes and streams regular files into sorted receipts", async () => {
    const input = fixture()
    const verifySignature = vi.fn(() => true)
    const result = await collectVerifiedReleaseArchives({ ...input, verifySignature })

    expect(verifySignature).toHaveBeenCalledOnce()
    expect(verifySignature).toHaveBeenCalledWith({
      payloadBytes: input.shasumsBytes,
      signatureBytes: input.signatureBytes,
    })
    expect(result).toEqual({
      status: "verified",
      receipts: [
        {
          target: "darwin-arm64",
          fileName: "node-test-darwin-arm64.tar.gz",
          sizeBytes: input.darwin.byteLength,
          sha256: sha256(input.darwin),
        },
        {
          target: "win32-arm64",
          fileName: "node-test-win-arm64.zip",
          sizeBytes: input.windows.byteLength,
          sha256: sha256(input.windows),
        },
      ],
    })
  })

  it("does not inspect archive files when the detached signature is denied", async () => {
    const input = fixture()
    expect(
      await collectVerifiedReleaseArchives({
        ...input,
        archiveDirectory: join(input.archiveDirectory, "missing"),
        verifySignature: () => false,
      }),
    ).toEqual({ status: "rejected", reasonCode: "node_shasums_signature_invalid" })
  })

  it.each([
    [
      "missing entry",
      (input: ReturnType<typeof fixture>) =>
        Buffer.from(`${input.trustedExpectedArchives[0]?.sha256}  node-test-darwin-arm64.tar.gz\n`),
      "node_shasums_entry_missing:win32-arm64",
    ],
    [
      "wrong pinned digest",
      (input: ReturnType<typeof fixture>) =>
        Buffer.from(
          input.shasumsBytes.toString("utf8").replace(sha256(input.windows), "0".repeat(64)),
        ),
      "node_shasums_digest_mismatch:win32-arm64",
    ],
  ])("rejects a $0", async (_name, buildShasums, expectedReason) => {
    const input = fixture()
    const shasumsBytes = buildShasums(input)
    expect(
      await collectVerifiedReleaseArchives({
        ...input,
        shasumsBytes,
        verifySignature: () => true,
      }),
    ).toEqual({ status: "rejected", reasonCode: expectedReason })
  })

  it("rejects a symlink archive even when its target bytes match", async () => {
    const input = fixture()
    const linkName = join(input.archiveDirectory, "node-test-darwin-arm64.tar.gz")
    rmSync(linkName)
    symlinkSync(join(input.archiveDirectory, "node-test-win-arm64.zip"), linkName)
    const expected = input.trustedExpectedArchives.map((archive) =>
      archive.target === "darwin-arm64" ? { ...archive, sha256: sha256(input.windows) } : archive,
    )
    const shasumsBytes = Buffer.from(
      expected.map((archive) => `${archive.sha256}  ${archive.fileName}`).join("\n"),
    )

    expect(
      await collectVerifiedReleaseArchives({
        ...input,
        trustedExpectedArchives: expected,
        shasumsBytes,
        verifySignature: () => true,
      }),
    ).toEqual({ status: "rejected", reasonCode: "node_archive_path_unsafe:darwin-arm64" })
  })

  it("rejects file bytes that differ from the signed and pinned digest", async () => {
    const input = fixture()
    writeFileSync(join(input.archiveDirectory, "node-test-win-arm64.zip"), "tampered")
    expect(await collectVerifiedReleaseArchives({ ...input, verifySignature: () => true })).toEqual(
      { status: "rejected", reasonCode: "node_archive_digest_mismatch:win32-arm64" },
    )
  })
})
