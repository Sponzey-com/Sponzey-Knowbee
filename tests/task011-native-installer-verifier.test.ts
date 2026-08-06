import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

const tempDirs: string[] = []
const manifestPath = "installer/verifier/Cargo.toml"

function makeTempDir(): string {
  const directory = mkdtempSync(join(tmpdir(), "knowbee-native-verifier-"))
  tempDirs.push(directory)
  return directory
}

function manifestBytes(schemaVersion = 2): Buffer {
  const targets = [
    ["darwin-arm64", "tar.gz"],
    ["darwin-x64", "tar.gz"],
    ["linux-x64", "tar.gz"],
    ["win32-arm64", "zip"],
    ["win32-x64", "zip"],
  ] as const
  return Buffer.from(
    `${JSON.stringify({
      kind: "knowbee.install.manifest",
      schemaVersion,
      releaseVersion: "9.8.7",
      channel: "stable",
      node: { version: "24.18.0", moduleAbi: 137 },
      artifacts: targets.map(([target, archive], index) => ({
        target,
        archive,
        name: `knowbee-9.8.7-${target}.${archive}`,
        sizeBytes: 1_000 + index,
        sha256: String.fromCharCode(97 + index).repeat(64),
        entrypoint: target.startsWith("win32-") ? "bin/knowbee.cmd" : "bin/knowbee",
        nodeModuleAbi: 137,
        ...(target === "linux-x64" ? { libc: "glibc" } : {}),
      })),
    })}\n`,
  )
}

function fixture() {
  const directory = makeTempDir()
  const manifest = manifestBytes()
  const paths = {
    manifest: join(directory, "manifest.json"),
  }
  writeFileSync(paths.manifest, manifest)
  return { directory, manifest, paths }
}

function runVerifier(
  input: ReturnType<typeof fixture>,
  target = "darwin-arm64",
  outputFormat?: "shell",
) {
  return spawnSync(
    "cargo",
    [
      "run",
      "--quiet",
      "--manifest-path",
      manifestPath,
      "--",
      "--manifest",
      input.paths.manifest,
      "--target",
      target,
      ...(outputFormat ? ["--output-format", outputFormat] : []),
    ],
    { cwd: process.cwd(), encoding: "utf8" },
  )
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const directory = tempDirs.pop()
    if (directory) rmSync(directory, { recursive: true, force: true })
  }
})

describe("task011 native installer verifier", () => {
  it("builds a locked verifier binary for every supported release target", () => {
    const workflow = readFileSync(".github/workflows/npm-release.yml", "utf8")
    for (const [target, rustTarget] of [
      ["darwin-arm64", "aarch64-apple-darwin"],
      ["darwin-x64", "x86_64-apple-darwin"],
      ["linux-x64", "x86_64-unknown-linux-musl"],
      ["win32-arm64", "aarch64-pc-windows-msvc"],
      ["win32-x64", "x86_64-pc-windows-msvc"],
    ]) {
      expect(workflow).toContain(`installer_target: ${target}`)
      expect(workflow).toContain(`rust_target: ${rustTarget}`)
    }
    expect(workflow).toContain("sudo apt-get update && sudo apt-get install -y musl-tools")
    expect(workflow).toContain(
      "MACOSX_DEPLOYMENT_TARGET: ${{ startsWith(matrix.installer_target, 'darwin-') && '13.5' || '' }}",
    )
    expect(workflow).toContain(
      "cargo build --release --locked --manifest-path installer/verifier/Cargo.toml",
    )
    expect(workflow).toContain("name: installer-verifier-${{ matrix.installer_target }}")
  })

  it("verifies a raw unsigned v2 manifest and emits a bounded exact-target receipt", () => {
    const input = fixture()
    const result = runVerifier(input)
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual({
      status: "verified",
      manifestSha256: `sha256:${createHash("sha256").update(input.manifest).digest("hex")}`,
      releaseVersion: "9.8.7",
      nodeVersion: "24.18.0",
      nodeModuleAbi: 137,
      target: "darwin-arm64",
      archive: "tar.gz",
      name: "knowbee-9.8.7-darwin-arm64.tar.gz",
      sizeBytes: 1_000,
      sha256: "a".repeat(64),
      entrypoint: "bin/knowbee",
    })
    expect(result.stdout).not.toContain(input.directory)
  }, 120_000)

  it("emits an eval-free bounded shell receipt for the POSIX bootstrap", () => {
    const input = fixture()
    const result = runVerifier(input, "darwin-arm64", "shell")
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout.trim().split("\n")).toEqual([
      `manifest_sha256=sha256:${createHash("sha256").update(input.manifest).digest("hex")}`,
      "release_version=9.8.7",
      "node_version=24.18.0",
      "node_module_abi=137",
      "target=darwin-arm64",
      "archive=tar.gz",
      "name=knowbee-9.8.7-darwin-arm64.tar.gz",
      "size_bytes=1000",
      `sha256=${"a".repeat(64)}`,
      "entrypoint=bin/knowbee",
    ])
  }, 120_000)

  it.each([
    [
      "legacy signed v1 manifest",
      (input: ReturnType<typeof fixture>) => writeFileSync(input.paths.manifest, manifestBytes(1)),
      "schema_version_unsupported",
    ],
    ["unsupported target", () => undefined, "manifest_target_unsupported"],
  ])(
    "rejects $0 without raw payload output",
    (_name, mutate, reasonCode) => {
      const input = fixture()
      mutate(input)
      const result = runVerifier(
        input,
        reasonCode === "manifest_target_unsupported" ? "linux-arm64" : undefined,
      )
      expect(result.status).toBe(1)
      expect(JSON.parse(result.stdout)).toEqual({ status: "rejected", reasonCode })
      expect(result.stdout).not.toContain(input.directory)
    },
    120_000,
  )

  it("rejects obsolete signature and public-key arguments", () => {
    const input = fixture()
    const result = spawnSync(
      "cargo",
      [
        "run",
        "--quiet",
        "--manifest-path",
        manifestPath,
        "--",
        "--manifest",
        input.paths.manifest,
        "--signature",
        "legacy.sig",
        "--public-key",
        "legacy.der",
        "--target",
        "darwin-arm64",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    )
    expect(result.status).toBe(1)
    expect(JSON.parse(result.stdout)).toEqual({
      status: "rejected",
      reasonCode: "verifier_arguments_invalid",
    })
  }, 120_000)
})
