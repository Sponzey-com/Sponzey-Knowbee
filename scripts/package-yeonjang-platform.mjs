#!/usr/bin/env node
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { basename, dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(__dirname, "..")

const TARGETS = {
  "darwin-arm64": { os: "darwin", cpu: "arm64", binaryName: "knowbee-yeonjang" },
  "darwin-x64": { os: "darwin", cpu: "x64", binaryName: "knowbee-yeonjang" },
  "linux-x64": { os: "linux", cpu: "x64", libc: "glibc", binaryName: "knowbee-yeonjang" },
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
  const dirs = [process.env.YEONJANG_TARGET_DIR]
  if (target === "win32-x64" && process.env.LOCALAPPDATA) {
    dirs.push(join(process.env.LOCALAPPDATA, "Yeonjang", "target"))
  }
  dirs.push(join(rootDir, "Yeonjang", "target"))
  return uniquePaths(dirs.map((dir) => (dir ? resolve(dir) : null)))
}

function binaryCandidates(targetKey, explicitBinary) {
  const target = TARGETS[targetKey]
  const profile = process.env.YEONJANG_PROFILE || "release"
  return uniquePaths([
    explicitBinary ? resolve(explicitBinary) : null,
    process.env.YEONJANG_BINARY_PATH ? resolve(process.env.YEONJANG_BINARY_PATH) : null,
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

function main() {
  const options = parseArgs(process.argv.slice(2))
  if (!options.target || !TARGETS[options.target]) {
    throw new Error(`--target must be one of: ${Object.keys(TARGETS).join(", ")}`)
  }
  const target = TARGETS[options.target]
  const binaryPath = resolveBinaryPath(options.target, options.binary)

  const version = packageVersion(options.version)
  const packageDir = join(options.outputDir, `yeonjang-${options.target}`)
  const binDir = join(packageDir, "bin")
  const targetBinaryPath = join(binDir, target.binaryName)
  rmSync(packageDir, { recursive: true, force: true })
  mkdirSync(binDir, { recursive: true })
  copyFileSync(binaryPath, targetBinaryPath)
  if (target.os !== "win32") chmodSync(targetBinaryPath, 0o755)

  copyIfPresent(
    join(rootDir, "Yeonjang", "manifests", "permissions.json"),
    join(packageDir, "manifests", "permissions.json"),
  )
  copyIfPresent(
    join(rootDir, "Yeonjang", "src", "protocol.rs"),
    join(packageDir, "protocol", "protocol.rs"),
  )

  const packageJson = {
    name: `@sponzey/yeonjang-${options.target}`,
    version,
    type: "module",
    os: [target.os],
    cpu: [target.cpu],
    ...(target.libc ? { libc: [target.libc] } : {}),
    files: ["bin", "index.js", "manifests", "protocol"],
    exports: {
      ".": "./index.js",
    },
  }
  writeFileSync(join(packageDir, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`, "utf-8")
  writeFileSync(
    join(packageDir, "index.js"),
    [
      "import { fileURLToPath } from \"node:url\"",
      "",
      `export const yeonjangBinaryName = ${JSON.stringify(target.binaryName)}`,
      `export const yeonjangBinaryPath = fileURLToPath(new URL(${JSON.stringify(`./bin/${basename(targetBinaryPath)}`)}, import.meta.url))`,
      "",
    ].join("\n"),
    "utf-8",
  )
  console.log(`Yeonjang npm package staged: ${packageDir}`)
}

main()
