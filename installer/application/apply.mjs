#!/usr/bin/env node
import { randomUUID } from "node:crypto"
import { lstat, readFile } from "node:fs/promises"
import { homedir, platform } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { createInstallerBrowserPort } from "./browser.mjs"
import { applyInstallerCandidate } from "./install-application.mjs"
import { selectOptionalYeonjang } from "./optional-components.mjs"
import {
  buildPosixServiceDefinition,
  completeInstallerPolicyTransaction,
  completePosixInstallerTransaction,
  createLocalInstallerHealthPort,
  createPosixServicePort,
  rollbackInstallerTransaction,
} from "./posix-service.mjs"
import { createPosixUserPathPort, createWindowsUserPathPort } from "./user-environment.mjs"
import {
  buildWindowsScheduledTaskDefinition,
  completeWindowsInstallerTransaction,
  createWindowsServicePort,
} from "./windows-service.mjs"

const SHA256_ID = /^sha256:[a-f0-9]{64}$/u
const TARGET = /^(?:darwin-(?:arm64|x64)|linux-x64|win32-(?:arm64|x64))$/u

function reject(reasonCode) {
  process.stdout.write(`${JSON.stringify({ status: "rejected", reasonCode })}\n`)
  process.exitCode = 1
}

function parseArguments(values) {
  const args = values[0] === "installer" && values[1] === "apply" ? values.slice(2) : values
  if (args.length < 6) return undefined
  const parsed = {}
  for (let index = 0; index < 6; index += 2) {
    const flag = args[index]
    const value = args[index + 1]
    if (typeof value !== "string" || value.length === 0) return undefined
    if (flag === "--manifest" && parsed.manifest === undefined) parsed.manifest = value
    else if (flag === "--verified-receipt" && parsed.receipt === undefined) parsed.receipt = value
    else if (flag === "--target" && parsed.target === undefined) parsed.target = value
    else return undefined
  }
  const options = {
    withYeonjang: false,
    service: true,
    start: true,
    addPath: true,
    browser: true,
    json: false,
  }
  const seen = new Set()
  for (const flag of args.slice(6)) {
    if (seen.has(flag)) return undefined
    seen.add(flag)
    if (flag === "--with-yeonjang") options.withYeonjang = true
    else if (flag === "--no-service") {
      if (seen.has("--no-start")) return undefined
      options.service = false
      options.start = false
    } else if (flag === "--no-start") {
      if (seen.has("--no-service")) return undefined
      options.start = false
    } else if (flag === "--no-add-path") options.addPath = false
    else if (flag === "--no-browser") options.browser = false
    else if (flag === "--json") options.json = true
    else return undefined
  }
  return { ...parsed, options }
}

async function readBoundedRegularFile(path, maximum) {
  const metadata = await lstat(path).catch(() => undefined)
  if (
    !metadata?.isFile() ||
    metadata.isSymbolicLink() ||
    metadata.size === 0 ||
    metadata.size > maximum
  ) {
    return undefined
  }
  return readFile(path)
}

function parseReceipt(bytes) {
  const fields = new Map()
  for (const line of bytes.toString("utf8").split("\n")) {
    if (line === "") continue
    const separator = line.indexOf("=")
    if (separator <= 0) return undefined
    const key = line.slice(0, separator)
    const value = line.slice(separator + 1)
    if (fields.has(key)) return undefined
    fields.set(key, value)
  }
  const allowed = new Set([
    "manifest_sha256",
    "release_version",
    "node_version",
    "node_module_abi",
    "target",
    "archive",
    "name",
    "size_bytes",
    "sha256",
    "entrypoint",
    "staged_entrypoint",
  ])
  if ([...fields.keys()].some((key) => !allowed.has(key))) return undefined
  const releaseVersion = fields.get("release_version")
  const target = fields.get("target")
  const manifestSha256 = fields.get("manifest_sha256")
  const entrypoint = fields.get("entrypoint")
  if (
    !releaseVersion ||
    !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(releaseVersion) ||
    !target ||
    !TARGET.test(target) ||
    !manifestSha256 ||
    !SHA256_ID.test(manifestSha256) ||
    !entrypoint ||
    fields.get("staged_entrypoint") !== entrypoint
  ) {
    return undefined
  }
  return { releaseVersion, target, manifestSha256, entrypoint }
}

function runtimeConfig() {
  const hostPlatform = platform()
  const userHome = homedir()
  const rawEnvironment = { ...process.env }
  if (hostPlatform === "win32") {
    const localAppData = rawEnvironment.LOCALAPPDATA
    const username = rawEnvironment.USERNAME
    const userDomain = rawEnvironment.USERDOMAIN
    const systemRoot = rawEnvironment.SystemRoot
    if (!localAppData || !username || !systemRoot) return undefined
    const installRoot = join(localAppData, "Knowbee")
    return {
      installRoot,
      installerStateRoot: join(installRoot, "installer-state"),
      launcherDirectory: join(installRoot, "bin"),
      applicationStateRoot: join(userHome, ".knowbee"),
      userId: userDomain ? `${userDomain}\\${username}` : username,
      powershellPath: join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
    }
  }
  const dataRoot = rawEnvironment.XDG_DATA_HOME || join(userHome, ".local", "share")
  return {
    installRoot: join(dataRoot, "knowbee"),
    installerStateRoot: join(dataRoot, "knowbee", "installer-state"),
    launcherDirectory: join(userHome, ".local", "bin"),
    applicationStateRoot: join(userHome, ".knowbee"),
    currentPath: rawEnvironment.PATH ?? "",
    shellPath: rawEnvironment.SHELL,
  }
}

async function prepareUserPath({
  hostPlatform,
  config,
  options,
  candidate,
  state,
  store,
  rollbackFilesystem,
}) {
  if (!options.addPath) {
    return { status: "ready", rollback: rollbackFilesystem }
  }
  let port
  try {
    port =
      hostPlatform === "win32"
        ? createWindowsUserPathPort({
            powershellPath: config.powershellPath,
            helperPath: join(
              config.installRoot,
              "versions",
              candidate.releaseVersion,
              "app",
              "installer",
              "windows-user-path.ps1",
            ),
            launcherDirectory: config.launcherDirectory,
          })
        : createPosixUserPathPort({
            homeDirectory: homedir(),
            launcherDirectory: config.launcherDirectory,
            shellPath: config.shellPath,
            currentPath: config.currentPath,
          })
  } catch {
    return rollbackInstallerTransaction({
      state,
      store,
      reasonCode: "installer_path_configuration_invalid",
      rollback: rollbackFilesystem,
    })
  }
  const receipt = await port.apply()
  if (receipt.status !== "configured") {
    return rollbackInstallerTransaction({
      state,
      store,
      reasonCode: "installer_path_configuration_failed",
      rollback: rollbackFilesystem,
    })
  }
  return {
    status: "ready",
    async rollback(values) {
      if (receipt.changed && typeof port.rollback === "function") {
        const reverted = await port.rollback(receipt)
        if (reverted.status !== "rolled_back") return reverted
      }
      return rollbackFilesystem(values)
    },
  }
}

function installerBrowser(hostPlatform, config, candidate, enabled) {
  if (!enabled) return createInstallerBrowserPort({ disabled: true })
  return createInstallerBrowserPort(
    hostPlatform === "win32"
      ? {
          platform: hostPlatform,
          powershellPath: config.powershellPath,
          helperPath: join(
            config.installRoot,
            "versions",
            candidate.releaseVersion,
            "app",
            "installer",
            "windows-open-browser.ps1",
          ),
        }
      : { platform: hostPlatform },
  )
}

async function main() {
  const args = parseArguments(process.argv.slice(2))
  if (!args || !TARGET.test(args.target)) return reject("install_application_arguments_invalid")
  const [manifest, receiptBytes] = await Promise.all([
    readBoundedRegularFile(resolve(args.manifest), 2 * 1024 * 1024),
    readBoundedRegularFile(resolve(args.receipt), 64 * 1024),
  ])
  if (!manifest || !receiptBytes)
    return reject("install_application_evidence_invalid")
  const candidate = parseReceipt(receiptBytes)
  if (!candidate || candidate.target !== args.target)
    return reject("install_application_receipt_invalid")
  const config = runtimeConfig()
  if (!config) return reject("install_application_host_config_invalid")
  const sourceBundleRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
  let optionalYeonjang = { status: "disabled" }
  if (args.options.withYeonjang) {
    const inventoryBytes = await readBoundedRegularFile(
      join(sourceBundleRoot, "bundle-inventory.json"),
      16 * 1024 * 1024,
    )
    let inventory
    try {
      inventory = inventoryBytes ? JSON.parse(inventoryBytes.toString("utf8")) : undefined
    } catch {
      inventory = undefined
    }
    const optional = selectOptionalYeonjang({
      selected: true,
      target: candidate.target,
      inventory,
    })
    if (optional.status !== "ready") return reject(optional.reasonCode)
    optionalYeonjang = optional
  }
  const hostPlatform = platform()
  const uid = typeof process.getuid === "function" ? process.getuid() : undefined
  let completion
  if ((hostPlatform === "darwin" || hostPlatform === "linux") && Number.isSafeInteger(uid)) {
    completion = async ({ state, store, rollbackFilesystem }) => {
      const environment = await prepareUserPath({
        hostPlatform,
        config,
        options: args.options,
        candidate,
        state,
        store,
        rollbackFilesystem,
      })
      if (environment.status !== "ready") return environment
      const serviceInput = {
        platform: hostPlatform,
        launcherPath: join(config.installRoot, "current", candidate.entrypoint),
        stateDirectory: config.applicationStateRoot,
        logsDirectory: join(config.applicationStateRoot, "logs"),
        releaseVersion: candidate.releaseVersion,
        uid,
        start: args.options.start,
      }
      if (!args.options.service) {
        return completeInstallerPolicyTransaction({
          mode: "no-service",
          state,
          store,
          releaseVersion: candidate.releaseVersion,
          stateDirectory: config.applicationStateRoot,
          rollback: environment.rollback,
        })
      }
      const definition = buildPosixServiceDefinition(serviceInput)
      if (definition.status !== "ready") return definition
      const service = createPosixServicePort({
        platform: hostPlatform,
        homeDirectory: homedir(),
        logsDirectory: serviceInput.logsDirectory,
        uid,
      })
      if (!args.options.start) {
        return completeInstallerPolicyTransaction({
          mode: "no-start",
          ...serviceInput,
          state,
          store,
          definition,
          service,
          isExactRegisteredInspection(inspected) {
            return (
              inspected.status === "registered" &&
              inspected.ownerUid === uid &&
              Array.isArray(inspected.command) &&
              inspected.command.length === definition.command.length &&
              inspected.command.every((value, index) => value === definition.command[index])
            )
          },
          async rollback({ previousReleaseVersion }) {
            await service.stop(definition)
            const filesystem = await environment.rollback()
            if (filesystem.status !== "rolled_back" || !previousReleaseVersion) return filesystem
            const previousDefinition = buildPosixServiceDefinition({
              ...serviceInput,
              releaseVersion: previousReleaseVersion,
              start: true,
            })
            if (previousDefinition.status !== "ready") return previousDefinition
            const restored = await service.register(previousDefinition)
            return restored.status === "registered"
              ? { status: "rolled_back" }
              : { status: "rejected", reasonCode: "installer_previous_service_restore_failed" }
          },
        })
      }
      return completePosixInstallerTransaction({
        ...serviceInput,
        state,
        store,
        service,
        health: createLocalInstallerHealthPort(),
        browser: installerBrowser(hostPlatform, config, candidate, args.options.browser),
        async rollback({ previousReleaseVersion }) {
          await service.stop(definition)
          const filesystem = await environment.rollback()
          if (filesystem.status !== "rolled_back" || !previousReleaseVersion) return filesystem
          const previousDefinition = buildPosixServiceDefinition({
            ...serviceInput,
            releaseVersion: previousReleaseVersion,
          })
          if (previousDefinition.status !== "ready") return previousDefinition
          const restored = await service.register(previousDefinition)
          if (restored.status !== "registered") return restored
          const inspected = await service.inspect(previousDefinition)
          return inspected.status === "active"
            ? { status: "rolled_back" }
            : { status: "rejected", reasonCode: "installer_previous_service_restore_failed" }
        },
      })
    }
  } else if (hostPlatform === "win32" && config.userId) {
    completion = async ({ state, store, rollbackFilesystem }) => {
      const environment = await prepareUserPath({
        hostPlatform,
        config,
        options: args.options,
        candidate,
        state,
        store,
        rollbackFilesystem,
      })
      if (environment.status !== "ready") return environment
      const serviceInput = {
        installRoot: config.installRoot,
        stateDirectory: config.applicationStateRoot,
        releaseVersion: candidate.releaseVersion,
        userId: config.userId,
      }
      if (!args.options.service) {
        return completeInstallerPolicyTransaction({
          mode: "no-service",
          state,
          store,
          releaseVersion: candidate.releaseVersion,
          stateDirectory: config.applicationStateRoot,
          rollback: environment.rollback,
        })
      }
      const definition = buildWindowsScheduledTaskDefinition(serviceInput)
      if (definition.status !== "ready") return definition
      const service = createWindowsServicePort({
        powershellPath: config.powershellPath,
        helperPath: join(
          config.installRoot,
          "versions",
          candidate.releaseVersion,
          "app",
          "installer",
          "windows-scheduled-task.ps1",
        ),
      })
      if (!args.options.start) {
        return completeInstallerPolicyTransaction({
          mode: "no-start",
          ...serviceInput,
          state,
          store,
          definition,
          service,
          isExactRegisteredInspection(inspected) {
            return (
              inspected.status === "registered" &&
              inspected.taskName === definition.taskName &&
              inspected.execute === definition.execute &&
              Array.isArray(inspected.arguments) &&
              inspected.arguments.length === definition.arguments.length &&
              inspected.arguments.every((value, index) => value === definition.arguments[index]) &&
              inspected.workingDirectory === definition.workingDirectory &&
              inspected.principal?.userId === definition.principal.userId &&
              inspected.principal?.logonType === definition.principal.logonType &&
              inspected.principal?.runLevel === definition.principal.runLevel
            )
          },
          async rollback({ previousReleaseVersion }) {
            await service.stop(definition)
            const filesystem = await environment.rollback()
            if (filesystem.status !== "rolled_back" || !previousReleaseVersion) return filesystem
            const previousDefinition = buildWindowsScheduledTaskDefinition({
              ...serviceInput,
              releaseVersion: previousReleaseVersion,
            })
            if (previousDefinition.status !== "ready") return previousDefinition
            const restored = await service.register(previousDefinition)
            return restored.status === "registered"
              ? { status: "rolled_back" }
              : { status: "rejected", reasonCode: "installer_previous_service_restore_failed" }
          },
        })
      }
      return completeWindowsInstallerTransaction({
        ...serviceInput,
        state,
        store,
        service,
        health: createLocalInstallerHealthPort(),
        browser: installerBrowser(hostPlatform, config, candidate, args.options.browser),
        async rollback({ previousReleaseVersion }) {
          await service.stop(definition)
          const filesystem = await environment.rollback()
          if (filesystem.status !== "rolled_back" || !previousReleaseVersion) return filesystem
          const previousDefinition = buildWindowsScheduledTaskDefinition({
            ...serviceInput,
            releaseVersion: previousReleaseVersion,
          })
          if (previousDefinition.status !== "ready") return previousDefinition
          const restored = await service.register(previousDefinition)
          if (restored.status !== "registered") return restored
          const inspected = await service.inspect(previousDefinition)
          return inspected.status === "active"
            ? { status: "rolled_back" }
            : { status: "rejected", reasonCode: "installer_previous_service_restore_failed" }
        },
      })
    }
  }
  const result = await applyInstallerCandidate({
    ...config,
    sourceBundleRoot,
    candidate,
    profileKey: `service-${Number(args.options.service)}_start-${Number(args.options.start)}_path-${Number(args.options.addPath)}_browser-${Number(args.options.browser)}_yeonjang-${Number(args.options.withYeonjang)}`,
    owner: { pid: process.pid, token: randomUUID(), startedAt: Date.now() },
    isProcessAlive(pid) {
      try {
        process.kill(pid, 0)
        return true
      } catch (error) {
        return Boolean(error && typeof error === "object" && error.code === "EPERM")
      }
    },
    ...(completion ? { complete: completion } : {}),
  })
  process.stdout.write(
    `${JSON.stringify({ ...result, optionalComponents: { yeonjang: optionalYeonjang } })}\n`,
  )
  if (result.status !== "committed" && result.status !== "already_active") process.exitCode = 1
}

await main().catch(() => reject("install_application_failed"))
