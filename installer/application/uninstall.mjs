#!/usr/bin/env node
import { execFile as execFileCallback } from "node:child_process"
import { randomUUID } from "node:crypto"
import { lstat, readFile, rm } from "node:fs/promises"
import { homedir, platform } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

import { parseInstallerLifecycleArguments, uninstallKnowbee } from "./lifecycle.mjs"

const execFile = promisify(execFileCallback)

function reject(reasonCode) {
  return { status: "rejected", reasonCode }
}

async function defaultRunner(command, args, environment) {
  try {
    const result = await execFile(command, args, {
      timeout: 30_000,
      maxBuffer: 64 * 1024,
      windowsHide: true,
      env: environment,
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

async function removeDefinition(path) {
  const metadata = await lstat(path).catch(() => undefined)
  if (metadata && (!metadata.isFile() || metadata.isSymbolicLink()))
    return reject("installer_lifecycle_service_definition_unsafe")
  await rm(path, { force: true })
  return { status: "removed" }
}

export function createLifecycleServiceRemovalPort(input) {
  const runner = input.runner ?? defaultRunner
  return Object.freeze({
    async stop() {
      if (input.platform === "darwin") {
        const domain = `gui/${input.uid}`
        const label = "com.sponzey.knowbee"
        const definitionPath = join(
          input.homeDirectory,
          "Library",
          "LaunchAgents",
          "com.sponzey.knowbee.plist",
        )
        const inspected = await runner(
          "/bin/launchctl",
          ["print", `${domain}/${label}`],
          input.childEnvironment,
        )
        if (inspected.status === 0) {
          const stopped = await runner(
            "/bin/launchctl",
            ["bootout", domain, label],
            input.childEnvironment,
          )
          if (stopped.status !== 0) return reject("installer_lifecycle_service_stop_failed")
        } else if (await lstat(definitionPath).catch(() => undefined)) {
          return reject("installer_lifecycle_service_inspection_failed")
        }
        const removed = await removeDefinition(definitionPath)
        return removed.status === "removed"
          ? { status: inspected.status === 0 ? "stopped" : "absent" }
          : removed
      }
      if (input.platform === "linux") {
        const inspected = await runner(
          "systemctl",
          ["--user", "show", "knowbee.service", "--property=LoadState", "--value"],
          input.childEnvironment,
        )
        if (inspected.status !== 0) return reject("installer_lifecycle_service_inspection_failed")
        const present = inspected.status === 0 && inspected.stdout.trim() !== "not-found"
        if (present) {
          const stopped = await runner(
            "systemctl",
            ["--user", "disable", "--now", "knowbee.service"],
            input.childEnvironment,
          )
          if (stopped.status !== 0) return reject("installer_lifecycle_service_stop_failed")
        }
        const removed = await removeDefinition(
          join(input.homeDirectory, ".config", "systemd", "user", "knowbee.service"),
        )
        if (removed.status !== "removed") return removed
        const reloaded = await runner(
          "systemctl",
          ["--user", "daemon-reload"],
          input.childEnvironment,
        )
        return reloaded.status === 0
          ? { status: present ? "stopped" : "absent" }
          : reject("installer_lifecycle_service_reload_failed")
      }
      if (input.platform === "win32") {
        const result = await runner(
          input.powershellPath,
          [
            "-NoProfile",
            "-NonInteractive",
            "-File",
            input.windowsHelperPath,
            "-Operation",
            "Stop",
            "-StartMode",
            "Start",
            "-TaskName",
            "Sponzey Knowbee",
            "-Execute",
            "unused",
            "-Application",
            "unused",
            "-WorkingDirectory",
            "unused",
            "-UserId",
            input.userId,
          ],
          input.childEnvironment,
        )
        return result.status === 0
          ? { status: "stopped" }
          : reject("installer_lifecycle_service_stop_failed")
      }
      return reject("installer_lifecycle_service_platform_invalid")
    },
  })
}

export async function runInstallerLifecycle(input) {
  const parsed = parseInstallerLifecycleArguments(input?.values)
  if (parsed.status === "rejected") return parsed
  return uninstallKnowbee({
    ...input.config,
    purge: parsed.purge,
    service: input.service,
    owner: input.owner,
    isProcessAlive: input.isProcessAlive,
  })
}

function runtimeComposition() {
  const hostPlatform = platform()
  const homeDirectory = homedir()
  const rawEnvironment = { ...process.env }
  const childEnvironment = {
    ...(rawEnvironment.PATH ? { PATH: rawEnvironment.PATH } : {}),
    ...(rawEnvironment.HOME ? { HOME: rawEnvironment.HOME } : {}),
    ...(rawEnvironment.XDG_RUNTIME_DIR ? { XDG_RUNTIME_DIR: rawEnvironment.XDG_RUNTIME_DIR } : {}),
    ...(rawEnvironment.DBUS_SESSION_BUS_ADDRESS
      ? { DBUS_SESSION_BUS_ADDRESS: rawEnvironment.DBUS_SESSION_BUS_ADDRESS }
      : {}),
    ...(rawEnvironment.SystemRoot ? { SystemRoot: rawEnvironment.SystemRoot } : {}),
  }
  if (hostPlatform === "win32") {
    const localAppData = rawEnvironment.LOCALAPPDATA
    const username = rawEnvironment.USERNAME
    const systemRoot = rawEnvironment.SystemRoot
    if (!localAppData || !username || !systemRoot) return undefined
    const installRoot = join(localAppData, "Knowbee")
    const userId = rawEnvironment.USERDOMAIN
      ? `${rawEnvironment.USERDOMAIN}\\${username}`
      : username
    return {
      config: {
        platform: hostPlatform,
        installRoot,
        installerStateRoot: join(installRoot, "installer-state"),
        launcherDirectory: join(installRoot, "bin"),
        applicationStateRoot: join(homeDirectory, ".knowbee"),
      },
      serviceInput: {
        platform: hostPlatform,
        powershellPath: join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
        windowsHelperPath: join(
          dirname(fileURLToPath(import.meta.url)),
          "windows-scheduled-task.ps1",
        ),
        userId,
        childEnvironment,
      },
    }
  }
  const dataRoot = rawEnvironment.XDG_DATA_HOME || join(homeDirectory, ".local", "share")
  const installRoot = join(dataRoot, "knowbee")
  const uid = typeof process.getuid === "function" ? process.getuid() : undefined
  if (!Number.isSafeInteger(uid)) return undefined
  return {
    config: {
      platform: hostPlatform,
      installRoot,
      installerStateRoot: join(installRoot, "installer-state"),
      launcherDirectory: join(homeDirectory, ".local", "bin"),
      applicationStateRoot: join(homeDirectory, ".knowbee"),
    },
    serviceInput: { platform: hostPlatform, homeDirectory, uid, childEnvironment },
  }
}

async function main() {
  const composition = runtimeComposition()
  const result = composition
    ? await runInstallerLifecycle({
        values: process.argv.slice(2),
        config: composition.config,
        service: createLifecycleServiceRemovalPort(composition.serviceInput),
        owner: { pid: process.pid, token: randomUUID(), startedAt: Date.now() },
        isProcessAlive(pid) {
          try {
            process.kill(pid, 0)
            return true
          } catch (error) {
            return Boolean(error && typeof error === "object" && error.code === "EPERM")
          }
        },
      })
    : reject("installer_lifecycle_host_config_invalid")
  process.stdout.write(`${JSON.stringify(result)}\n`)
  if (result.status !== "uninstalled") process.exitCode = 1
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main().catch(() => {
    process.stdout.write(`${JSON.stringify(reject("installer_lifecycle_failed"))}\n`)
    process.exitCode = 1
  })
}
