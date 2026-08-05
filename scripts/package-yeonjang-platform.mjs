#!/usr/bin/env node
import { createHash } from "node:crypto"
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  readSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { basename, dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(__dirname, "..")
const YEONJANG_PACKAGE_ENV = Object.freeze({
  targetDir: process.env.YEONJANG_TARGET_DIR,
  localAppData: process.env.LOCALAPPDATA,
  profile: process.env.YEONJANG_PROFILE || "release",
  binaryPath: process.env.YEONJANG_BINARY_PATH,
})

const TARGETS = {
  "darwin-arm64": { os: "darwin", cpu: "arm64", binaryName: "knowbee-yeonjang" },
  "darwin-x64": { os: "darwin", cpu: "x64", binaryName: "knowbee-yeonjang" },
  "linux-x64": { os: "linux", cpu: "x64", libc: "glibc", binaryName: "knowbee-yeonjang" },
  "win32-arm64": { os: "win32", cpu: "arm64", binaryName: "knowbee-yeonjang.exe" },
  "win32-x64": { os: "win32", cpu: "x64", binaryName: "knowbee-yeonjang.exe" },
}

function parseArgs(argv) {
  const options = {
    target: null,
    binary: null,
    outputDir: resolve(rootDir, "release/npm"),
    version: null,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--target") options.target = argv[++index] ?? null
    else if (arg === "--binary") options.binary = argv[++index] ?? null
    else if (arg === "--output-dir") options.outputDir = resolve(argv[++index] ?? options.outputDir)
    else if (arg === "--version") options.version = argv[++index] ?? null
    else throw new Error(`Unknown option: ${arg}`)
  }
  return options
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"))
}

function packageVersion(explicitVersion) {
  if (explicitVersion?.trim()) return explicitVersion.trim().replace(/^v/i, "")
  const rootPackage = readJson(join(rootDir, "package.json"))
  return String(rootPackage.version ?? "0.1.0")
}

function uniquePaths(paths) {
  return [...new Set(paths.filter(Boolean))]
}

function defaultTargetDirs(target) {
  const dirs = [YEONJANG_PACKAGE_ENV.targetDir]
  if (target.startsWith("win32-") && YEONJANG_PACKAGE_ENV.localAppData) {
    dirs.push(join(YEONJANG_PACKAGE_ENV.localAppData, "Yeonjang", "target"))
  }
  dirs.push(join(rootDir, "Yeonjang", "target"))
  return uniquePaths(dirs.map((dir) => (dir ? resolve(dir) : null)))
}

function binaryCandidates(targetKey, explicitBinary) {
  const target = TARGETS[targetKey]
  const profile = YEONJANG_PACKAGE_ENV.profile
  return uniquePaths([
    explicitBinary ? resolve(explicitBinary) : null,
    YEONJANG_PACKAGE_ENV.binaryPath ? resolve(YEONJANG_PACKAGE_ENV.binaryPath) : null,
    ...defaultTargetDirs(targetKey).map((targetDir) => join(targetDir, profile, target.binaryName)),
  ])
}

function resolveBinaryPath(target, explicitBinary) {
  const candidates = binaryCandidates(target, explicitBinary)
  const binaryPath = candidates.find((candidate) => existsSync(candidate))
  if (binaryPath) return binaryPath

  throw new Error(
    [
      "Yeonjang binary does not exist.",
      "Checked candidates:",
      ...candidates.map((candidate) => `- ${candidate}`),
    ].join("\n"),
  )
}

function copyIfPresent(sourcePath, targetPath) {
  if (!existsSync(sourcePath)) return
  mkdirSync(dirname(targetPath), { recursive: true })
  copyFileSync(sourcePath, targetPath)
}

function fileIdentity(path, publicName) {
  const metadata = lstatSync(path)
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`Yeonjang package input is not a regular file: ${publicName}`)
  }
  const digest = createHash("sha256")
  const buffer = Buffer.allocUnsafe(64 * 1024)
  const descriptor = openSync(path, "r")
  try {
    while (true) {
      const count = readSync(descriptor, buffer, 0, buffer.length, null)
      if (count === 0) break
      digest.update(buffer.subarray(0, count))
    }
  } finally {
    closeSync(descriptor)
  }
  return {
    name: publicName,
    sizeBytes: metadata.size,
    sha256: `sha256:${digest.digest("hex")}`,
  }
}

function readExecutableHeader(path) {
  const buffer = Buffer.alloc(4096)
  const descriptor = openSync(path, "r")
  try {
    const count = readSync(descriptor, buffer, 0, buffer.length, 0)
    return buffer.subarray(0, count)
  } finally {
    closeSync(descriptor)
  }
}

function inspectExecutableTarget(path) {
  const header = readExecutableHeader(path)
  if (header.length >= 8 && header.readUInt32LE(0) === 0xfeedfacf) {
    const cpu = header.readUInt32LE(4)
    if (cpu === 0x0100000c) return { targetKey: "darwin-arm64", format: "mach_o_64" }
    if (cpu === 0x01000007) return { targetKey: "darwin-x64", format: "mach_o_64" }
  }
  if (
    header.length >= 20
    && header[0] === 0x7f
    && header.subarray(1, 4).toString("ascii") === "ELF"
    && header[4] === 2
    && header[5] === 1
    && header.readUInt16LE(18) === 62
  ) {
    return { targetKey: "linux-x64", format: "elf_64" }
  }
  if (header.length >= 64 && header.subarray(0, 2).toString("ascii") === "MZ") {
    const peOffset = header.readUInt32LE(0x3c)
    if (
      peOffset <= header.length - 6
      && header.subarray(peOffset, peOffset + 4).equals(Buffer.from([0x50, 0x45, 0, 0]))
    ) {
      const machine = header.readUInt16LE(peOffset + 4)
      if (machine === 0x8664) return { targetKey: "win32-x64", format: "pe_32_plus" }
      if (machine === 0xaa64) return { targetKey: "win32-arm64", format: "pe_32_plus" }
    }
  }
  throw new Error("Yeonjang executable target is unsupported or malformed")
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  if (!options.target || !TARGETS[options.target]) {
    throw new Error(`--target must be one of: ${Object.keys(TARGETS).join(", ")}`)
  }
  const target = TARGETS[options.target]
  const binaryPath = resolveBinaryPath(options.target, options.binary)
  const executableTarget = inspectExecutableTarget(binaryPath)
  if (executableTarget.targetKey !== options.target) {
    throw new Error("Yeonjang executable target does not match the package target")
  }

  const version = packageVersion(options.version)
  const packageDir = join(options.outputDir, `yeonjang-${options.target}`)
  const binDir = join(packageDir, "bin")
  const targetBinaryPath = join(binDir, target.binaryName)
  rmSync(packageDir, { recursive: true, force: true })
  mkdirSync(binDir, { recursive: true })
  const sourceBinaryIdentity = {
    ...fileIdentity(binaryPath, target.binaryName),
    format: executableTarget.format,
    targetKey: executableTarget.targetKey,
  }
  copyFileSync(binaryPath, targetBinaryPath)
  if (target.os !== "win32") chmodSync(targetBinaryPath, 0o755)
  const stagedBinaryIdentity = {
    ...fileIdentity(targetBinaryPath, target.binaryName),
    format: executableTarget.format,
    targetKey: executableTarget.targetKey,
  }
  if (
    sourceBinaryIdentity.sizeBytes !== stagedBinaryIdentity.sizeBytes
    || sourceBinaryIdentity.sha256 !== stagedBinaryIdentity.sha256
  ) {
    throw new Error("Yeonjang staged binary identity mismatch")
  }

  const permissionsPath = join(rootDir, "Yeonjang", "manifests", "permissions.json")
  const stagedPermissionsPath = join(packageDir, "manifests", "permissions.json")
  const protocolPath = join(rootDir, "Yeonjang", "src", "protocol.rs")
  const stagedProtocolPath = join(packageDir, "protocol", "protocol.rs")
  copyIfPresent(permissionsPath, stagedPermissionsPath)
  copyIfPresent(protocolPath, stagedProtocolPath)
  const releaseIdentity = {
    schemaId: "yeonjang.package-identity.v1",
    schemaVersion: 1,
    packageVersion: version,
    target: {
      key: options.target,
      os: target.os,
      cpu: target.cpu,
      ...(target.libc ? { libc: target.libc } : {}),
    },
    binary: stagedBinaryIdentity,
    contracts: {
      permissions: fileIdentity(stagedPermissionsPath, "manifests/permissions.json"),
      protocol: fileIdentity(stagedProtocolPath, "protocol/protocol.rs"),
    },
  }
  writeFileSync(
    join(packageDir, "release-identity.json"),
    `${JSON.stringify(releaseIdentity, null, 2)}\n`,
    "utf-8",
  )

  const packageJson = {
    name: `@sponzey/yeonjang-${options.target}`,
    version,
    type: "module",
    os: [target.os],
    cpu: [target.cpu],
    ...(target.libc ? { libc: [target.libc] } : {}),
    files: ["bin", "index.js", "release-identity.json", "manifests", "protocol"],
    exports: {
      ".": "./index.js",
    },
  }
  writeFileSync(join(packageDir, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`, "utf-8")
  writeFileSync(
    join(packageDir, "index.js"),
    [
      "import { createHash } from \"node:crypto\"",
      "import { closeSync, openSync, readFileSync, readSync, statSync } from \"node:fs\"",
      "import { fileURLToPath } from \"node:url\"",
      "",
      `export const yeonjangBinaryName = ${JSON.stringify(target.binaryName)}`,
      `export const yeonjangBinaryPath = fileURLToPath(new URL(${JSON.stringify(`./bin/${basename(targetBinaryPath)}`)}, import.meta.url))`,
      "export const yeonjangReleaseIdentityPath = fileURLToPath(new URL(\"./release-identity.json\", import.meta.url))",
      "",
      "function digestFile(path) {",
      "  const digest = createHash(\"sha256\")",
      "  const buffer = Buffer.allocUnsafe(64 * 1024)",
      "  const descriptor = openSync(path, \"r\")",
      "  try {",
      "    while (true) {",
      "      const count = readSync(descriptor, buffer, 0, buffer.length, null)",
      "      if (count === 0) break",
      "      digest.update(buffer.subarray(0, count))",
      "    }",
      "  } finally {",
      "    closeSync(descriptor)",
      "  }",
      "  return `sha256:${digest.digest(\"hex\")}`",
      "}",
      "",
      "export function verifyYeonjangPackageIdentity() {",
      "  try {",
      "    const identity = JSON.parse(readFileSync(yeonjangReleaseIdentityPath, \"utf-8\"))",
      "    if (identity?.schemaId !== \"yeonjang.package-identity.v1\" || identity?.schemaVersion !== 1) {",
      "      return { outcome: \"rejected\", reason: \"identity_contract_invalid\" }",
      "    }",
      "    const metadata = statSync(yeonjangBinaryPath)",
      "    if (!metadata.isFile() || metadata.size !== identity.binary?.sizeBytes || digestFile(yeonjangBinaryPath) !== identity.binary?.sha256) {",
      "      return { outcome: \"rejected\", reason: \"binary_identity_mismatch\" }",
      "    }",
      "    return { outcome: \"verified\" }",
      "  } catch {",
      "    return { outcome: \"rejected\", reason: \"identity_unavailable\" }",
      "  }",
      "}",
      "",
    ].join("\n"),
    "utf-8",
  )
  console.log(`Yeonjang npm package staged: ${packageDir}`)
}

main()
