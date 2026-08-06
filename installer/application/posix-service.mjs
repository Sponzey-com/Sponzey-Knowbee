import { execFile as execFileCallback } from "node:child_process"
import { createHash } from "node:crypto"
import { randomUUID } from "node:crypto"
import { lstat, mkdir, open, readFile, rename, rm } from "node:fs/promises"
import { join } from "node:path"
import { promisify } from "node:util"

import { reduceInstallerTransaction } from "../../packages/core/src/release/installer-transaction.js"

const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u
const execFile = promisify(execFileCallback)

function reject(reasonCode) {
  return { status: "rejected", reasonCode }
}

function safeAbsolutePath(value) {
  return (
    typeof value === "string" &&
    value.startsWith("/") &&
    value.length <= 1024 &&
    !value.includes("\0") &&
    !value.includes("\n") &&
    !value.includes("\r")
  )
}

function xml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
}

function systemd(value) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("$", "\\$")
    .replaceAll("%", "%%")
}

export function buildPosixServiceDefinition(input) {
  if (
    (input?.platform !== "darwin" && input?.platform !== "linux") ||
    !safeAbsolutePath(input.launcherPath) ||
    !safeAbsolutePath(input.stateDirectory) ||
    !safeAbsolutePath(input.logsDirectory) ||
    !VERSION.test(input.releaseVersion) ||
    !Number.isSafeInteger(input.uid) ||
    input.uid < 0
  ) {
    return reject("installer_service_input_invalid")
  }
  if (input.start !== undefined && typeof input.start !== "boolean") {
    return reject("installer_service_input_invalid")
  }
  const start = input.start !== false
  const command = Object.freeze([input.launcherPath, "serve"])
  if (input.platform === "darwin") {
    return {
      status: "ready",
      kind: "launchd",
      label: "com.sponzey.knowbee",
      command,
      content: `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "https://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.sponzey.knowbee</string>
  <key>ProgramArguments</key>
  <array><string>${xml(input.launcherPath)}</string><string>serve</string></array>
  <key>RunAtLoad</key><${start ? "true" : "false"}/>
  <key>KeepAlive</key><${start ? "true" : "false"}/>
  <key>StandardOutPath</key><string>${xml(`${input.logsDirectory}/gateway.log`)}</string>
  <key>StandardErrorPath</key><string>${xml(`${input.logsDirectory}/gateway-error.log`)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>KNOWBEE_STATE_DIR</key><string>${xml(input.stateDirectory)}</string>
    <key>KNOWBEE_DISPLAY_VERSION</key><string>${xml(input.releaseVersion)}</string>
  </dict>
</dict>
</plist>
`,
      domain: `gui/${input.uid}`,
    }
  }

  return {
    status: "ready",
    kind: "systemd-user",
    label: "knowbee.service",
    command,
    content: `[Unit]
Description=Sponzey Knowbee Gateway
After=network.target

[Service]
Type=simple
ExecStart="${systemd(input.launcherPath)}" "serve"
Restart=on-failure
RestartSec=10
Environment="KNOWBEE_STATE_DIR=${systemd(input.stateDirectory)}"
Environment="KNOWBEE_DISPLAY_VERSION=${systemd(input.releaseVersion)}"
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
`,
    domain: "user",
  }
}

function event(state, type, receiptRef, extra = {}) {
  return {
    type,
    eventId: `installer-${state.revision + 1}-${type}`,
    operationId: state.operationId,
    targetFingerprint: state.targetFingerprint,
    expectedRevision: state.revision,
    ...(receiptRef === undefined ? {} : { receiptRef }),
    ...extra,
  }
}

async function transitionAndSave(store, state, transition) {
  const reduced = reduceInstallerTransaction(state, transition)
  if (reduced.status !== "applied") return reduced
  const saved = await store.save(reduced.state)
  return saved.status === "saved" || saved.status === "unchanged"
    ? { status: "applied", state: reduced.state }
    : saved
}

function fingerprintStateDirectory(stateDirectory) {
  return `sha256:${createHash("sha256").update(stateDirectory).digest("hex")}`
}

async function failAndRollback(input, state, reasonCode) {
  const failure = await transitionAndSave(
    input.store,
    state,
    event(state, "failure_recorded", undefined, { reasonCode }),
  )
  const failedState = failure.status === "applied" ? failure.state : state
  const rollbackStarted = await transitionAndSave(
    input.store,
    failedState,
    event(failedState, "rollback_started"),
  )
  if (rollbackStarted.status !== "applied") {
    return { status: "rejected", reasonCode: "installer_rollback_state_failed", state: failedState }
  }
  const rolledBack = await input.rollback({
    reasonCode,
    previousReleaseVersion: state.previousReleaseId,
  })
  if (rolledBack.status !== "rolled_back") {
    return {
      status: "rejected",
      reasonCode: "installer_rollback_failed",
      state: rollbackStarted.state,
    }
  }
  const rollbackCompleted = await transitionAndSave(
    input.store,
    rollbackStarted.state,
    event(rollbackStarted.state, "rollback_completed", `rollback:${reasonCode}`),
  )
  return rollbackCompleted.status === "applied"
    ? { status: "rolled_back", reasonCode, state: rollbackCompleted.state }
    : {
        status: "rejected",
        reasonCode: "installer_rollback_state_failed",
        state: rollbackStarted.state,
      }
}

export async function rollbackInstallerTransaction(input) {
  if (
    input?.state?.phase !== "activated" ||
    typeof input.store?.save !== "function" ||
    typeof input.rollback !== "function" ||
    typeof input.reasonCode !== "string" ||
    input.reasonCode.length === 0
  ) {
    return reject("installer_rollback_input_invalid")
  }
  return failAndRollback(input, input.state, input.reasonCode)
}

export async function completeInstallerPolicyTransaction(input) {
  if (
    (input?.mode !== "no-service" && input?.mode !== "no-start") ||
    input.state?.phase !== "activated" ||
    typeof input.store?.save !== "function" ||
    typeof input.rollback !== "function" ||
    !VERSION.test(input.releaseVersion) ||
    typeof input.stateDirectory !== "string"
  ) {
    return reject("installer_policy_completion_input_invalid")
  }
  let state = input.state
  if (input.mode === "no-start") {
    if (
      typeof input.definition !== "object" ||
      input.definition === null ||
      typeof input.service?.register !== "function" ||
      typeof input.service?.inspect !== "function" ||
      typeof input.isExactRegisteredInspection !== "function"
    ) {
      return reject("installer_policy_completion_input_invalid")
    }
    const registered = await input.service.register(input.definition, { start: false })
    if (registered.status !== "registered") {
      return failAndRollback(input, state, "installer_service_registration_failed")
    }
    const inspected = await input.service.inspect(input.definition, { start: false })
    if (!input.isExactRegisteredInspection(inspected, input.definition)) {
      return failAndRollback(input, state, "installer_service_identity_mismatch")
    }
  }

  const serviceTransition = await transitionAndSave(
    input.store,
    state,
    event(
      state,
      input.mode === "no-service" ? "service_skipped" : "service_registered",
      input.mode === "no-service" ? "policy:no-service" : "service:registered-inactive",
    ),
  )
  if (serviceTransition.status !== "applied") {
    return failAndRollback(input, state, "installer_transaction_save_failed")
  }
  state = serviceTransition.state

  const healthTransition = await transitionAndSave(
    input.store,
    state,
    event(state, "health_skipped", `policy:${input.mode}`),
  )
  if (healthTransition.status !== "applied") {
    return failAndRollback(input, state, "installer_transaction_save_failed")
  }
  state = healthTransition.state
  const committed = await transitionAndSave(
    input.store,
    state,
    event(state, "commit_completed", `commit:${input.releaseVersion}`),
  )
  return committed.status === "applied"
    ? { status: "committed", state: committed.state, mode: input.mode }
    : failAndRollback(input, state, "installer_transaction_save_failed")
}

export async function completeServiceInstallerTransaction(input) {
  if (
    input?.state?.phase !== "activated" ||
    typeof input.definition !== "object" ||
    input.definition === null ||
    typeof input.store?.save !== "function" ||
    typeof input.service?.register !== "function" ||
    typeof input.service?.inspect !== "function" ||
    typeof input.health?.inspect !== "function" ||
    typeof input.rollback !== "function" ||
    typeof input.isExactServiceInspection !== "function" ||
    !VERSION.test(input.releaseVersion) ||
    typeof input.stateDirectory !== "string"
  ) {
    return reject("installer_completion_input_invalid")
  }
  const definition = input.definition
  let state = input.state

  const registered = await input.service.register(definition)
  if (registered.status !== "registered") {
    return failAndRollback(input, state, "installer_service_registration_failed")
  }
  const inspected = await input.service.inspect(definition)
  if (!input.isExactServiceInspection(inspected, definition)) {
    return failAndRollback(input, state, "installer_service_identity_mismatch")
  }
  const serviceReceipt =
    typeof input.serviceReceipt === "string" && input.serviceReceipt.length > 0
      ? input.serviceReceipt
      : "service:registered"
  const serviceTransition = await transitionAndSave(
    input.store,
    state,
    event(state, "service_registered", serviceReceipt),
  )
  if (serviceTransition.status !== "applied") {
    return failAndRollback(input, state, "installer_transaction_save_failed")
  }
  state = serviceTransition.state

  const health = await input.health.inspect()
  if (
    health.status !== "healthy" ||
    health.releaseVersion !== input.releaseVersion ||
    health.stateDirectoryFingerprint !== fingerprintStateDirectory(input.stateDirectory)
  ) {
    return failAndRollback(input, state, "installer_health_identity_mismatch")
  }
  const healthTransition = await transitionAndSave(
    input.store,
    state,
    event(state, "health_verified", `health:${input.releaseVersion}`),
  )
  if (healthTransition.status !== "applied") {
    return failAndRollback(input, state, "installer_transaction_save_failed")
  }
  state = healthTransition.state

  let browserStatus = "not-requested"
  if (input.browser && typeof input.browser.open === "function") {
    const browser = await input.browser.open()
    if (browser.status !== "opened" && browser.status !== "skipped") {
      return failAndRollback(input, state, "installer_browser_open_failed")
    }
    browserStatus = browser.status
  }

  const committed = await transitionAndSave(
    input.store,
    state,
    event(state, "commit_completed", `commit:${input.releaseVersion}:browser-${browserStatus}`),
  )
  return committed.status === "applied"
    ? { status: "committed", state: committed.state, definition }
    : failAndRollback(input, state, "installer_transaction_save_failed")
}

export async function completePosixInstallerTransaction(input) {
  const definition = buildPosixServiceDefinition(input)
  if (definition.status !== "ready") return definition
  return completeServiceInstallerTransaction({
    ...input,
    definition,
    serviceReceipt: `service:${definition.kind}:${definition.label}`,
    isExactServiceInspection(inspected) {
      return (
        inspected.status === "active" &&
        inspected.ownerUid === input.uid &&
        Array.isArray(inspected.command) &&
        inspected.command.length === definition.command.length &&
        inspected.command.every((value, index) => value === definition.command[index])
      )
    },
  })
}

async function atomicWriteRegularFile(path, content) {
  await mkdir(join(path, ".."), { recursive: true, mode: 0o700 })
  const parent = join(path, "..")
  const parentMetadata = await lstat(parent)
  if (!parentMetadata.isDirectory() || parentMetadata.isSymbolicLink()) {
    throw new Error("installer_service_directory_unsafe")
  }
  const temporaryPath = `${path}.tmp.${process.pid}.${randomUUID()}`
  const file = await open(temporaryPath, "wx", 0o600)
  try {
    await file.writeFile(content, "utf8")
    await file.sync()
  } finally {
    await file.close()
  }
  await rename(temporaryPath, path).catch(async (error) => {
    await rm(temporaryPath, { force: true })
    throw error
  })
}

async function defaultRunner(command, args) {
  try {
    const result = await execFile(command, args, {
      timeout: 30_000,
      maxBuffer: 256 * 1024,
      windowsHide: true,
      env: {},
    })
    return { status: 0, stdout: result.stdout, stderr: result.stderr }
  } catch (error) {
    return {
      status: Number.isSafeInteger(error?.code) ? error.code : 1,
      stdout: typeof error?.stdout === "string" ? error.stdout : "",
      stderr: typeof error?.stderr === "string" ? error.stderr : "",
    }
  }
}

export function createPosixServicePort(input) {
  if (
    (input?.platform !== "darwin" && input?.platform !== "linux") ||
    !safeAbsolutePath(input.homeDirectory) ||
    !Number.isSafeInteger(input.uid) ||
    input.uid < 0
  ) {
    throw new Error("installer_service_port_input_invalid")
  }
  const runner = input.runner ?? defaultRunner
  const definitionPath =
    input.platform === "darwin"
      ? join(input.homeDirectory, "Library", "LaunchAgents", "com.sponzey.knowbee.plist")
      : join(input.homeDirectory, ".config", "systemd", "user", "knowbee.service")

  return Object.freeze({
    async register(definition, options = {}) {
      const start = options.start !== false
      try {
        await mkdir(dirnameOf(definitionPath), { recursive: true, mode: 0o700 })
        await mkdir(input.logsDirectory, { recursive: true, mode: 0o700 })
        await atomicWriteRegularFile(definitionPath, definition.content)
        if (input.platform === "darwin") {
          const lint = await runner("plutil", ["-lint", definitionPath])
          if (lint.status !== 0) return reject("installer_service_definition_invalid")
          await runner("launchctl", ["bootout", definition.domain, definition.label])
          const bootstrap = await runner("launchctl", [
            "bootstrap",
            definition.domain,
            definitionPath,
          ])
          if (bootstrap.status !== 0) return reject("installer_service_bootstrap_failed")
          if (!start) return { status: "registered" }
          const started = await runner("launchctl", [
            "kickstart",
            "-k",
            `${definition.domain}/${definition.label}`,
          ])
          return started.status === 0
            ? { status: "registered" }
            : reject("installer_service_start_failed")
        }
        const reloaded = await runner("systemctl", ["--user", "daemon-reload"])
        if (reloaded.status !== 0) return reject("installer_service_reload_failed")
        const enabled = await runner(
          "systemctl",
          start
            ? ["--user", "enable", "--now", definition.label]
            : ["--user", "enable", definition.label],
        )
        return enabled.status === 0
          ? { status: "registered" }
          : reject("installer_service_start_failed")
      } catch {
        return reject("installer_service_write_failed")
      }
    },
    async inspect(definition, options = {}) {
      const start = options.start !== false
      const stored = await readFile(definitionPath, "utf8").catch(() => undefined)
      if (stored !== definition.content) return reject("installer_service_definition_mismatch")
      if (input.platform === "darwin") {
        const result = await runner("launchctl", [
          "print",
          `${definition.domain}/${definition.label}`,
        ])
        if (
          result.status !== 0 ||
          !result.stdout.includes(`program = ${definition.command[0]}`) ||
          !result.stdout.includes(definition.command[1])
        ) {
          return reject("installer_service_inactive")
        }
      } else {
        const active = start
          ? await runner("systemctl", [
              "--user",
              "show",
              definition.label,
              "--property=ActiveState",
              "--value",
            ])
          : await runner("systemctl", ["--user", "is-enabled", definition.label])
        const command = await runner("systemctl", [
          "--user",
          "show",
          definition.label,
          "--property=ExecStart",
          "--value",
        ])
        if (
          active.status !== 0 ||
          active.stdout.trim() !== (start ? "active" : "enabled") ||
          command.status !== 0 ||
          !command.stdout.includes(`path=${definition.command[0]} ;`) ||
          !command.stdout.includes(`argv[]=${definition.command.join(" ")} ;`)
        ) {
          return reject("installer_service_inactive")
        }
      }
      return {
        status: start ? "active" : "registered",
        ownerUid: input.uid,
        command: [...definition.command],
      }
    },
    async stop(definition) {
      const result =
        input.platform === "darwin"
          ? await runner("launchctl", ["bootout", definition.domain, definition.label])
          : await runner("systemctl", ["--user", "stop", definition.label])
      return result.status === 0 ? { status: "stopped" } : reject("installer_service_stop_failed")
    },
    definitionPath,
  })
}

function dirnameOf(path) {
  const index = path.lastIndexOf("/")
  return index <= 0 ? "/" : path.slice(0, index)
}

export function createLocalInstallerHealthPort(input = {}) {
  const fetchImplementation = input.fetch ?? globalThis.fetch
  const url = input.url ?? "http://127.0.0.1:18888/api/health"
  return Object.freeze({
    async inspect() {
      try {
        const response = await fetchImplementation(url, {
          method: "GET",
          redirect: "error",
          signal: AbortSignal.timeout(15_000),
        })
        if (!response.ok) return reject("installer_health_unavailable")
        const body = await response.json()
        const identity = body?.installIdentity
        if (
          body?.ok !== true ||
          body?.service !== "knowbee-gateway" ||
          typeof identity?.releaseVersion !== "string" ||
          typeof identity?.stateDirectoryFingerprint !== "string" ||
          !/^sha256:[a-f0-9]{64}$/u.test(identity.stateDirectoryFingerprint)
        ) {
          return reject("installer_health_invalid")
        }
        return {
          status: "healthy",
          releaseVersion: identity.releaseVersion,
          stateDirectoryFingerprint: identity.stateDirectoryFingerprint,
        }
      } catch {
        return reject("installer_health_unavailable")
      }
    },
  })
}
