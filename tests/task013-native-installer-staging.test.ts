import { execFileSync, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
  chmodSync,
  lstatSync,
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

const directories: string[] = []

function temporaryDirectory(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix))
  directories.push(directory)
  return directory
}

function unsignedFixture(
  kind: "regular" | "symlink",
  selectedTarget: "darwin-arm64" | "win32-x64" = "darwin-arm64",
) {
  const root = temporaryDirectory("knowbee-native-staging-")
  const content = join(root, "content")
  const bin = join(content, "bin")
  mkdirSync(bin, { recursive: true })
  const entrypointName = selectedTarget === "win32-x64" ? "knowbee.cmd" : "knowbee"
  if (kind === "regular") {
    writeFileSync(join(bin, entrypointName), "#!/bin/sh\nprintf '%s\\n' staged\n")
    chmodSync(join(bin, entrypointName), 0o755)
  } else {
    symlinkSync("/bin/sh", join(bin, entrypointName))
  }
  const selectedArchive = selectedTarget === "win32-x64" ? "zip" : "tar.gz"
  const archive = join(root, `knowbee-9.8.7-${selectedTarget}.${selectedArchive}`)
  if (selectedArchive === "zip") {
    execFileSync("zip", ["-qr", archive, "bin"], { cwd: content })
  } else {
    execFileSync("tar", ["-czf", archive, "-C", content, "bin"])
  }
  const archiveBytes = readFileSync(archive)

  const targets = [
    ["darwin-arm64", "tar.gz"],
    ["darwin-x64", "tar.gz"],
    ["linux-x64", "tar.gz"],
    ["win32-arm64", "zip"],
    ["win32-x64", "zip"],
  ] as const
  const manifest = Buffer.from(
    `${JSON.stringify({
      kind: "knowbee.install.manifest",
      schemaVersion: 2,
      releaseVersion: "9.8.7",
      channel: "stable",
      node: { version: "24.18.0", moduleAbi: 137 },
      artifacts: targets.map(([target, archiveKind], index) => ({
        target,
        archive: archiveKind,
        name: `knowbee-9.8.7-${target}.${archiveKind}`,
        sizeBytes: target === selectedTarget ? archiveBytes.byteLength : 1_000 + index,
        sha256:
          target === selectedTarget
            ? createHash("sha256").update(archiveBytes).digest("hex")
            : String.fromCharCode(97 + index).repeat(64),
        entrypoint: target.startsWith("win32-") ? "bin/knowbee.cmd" : "bin/knowbee",
        nodeModuleAbi: 137,
        ...(target === "linux-x64" ? { libc: "glibc" } : {}),
      })),
    })}\n`,
  )
  const manifestPath = join(root, "manifest.json")
  const stage = join(root, "stage")
  writeFileSync(manifestPath, manifest)
  return { root, archive, manifestPath, stage, selectedTarget }
}

function stage(input: ReturnType<typeof unsignedFixture>) {
  return spawnSync(
    "cargo",
    [
      "run",
      "--quiet",
      "--manifest-path",
      "installer/verifier/Cargo.toml",
      "--",
      "--manifest",
      input.manifestPath,
      "--target",
      input.selectedTarget,
      "--artifact",
      input.archive,
      "--stage",
      input.stage,
    ],
    { cwd: process.cwd(), encoding: "utf8" },
  )
}

afterEach(() => {
  while (directories.length > 0) {
    const directory = directories.pop()
    if (directory) rmSync(directory, { recursive: true, force: true })
  }
})

describe("task013 native installer staging", () => {
  it.each([
    ["darwin-arm64", "bin/knowbee"],
    ["win32-x64", "bin/knowbee.cmd"],
  ] as const)(
    "verifies and stages a regular %s archive with its exact entrypoint",
    (target, entrypoint) => {
      const input = unsignedFixture("regular", target)
      const result = stage(input)
      expect(result.status, result.stderr).toBe(0)
      expect(JSON.parse(result.stdout)).toMatchObject({
        status: "verified",
        target,
        stagedEntrypoint: entrypoint,
      })
      expect(readFileSync(join(input.stage, entrypoint), "utf8")).toContain("staged")
      expect(lstatSync(join(input.stage, entrypoint)).isFile()).toBe(true)
    },
    120_000,
  )

  it("rejects an unsigned archive containing a symlink and removes its stage", () => {
    const input = unsignedFixture("symlink")
    const result = stage(input)
    expect(result.status).toBe(1)
    expect(JSON.parse(result.stdout)).toEqual({
      status: "rejected",
      reasonCode: "artifact_archive_unsafe",
    })
    expect(() => lstatSync(input.stage)).toThrow()
    expect(result.stdout).not.toContain(input.root)
  }, 120_000)

  it("rejects changed archive bytes before creating a stage", () => {
    const input = unsignedFixture("regular")
    writeFileSync(
      input.archive,
      Buffer.concat([readFileSync(input.archive), Buffer.from("changed")]),
    )
    const result = stage(input)
    expect(result.status).toBe(1)
    expect(JSON.parse(result.stdout)).toEqual({
      status: "rejected",
      reasonCode: "artifact_size_mismatch",
    })
    expect(() => lstatSync(input.stage)).toThrow()
  }, 120_000)
})
