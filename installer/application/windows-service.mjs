import { execFile as execFileCallback } from "node:child_process"
import { promisify } from "node:util"

import { completeServiceInstallerTransaction } from "./posix-service.mjs"

const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u
const execFile = promisify(execFileCallback)

function reject(reasonCode) {
  return { status: "rejected", reasonCode }
}

function safeWindowsAbsolutePath(value) {
  return (
    typeof value === "string" &&
    /^[A-Za-z]:\\/u.test(value) &&
    value.length <= 1024 &&
    !value.includes("\0") &&
    !value.includes("\n") &&
    !value.includes("\r") &&
    !value.includes('"')
  )
}

export function buildWindowsScheduledTaskDefinition(input) {
  if (
    !safeWindowsAbsolutePath(input?.installRoot) ||
    !safeWindowsAbsolutePath(input?.stateDirectory) ||
    !VERSION.test(input?.releaseVersion ?? "") ||
    typeof input?.userId !== "string" ||
    input.userId.length === 0 ||
    input.userId.length > 256 ||
    /[\0\r\n"]/u.test(input.userId)
  ) {
    return reject("installer_windows_service_input_invalid")
  }
  const versionRoot = `${input.installRoot}\\versions\\${input.releaseVersion}`
  return {
    status: "ready",
    taskName: "Sponzey Knowbee",
    execute: `${versionRoot}\\runtime\\node\\node.exe`,
    arguments: [`${versionRoot}\\app\\bin\\knowbee.js`, "serve"],
    workingDirectory: versionRoot,
    environment: {
      KNOWBEE_DISPLAY_VERSION: input.releaseVersion,
      KNOWBEE_STATE_DIR: input.stateDirectory,
    },
    principal: {
      userId: input.userId,
      logonType: "InteractiveToken",
      runLevel: "Limited",
    },
  }
}

async function defaultRunner(command, args) {
  try {
    const result = await execFile(command, args, {
      timeout: 30_000,
      maxBuffer: 64 * 1024,
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

function parseProjection(result) {
  if (result?.status !== 0 || typeof result.stdout !== "string" || result.stdout.length > 64 * 1024)
    return undefined
  const lines = result.stdout.trim().split(/\r?\n/u)
  if (lines.length !== 1) return undefined
  try {
    const value = JSON.parse(lines[0])
    return value && typeof value === "object" && !Array.isArray(value) ? value : undefined
  } catch {
    return undefined
  }
}

function helperArguments(operation, helperPath, definition, options = {}) {
  return [
    "-NoProfile",
    "-NonInteractive",
    "-File",
    helperPath,
    "-Operation",
    operation,
    "-StartMode",
    options.start === false ? "RegisterOnly" : "Start",
    "-TaskName",
    definition.taskName,
    "-Execute",
    definition.execute,
    "-Application",
    definition.arguments[0],
    "-WorkingDirectory",
    definition.workingDirectory,
    "-UserId",
    definition.principal.userId,
  ]
}

export function createWindowsServicePort(input) {
  if (
    !safeWindowsAbsolutePath(input?.helperPath) ||
    (input.powershellPath !== undefined && !safeWindowsAbsolutePath(input.powershellPath))
  ) {
    throw new Error("installer_windows_service_port_input_invalid")
  }
  const runner = input.runner ?? defaultRunner
  const powershellPath = input.powershellPath ?? "powershell.exe"
  return Object.freeze({
    async register(definition, options = {}) {
      const result = parseProjection(
        await runner(
          powershellPath,
          helperArguments("Register", input.helperPath, definition, options),
        ),
      )
      return result?.status === "registered"
        ? { status: "registered" }
        : reject("installer_windows_service_registration_failed")
    },
    async inspect(definition, options = {}) {
      const result = parseProjection(
        await runner(
          powershellPath,
          helperArguments("Inspect", input.helperPath, definition, options),
        ),
      )
      return result ?? reject("installer_windows_service_inspection_failed")
    },
    async stop(definition) {
      const result = parseProjection(
        await runner(powershellPath, helperArguments("Stop", input.helperPath, definition)),
      )
      return result?.status === "stopped"
        ? { status: "stopped" }
        : reject("installer_windows_service_stop_failed")
    },
  })
}

function exactProjection(projection, definition) {
  return (
    projection?.status === "active" &&
    projection.taskName === definition.taskName &&
    projection.execute === definition.execute &&
    Array.isArray(projection.arguments) &&
    projection.arguments.length === definition.arguments.length &&
    projection.arguments.every((value, index) => value === definition.arguments[index]) &&
    projection.workingDirectory === definition.workingDirectory &&
    projection.principal?.userId === definition.principal.userId &&
    projection.principal?.logonType === definition.principal.logonType &&
    projection.principal?.runLevel === definition.principal.runLevel
  )
}

export async function completeWindowsInstallerTransaction(input) {
  const definition = buildWindowsScheduledTaskDefinition(input)
  if (definition.status !== "ready") return definition
  return completeServiceInstallerTransaction({
    ...input,
    definition,
    serviceReceipt: `service:scheduled-task:${definition.taskName}`,
    isExactServiceInspection: exactProjection,
  })
}
