import { execFile as execFileCallback } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import { chmod, lstat, open, readFile, rename, rm } from "node:fs/promises"
import { basename, join } from "node:path"
import { promisify } from "node:util"

const execFile = promisify(execFileCallback)
const BEGIN = "# >>> Sponzey Knowbee installer PATH >>>"
const END = "# <<< Sponzey Knowbee installer PATH <<<"

function reject(reasonCode) {
  return { status: "rejected", reasonCode }
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex")
}

function posixBlock() {
  return `${BEGIN}
case ":$PATH:" in
  *":$HOME/.local/bin:"*) ;;
  *) export PATH="$HOME/.local/bin:$PATH" ;;
esac
${END}
`
}

async function atomicWrite(path, bytes, mode) {
  const temporaryPath = `${path}.tmp.${process.pid}.${randomUUID()}`
  const file = await open(temporaryPath, "wx", mode)
  try {
    await file.writeFile(bytes)
    await file.sync()
  } finally {
    await file.close()
  }
  await rename(temporaryPath, path).catch(async (error) => {
    await rm(temporaryPath, { force: true })
    throw error
  })
  await chmod(path, mode)
}

export function createPosixUserPathPort(input) {
  if (
    typeof input?.homeDirectory !== "string" ||
    !input.homeDirectory.startsWith("/") ||
    input.launcherDirectory !== join(input.homeDirectory, ".local", "bin") ||
    (basename(input.shellPath ?? "") !== "bash" && basename(input.shellPath ?? "") !== "zsh") ||
    typeof input.currentPath !== "string"
  ) {
    throw new Error("installer_path_port_input_invalid")
  }
  const profilePath =
    basename(input.shellPath) === "zsh"
      ? join(input.homeDirectory, ".zprofile")
      : join(input.homeDirectory, ".profile")
  return Object.freeze({
    async apply() {
      if (input.currentPath.split(":").includes(input.launcherDirectory)) {
        return { status: "configured", changed: false }
      }
      const metadata = await lstat(profilePath).catch(() => undefined)
      if (
        metadata &&
        (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > 1024 * 1024)
      ) {
        return reject("installer_path_profile_unsafe")
      }
      const previous = metadata ? await readFile(profilePath) : Buffer.alloc(0)
      const text = previous.toString("utf8")
      const hasBegin = text.includes(BEGIN)
      const hasEnd = text.includes(END)
      if (hasBegin !== hasEnd) return reject("installer_path_profile_marker_invalid")
      if (hasBegin) return { status: "configured", changed: false }
      const separator = previous.length > 0 && !text.endsWith("\n") ? "\n" : ""
      const configured = Buffer.from(`${text}${separator}${posixBlock()}`, "utf8")
      const mode = metadata ? metadata.mode & 0o777 : 0o600
      await atomicWrite(profilePath, configured, mode)
      return {
        status: "configured",
        changed: true,
        profilePath,
        previousExisted: Boolean(metadata),
        previousMode: metadata ? metadata.mode & 0o777 : 0o600,
        previousBase64: previous.toString("base64"),
        configuredSha256: digest(configured),
      }
    },
    async rollback(receipt) {
      if (
        receipt?.status !== "configured" ||
        receipt.changed !== true ||
        receipt.profilePath !== profilePath
      )
        return reject("installer_path_rollback_receipt_invalid")
      const current = await readFile(profilePath).catch(() => undefined)
      if (!current || digest(current) !== receipt.configuredSha256)
        return reject("installer_path_rollback_conflict")
      const previous = Buffer.from(receipt.previousBase64, "base64")
      if (receipt.previousExisted) await atomicWrite(profilePath, previous, receipt.previousMode)
      else await rm(profilePath, { force: true })
      return { status: "rolled_back" }
    },
  })
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

function windowsPath(value) {
  return typeof value === "string" && /^[A-Za-z]:\\/u.test(value) && !/[\0\r\n"]/u.test(value)
}

function parseWindowsReceipt(result) {
  if (result?.status !== 0 || typeof result.stdout !== "string" || result.stdout.length > 64 * 1024)
    return undefined
  try {
    const value = JSON.parse(result.stdout.trim())
    if (
      value?.status !== "configured" ||
      typeof value.changed !== "boolean" ||
      (value.changed &&
        (typeof value.previousPath !== "string" || value.previousPath.length > 32767))
    ) {
      return undefined
    }
    return value
  } catch {
    return undefined
  }
}

export function createWindowsUserPathPort(input) {
  if (
    !windowsPath(input?.powershellPath) ||
    !windowsPath(input?.helperPath) ||
    !windowsPath(input?.launcherDirectory)
  ) {
    throw new Error("installer_windows_path_port_input_invalid")
  }
  const runner = input.runner ?? defaultRunner
  return Object.freeze({
    async apply() {
      const result = parseWindowsReceipt(
        await runner(input.powershellPath, [
          "-NoProfile",
          "-NonInteractive",
          "-File",
          input.helperPath,
          "-Operation",
          "Apply",
          "-LauncherDirectory",
          input.launcherDirectory,
        ]),
      )
      return result ?? reject("installer_windows_path_configuration_failed")
    },
    async rollback(receipt) {
      if (
        receipt?.status !== "configured" ||
        receipt.changed !== true ||
        typeof receipt.previousPath !== "string"
      ) {
        return reject("installer_windows_path_rollback_receipt_invalid")
      }
      const result = await runner(input.powershellPath, [
        "-NoProfile",
        "-NonInteractive",
        "-File",
        input.helperPath,
        "-Operation",
        "Restore",
        "-LauncherDirectory",
        input.launcherDirectory,
        "-PreviousPath",
        receipt.previousPath,
      ])
      return result.status === 0
        ? { status: "rolled_back" }
        : reject("installer_windows_path_rollback_failed")
    },
  })
}
