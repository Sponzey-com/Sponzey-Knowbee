#!/usr/bin/env node
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, relative, resolve, sep } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import {
  buildNpmCleanInstallReceipt,
  verifyNpmCleanInstallReceipt,
} from "../packages/core/src/release/npm-install-receipt.js"

const EXPECTED_PACKAGES = Object.freeze([
  ["cli", "@sponzey/cli"],
  ["core", "@sponzey/core"],
  ["knowbee", "@sponzey/knowbee"],
  ["webui", "@sponzey/webui"],
])

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"))
}

export function inspectStagedPackageSet(packages) {
  const expectedNames = EXPECTED_PACKAGES.map(([, name]) => name).sort()
  const names = packages.map((item) => item.name).sort()
  if (new Set(names).size !== names.length || names.join("\n") !== expectedNames.join("\n")) {
    throw new Error(`Staged npm packages must be exactly: ${expectedNames.join(", ")}`)
  }

  const versions = new Set(packages.map((item) => item.version))
  if (versions.size !== 1) {
    throw new Error("Staged npm packages must use one version")
  }

  return Object.freeze({
    packages: Object.freeze(
      [...packages]
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((item) => Object.freeze({ ...item })),
    ),
    version: packages[0]?.version,
  })
}

function digestDirectory(directory) {
  const hash = createHash("sha256")
  const visit = (current) => {
    for (const entry of readdirSync(current).sort()) {
      const path = join(current, entry)
      const stat = lstatSync(path)
      if (stat.isSymbolicLink()) throw new Error(`Staged package symlink is forbidden: ${path}`)
      if (stat.isDirectory()) {
        visit(path)
        continue
      }
      if (!stat.isFile()) throw new Error(`Unsupported staged package entry: ${path}`)
      hash.update(relative(directory, path).split(sep).join("/"))
      hash.update("\0")
      hash.update(String(stat.mode & 0o777))
      hash.update("\0")
      hash.update(readFileSync(path))
      hash.update("\0")
    }
  }
  visit(directory)
  return hash.digest("hex")
}

export function captureStagedNpmPackageSet(stageDir) {
  const resolvedStageDir = resolve(stageDir)
  const packages = readdirSync(resolvedStageDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() && existsSync(join(resolvedStageDir, entry.name, "package.json")),
    )
    .map((entry) => {
      const directoryName = entry.name
      const directory = join(resolvedStageDir, directoryName)
      const manifest = readJson(join(directory, "package.json"))
      return {
        directory,
        name: String(manifest.name ?? ""),
        version: String(manifest.version ?? ""),
        digestSha256: digestDirectory(directory),
      }
    })
  for (const [directoryName] of EXPECTED_PACKAGES) {
    if (!packages.some((item) => item.directory === join(resolvedStageDir, directoryName))) {
      throw new Error(`Staged package is missing: ${directoryName}`)
    }
  }
  for (const [directoryName, expectedName] of EXPECTED_PACKAGES) {
    const item = packages.find(
      (candidate) => candidate.directory === join(resolvedStageDir, directoryName),
    )
    if (!item) throw new Error(`Staged package is missing: ${directoryName}`)
    if (item.name !== expectedName) {
      throw new Error(`Unexpected staged package name for ${directoryName}: ${item.name}`)
    }
  }
  return inspectStagedPackageSet(packages)
}

function loadStagedPackageSet(stageDir) {
  return captureStagedNpmPackageSet(stageDir)
}

function run(command, args, options) {
  return execFileSync(command, args, {
    cwd: options.cwd,
    encoding: "utf-8",
    env: options.processEnv,
    stdio: ["ignore", "pipe", "pipe"],
  })
}

function packPackage(npmCommand, packageDirectory, tarballDir, processEnv) {
  const output = run(
    npmCommand,
    ["pack", packageDirectory, "--pack-destination", tarballDir, "--json", "--ignore-scripts"],
    { cwd: tarballDir, processEnv },
  )
  const records = JSON.parse(output)
  const filename = records[0]?.filename
  if (typeof filename !== "string" || filename.length === 0) {
    throw new Error("npm pack did not return a tarball filename")
  }
  return join(tarballDir, filename)
}

export function buildNpmCleanInstallEnvironment(options) {
  const environment = Object.fromEntries(
    Object.entries(options.processEnv).filter(
      ([key]) => !["NODE_PATH", "NODE_OPTIONS", "TEST"].includes(key) && !key.startsWith("VITEST"),
    ),
  )
  environment.NODE_ENV = "production"
  environment.KNOWBEE_LOG_LEVEL = environment.KNOWBEE_LOG_LEVEL || "product"
  environment.npm_config_audit = "false"
  environment.npm_config_fund = "false"
  environment.npm_config_ignore_scripts = "true"
  environment.npm_config_cache = resolve(options.cacheDir)
  return Object.freeze(environment)
}

export function runNpmCleanInstallSmoke(options) {
  const stageDir = resolve(options.stageDir)
  const ownsWorkDir = !options.workDir
  const workDir = resolve(options.workDir ?? mkdtempSync(join(tmpdir(), "knowbee-install-smoke-")))
  const npmCommand = options.npmCommand ?? (options.platform === "win32" ? "npm.cmd" : "npm")
  const nodeCommand = options.nodeCommand ?? process.execPath
  const processEnv = buildNpmCleanInstallEnvironment({
    processEnv: options.processEnv,
    cacheDir: join(workDir, "npm-cache"),
  })

  try {
    const packageSet = loadStagedPackageSet(stageDir)
    const packageDescriptors = packageSet.packages.map(({ name, version, digestSha256 }) => ({
      name,
      version,
      digestSha256,
    }))
    const tarballDir = join(workDir, "tarballs")
    mkdirSync(tarballDir, { recursive: true })
    const tarballs = packageSet.packages.map((item) => ({
      name: item.name,
      path: packPackage(npmCommand, item.directory, tarballDir, processEnv),
    }))
    const dependencies = Object.fromEntries(
      tarballs.map((item) => [item.name, `file:${item.path}`]),
    )
    writeFileSync(
      join(workDir, "package.json"),
      `${JSON.stringify({ name: "knowbee-install-smoke-consumer", private: true, dependencies }, null, 2)}\n`,
      "utf-8",
    )

    run(
      npmCommand,
      [
        "install",
        "--omit=optional",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "--package-lock=false",
      ],
      { cwd: workDir, processEnv },
    )
    const cliEntrypoint = join(workDir, "node_modules", "@sponzey", "knowbee", "bin", "knowbee.js")
    const cliOutput = run(nodeCommand, [cliEntrypoint, "--help"], { cwd: workDir, processEnv })
    if (!cliOutput.includes("Usage: knowbee")) {
      throw new Error("Installed Knowbee CLI did not return its help output")
    }
    const acceptanceHelpOutput = run(
      nodeCommand,
      [cliEntrypoint, "smoke", "acceptance", "--help"],
      { cwd: workDir, processEnv },
    )
    if (!acceptanceHelpOutput.includes("--check")) {
      throw new Error("Installed Knowbee CLI did not expose acceptance readiness")
    }
    const serveExportOutput = run(
      nodeCommand,
      [
        "--input-type=module",
        "--eval",
        [
          'const module = await import("@sponzey/core/serve")',
          "console.log(JSON.stringify(Object.keys(module).sort()))",
        ].join(";"),
      ],
      { cwd: workDir, processEnv },
    )
    const serveExports = JSON.parse(serveExportOutput)
    if (
      !Array.isArray(serveExports) ||
      serveExports.join(",") !== "runServeEntry,serveCommand"
    ) {
      throw new Error("Installed Core serve artifact did not expose the verified entry contract")
    }
    const built = buildNpmCleanInstallReceipt({
      packages: packageDescriptors,
      runtime: {
        nodeVersion: run(nodeCommand, ["--version"], { cwd: workDir, processEnv }).trim(),
        npmVersion: run(npmCommand, ["--version"], { cwd: workDir, processEnv }).trim(),
        platform: options.platform,
        arch: options.arch ?? process.arch,
      },
      issuedAt: options.issuedAt ?? Date.now(),
      cliHelpVerified: true,
    })
    if (built.status === "rejected") throw new Error(built.reasonCode)
    const current = captureStagedNpmPackageSet(stageDir)
    const verification = verifyNpmCleanInstallReceipt({
      receipt: built.receipt,
      packages: current.packages.map(({ name, version, digestSha256 }) => ({
        name,
        version,
        digestSha256,
      })),
    })
    if (verification.status === "rejected") throw new Error(verification.reasonCode)
    return built.receipt
  } finally {
    if (ownsWorkDir) rmSync(workDir, { recursive: true, force: true })
  }
}

function parseArgs(argv) {
  const options = { stageDir: "release/npm", json: false, keepWorkDir: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--stage-dir") options.stageDir = argv[++index] ?? options.stageDir
    else if (arg === "--json") options.json = true
    else if (arg === "--keep-work-dir") options.keepWorkDir = true
    else throw new Error(`Unknown option: ${arg}`)
  }
  return options
}

function main() {
  const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..")
  const args = parseArgs(process.argv.slice(2))
  const workDir = args.keepWorkDir
    ? mkdtempSync(join(tmpdir(), "knowbee-install-smoke-kept-"))
    : undefined
  const summary = runNpmCleanInstallSmoke({
    stageDir: resolve(rootDir, args.stageDir),
    workDir,
    platform: process.platform,
    arch: process.arch,
    nodeCommand: process.execPath,
    processEnv: { ...process.env },
  })
  if (args.json) console.log(JSON.stringify(summary, null, 2))
  else {
    console.log(`Knowbee npm clean install smoke: ${summary.status}`)
    console.log(`  version: ${summary.packageVersion}`)
    console.log(`  packages: ${summary.packageCount}`)
    if (workDir) console.log(`  retained work directory: ${workDir}`)
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : ""
if (import.meta.url === invokedPath) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
