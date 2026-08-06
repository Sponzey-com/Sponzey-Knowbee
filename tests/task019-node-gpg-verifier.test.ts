import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { createNodeReleaseGpgVerifier } from "../scripts/prepare-installer-inputs.mjs"

const directories: string[] = []

afterEach(() => {
  while (directories.length > 0) {
    const directory = directories.pop()
    if (directory) rmSync(directory, { recursive: true, force: true })
  }
})

describe("task019 Node release GPG verifier", () => {
  it("passes exact copied bytes to gpgv without exposing payload or tool output", async () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), "knowbee-gpg-test-"))
    directories.push(temporaryRoot)
    let observed: string[] = []
    const verify = createNodeReleaseGpgVerifier({
      gpgvPath: "/trusted/gpgv",
      keyringBytes: Buffer.from("keyring"),
      temporaryRoot,
      run: async (executable: string, args: string[]) => {
        observed = [executable, ...args]
        expect(executable).toBe("/trusted/gpgv")
        expect(readFileSync(args[1])).toEqual(Buffer.from("keyring"))
        expect(readFileSync(args[2])).toEqual(Buffer.from("signature"))
        expect(readFileSync(args[3])).toEqual(Buffer.from("checksums"))
      },
    })
    expect(
      await verify({
        payloadBytes: Buffer.from("checksums"),
        signatureBytes: Buffer.from("signature"),
      }),
    ).toBe(true)
    expect(observed[1]).toBe("--keyring")
    expect(JSON.stringify(observed)).not.toContain("checksums")
  })

  it("returns false rather than leaking verifier failure details", async () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), "knowbee-gpg-reject-"))
    directories.push(temporaryRoot)
    const verify = createNodeReleaseGpgVerifier({
      gpgvPath: "/trusted/gpgv",
      keyringBytes: Buffer.from("keyring"),
      temporaryRoot,
      run: async () => {
        throw new Error("sensitive gpg diagnostic")
      },
    })
    expect(
      await verify({ payloadBytes: Buffer.from("payload"), signatureBytes: Buffer.from("sig") }),
    ).toBe(false)
  })
})
