#!/usr/bin/env node
import { execFile as execFileCallback } from "node:child_process"
import { constants as fsConstants } from "node:fs"
import { lstat, mkdtemp, open, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { isAbsolute, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

import { prepareInstallerBundleInputs } from "./lib/installer-input-preparation.mjs"

const execFile = promisify(execFileCallback)
const SHASUMS_LIMIT = 128 * 1024
const SIGNATURE_LIMIT = 64 * 1024
const KEYRING_LIMIT = 4 * 1024 * 1024

function reject(reasonCode) {
  return { status: "rejected", reasonCode }
}

export function createNodeReleaseGpgVerifier(input) {
  const run =
    input.run ??
    ((executable, args) =>
      execFile(executable, args, {
        env: {},
        maxBuffer: 64 * 1024,
        timeout: 30_000,
        windowsHide: true,
      }))
  return async ({ payloadBytes, signatureBytes }) => {
    let directory
    try {
      directory = await mkdtemp(join(input.temporaryRoot ?? tmpdir(), "knowbee-node-gpg-"))
      const keyringPath = join(directory, "trusted-keyring.kbx")
      const signaturePath = join(directory, "SHASUMS256.txt.sig")
      const payloadPath = join(directory, "SHASUMS256.txt")
      await Promise.all([
        writeFile(keyringPath, input.keyringBytes, { flag: "wx", mode: 0o600 }),
        writeFile(signaturePath, signatureBytes, { flag: "wx", mode: 0o600 }),
        writeFile(payloadPath, payloadBytes, { flag: "wx", mode: 0o600 }),
      ])
      await run(input.gpgvPath, ["--keyring", keyringPath, signaturePath, payloadPath])
      return true
    } catch {
      return false
    } finally {
      if (directory) await rm(directory, { recursive: true, force: true }).catch(() => undefined)
    }
  }
}

function parseArguments(argv) {
  const names = [
    "--package-version",
    "--input-dir",
    "--shasums",
    "--signature",
    "--keyring",
    "--gpgv",
    "--output-dir",
  ]
  if (!Array.isArray(argv) || argv.length !== names.length * 2) {
    return reject("installer_input_arguments_invalid")
  }
  const allowed = new Set(names)
  const values = new Map()
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]
    const value = argv[index + 1]
    if (
      typeof name !== "string" ||
      !allowed.has(name) ||
      values.has(name) ||
      typeof value !== "string" ||
      value.length === 0
    ) {
      return reject("installer_input_arguments_invalid")
    }
    values.set(name, value)
  }
  return { status: "parsed", values }
}

async function readRegularFile(path, limit) {
  let file
  try {
    const resolved = resolve(path)
    const metadata = await lstat(resolved, { bigint: true })
    if (
      !metadata.isFile() ||
      metadata.isSymbolicLink() ||
      metadata.size <= 0n ||
      metadata.size > BigInt(limit)
    ) {
      return reject("installer_input_file_unsafe")
    }
    const noFollow = typeof fsConstants.O_NOFOLLOW === "number" ? fsConstants.O_NOFOLLOW : 0
    file = await open(resolved, fsConstants.O_RDONLY | noFollow)
    const before = await file.stat({ bigint: true })
    const bytes = await file.readFile()
    const after = await file.stat({ bigint: true })
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs
    ) {
      return reject("installer_input_file_changed")
    }
    return { status: "ready", bytes }
  } catch {
    return reject("installer_input_file_unsafe")
  } finally {
    await file?.close().catch(() => undefined)
  }
}

export async function runInstallerInputPreparationCli(argv) {
  const parsed = parseArguments(argv)
  if (parsed.status !== "parsed") return parsed
  const gpgvPath = parsed.values.get("--gpgv")
  if (!isAbsolute(gpgvPath)) return reject("installer_input_gpgv_unsafe")
  const gpgv = await lstat(gpgvPath).catch(() => undefined)
  if (!gpgv?.isFile() || gpgv.isSymbolicLink() || (gpgv.mode & 0o111) === 0) {
    return reject("installer_input_gpgv_unsafe")
  }
  const [shasums, signature, keyring] = await Promise.all([
    readRegularFile(parsed.values.get("--shasums"), SHASUMS_LIMIT),
    readRegularFile(parsed.values.get("--signature"), SIGNATURE_LIMIT),
    readRegularFile(parsed.values.get("--keyring"), KEYRING_LIMIT),
  ])
  const invalid = [shasums, signature, keyring].find((value) => value.status !== "ready")
  if (invalid) return invalid
  return prepareInstallerBundleInputs(
    {
      packageVersion: parsed.values.get("--package-version"),
      inputDirectory: parsed.values.get("--input-dir"),
      outputDirectory: parsed.values.get("--output-dir"),
      shasumsBytes: shasums.bytes,
      signatureBytes: signature.bytes,
    },
    {
      verifyNodeSignature: createNodeReleaseGpgVerifier({
        gpgvPath,
        keyringBytes: keyring.bytes,
      }),
    },
  )
}

async function main() {
  const result = await runInstallerInputPreparationCli(process.argv.slice(2))
  process.stdout.write(`${JSON.stringify(result)}\n`)
  if (result.status !== "ready") process.exitCode = 1
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) await main()
