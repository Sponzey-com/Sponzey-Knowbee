import { createHash } from "node:crypto"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { prepareInstallerBundleInputs } from "../scripts/lib/installer-input-preparation.mjs"
import { INSTALLER_PLATFORM_PROFILES } from "../scripts/lib/installer-platforms.mjs"

const directories: string[] = []

afterEach(() => {
  while (directories.length > 0) {
    const directory = directories.pop()
    if (directory) rmSync(directory, { recursive: true, force: true })
  }
})

function npmFileName(packageName: string): string {
  return `${packageName.slice(1).replace("/", "-")}-9.8.7.tgz`
}

describe("task019 installer input preparation", () => {
  it("binds verified Node and exact package bytes into five immutable plans", async () => {
    const root = mkdtempSync(join(tmpdir(), "knowbee-inputs-"))
    directories.push(root)
    const inputDirectory = join(root, "input")
    const outputDirectory = join(root, "output")
    mkdirSync(inputDirectory)
    const npmNames = ["@sponzey/cli", "@sponzey/core", "@sponzey/knowbee", "@sponzey/webui"]
    for (const name of [
      ...npmNames,
      ...INSTALLER_PLATFORM_PROFILES.map((profile) => profile.yeonjangPackage),
    ]) {
      writeFileSync(join(inputDirectory, npmFileName(name)), `package:${name}\n`)
    }

    const result = await prepareInstallerBundleInputs(
      {
        packageVersion: "9.8.7",
        inputDirectory,
        outputDirectory,
        shasumsBytes: Buffer.from("signed checksums"),
        signatureBytes: Buffer.from("signature"),
      },
      {
        collectNodeArchives: async () => ({
          status: "verified",
          receipts: INSTALLER_PLATFORM_PROFILES.map((profile, index) => ({
            target: profile.target,
            fileName: profile.nodeRuntimeArchive,
            sizeBytes: 1000 + index,
            sha256: profile.nodeRuntimeSha256,
          })),
        }),
        verifyNodeSignature: async () => true,
      },
    )

    expect(result).toEqual({
      status: "ready",
      packageVersion: "9.8.7",
      targets: INSTALLER_PLATFORM_PROFILES.map((profile) => profile.target),
    })
    const receipts = JSON.parse(readFileSync(join(outputDirectory, "input-receipts.json"), "utf8"))
    const core = receipts.npmPackages.find(
      (receipt: { packageName: string }) => receipt.packageName === "@sponzey/core",
    )
    expect(core).toMatchObject({
      packageVersion: "9.8.7",
      sha256: createHash("sha256").update("package:@sponzey/core\n").digest("hex"),
    })
    expect(
      JSON.parse(readFileSync(join(outputDirectory, "plans/linux-x64.json"), "utf8")),
    ).toMatchObject({
      target: "linux-x64",
      yeonjang: { status: "included", packageName: "@sponzey/yeonjang-linux-x64" },
    })
  })

  it("publishes nothing when upstream signature verification fails", async () => {
    const root = mkdtempSync(join(tmpdir(), "knowbee-inputs-reject-"))
    directories.push(root)
    const inputDirectory = join(root, "input")
    const outputDirectory = join(root, "output")
    mkdirSync(inputDirectory)
    const result = await prepareInstallerBundleInputs(
      {
        packageVersion: "9.8.7",
        inputDirectory,
        outputDirectory,
        shasumsBytes: Buffer.from("untrusted"),
        signatureBytes: Buffer.from("signature"),
      },
      {
        collectNodeArchives: async (input: {
          verifySignature: (value: unknown) => Promise<boolean>
        }) =>
          (await input.verifySignature({}))
            ? { status: "verified", receipts: [] }
            : { status: "rejected", reasonCode: "node_shasums_signature_invalid" },
        verifyNodeSignature: async () => false,
      },
    )
    expect(result).toEqual({ status: "rejected", reasonCode: "node_shasums_signature_invalid" })
    expect(() => mkdirSync(outputDirectory)).not.toThrow()
  })
})
