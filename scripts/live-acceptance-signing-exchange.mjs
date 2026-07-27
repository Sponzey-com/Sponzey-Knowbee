#!/usr/bin/env node
import {
  closeSync,
  fsyncSync,
  linkSync,
  lstatSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { dirname, resolve } from "node:path"

import {
  assembleLiveAcceptanceBundle,
  createLiveAcceptanceSigningRequest,
} from "../packages/core/src/release/live-acceptance-signing-exchange.js"
import { loadTrustedLiveAcceptanceVerifier } from "./lib/live-acceptance-verifier.mjs"

function parseOptions(values) {
  const options = new Map()
  for (let index = 0; index < values.length; index += 2) {
    const name = values[index]
    const value = values[index + 1]
    if (!name?.startsWith("--") || !value?.trim() || options.has(name)) {
      throw new Error("live_acceptance_exchange_arguments_invalid")
    }
    options.set(name, value)
  }
  return options
}

function requireExactOptions(options, names) {
  if (options.size !== names.length || names.some((name) => !options.has(name))) {
    throw new Error("live_acceptance_exchange_arguments_invalid")
  }
}

function readJsonFile(path, reasonCode) {
  const resolved = resolve(path)
  try {
    const stat = lstatSync(resolved)
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size === 0 || stat.size > 1024 * 1024) {
      throw new Error(reasonCode)
    }
    return JSON.parse(readFileSync(resolved, "utf8"))
  } catch {
    throw new Error(reasonCode)
  }
}

function writeJsonExclusive(path, value) {
  const outputPath = resolve(path)
  const temporaryPath = resolve(
    dirname(outputPath),
    `.${process.pid}.${Date.now()}.live-acceptance.tmp`,
  )
  let descriptor
  try {
    descriptor = openSync(temporaryPath, "wx", 0o600)
    writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, "utf8")
    fsyncSync(descriptor)
    closeSync(descriptor)
    descriptor = undefined
    linkSync(temporaryPath, outputPath)
  } catch {
    throw new Error("live_acceptance_exchange_output_failed")
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
    try {
      unlinkSync(temporaryPath)
    } catch {
      // The temporary file may not have been created.
    }
  }
}

function candidateFrom(value) {
  const candidate = value?.candidate
  return {
    appVersion: candidate?.appVersion,
    gitTag: candidate?.gitTag,
    gitCommit: candidate?.gitCommit,
  }
}

function main() {
  const [command, ...values] = process.argv.slice(2)
  const options = parseOptions(values)
  const now = Date.now()

  if (command === "request") {
    requireExactOptions(options, ["--input", "--public-key", "--output"])
    const payload = readJsonFile(
      options.get("--input"),
      "live_acceptance_signing_input_load_failed",
    )
    const verifier = loadTrustedLiveAcceptanceVerifier(options.get("--public-key"))
    const created = createLiveAcceptanceSigningRequest({
      value: payload,
      expectedCandidate: candidateFrom(payload),
      requestedKeyId: verifier.keyId,
      now,
    })
    if (created.status === "rejected") throw new Error(created.reasonCode)
    writeJsonExclusive(options.get("--output"), created.request)
    process.stdout.write('{"status":"request_created"}\n')
    return
  }

  if (command === "assemble") {
    requireExactOptions(options, ["--request", "--signature-response", "--public-key", "--output"])
    const request = readJsonFile(
      options.get("--request"),
      "live_acceptance_signing_request_load_failed",
    )
    const response = readJsonFile(
      options.get("--signature-response"),
      "live_acceptance_signature_response_load_failed",
    )
    const verifier = loadTrustedLiveAcceptanceVerifier(options.get("--public-key"))
    const assembled = assembleLiveAcceptanceBundle({
      request,
      response,
      expectedCandidate: candidateFrom(request?.payload),
      now,
      verifySignature: verifier.verifySignature,
    })
    if (assembled.status === "rejected") throw new Error(assembled.reasonCode)
    writeJsonExclusive(options.get("--output"), assembled.bundle)
    process.stdout.write('{"status":"bundle_assembled"}\n')
    return
  }

  throw new Error("live_acceptance_exchange_command_invalid")
}

try {
  main()
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
}
