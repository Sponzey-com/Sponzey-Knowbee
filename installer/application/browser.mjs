import { execFile as execFileCallback } from "node:child_process"
import { promisify } from "node:util"

const execFile = promisify(execFileCallback)
const WEBUI_URL = "http://127.0.0.1:18888/"

function reject(reasonCode) {
  return { status: "rejected", reasonCode }
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
    return { status: Number.isSafeInteger(error?.code) ? error.code : 1 }
  }
}

export function createInstallerBrowserPort(input) {
  if (input?.disabled === true) {
    return Object.freeze({
      async open() {
        return { status: "skipped" }
      },
    })
  }
  if (input?.platform !== "darwin" && input?.platform !== "linux" && input?.platform !== "win32")
    throw new Error("installer_browser_port_input_invalid")
  const runner = input.runner ?? defaultRunner
  return Object.freeze({
    async open() {
      if (input.platform === "darwin") {
        const result = await runner("/usr/bin/open", [WEBUI_URL])
        return result.status === 0
          ? { status: "opened", tool: "open" }
          : reject("installer_browser_open_failed")
      }
      if (input.platform === "linux") {
        const xdg = await runner("xdg-open", [WEBUI_URL])
        if (xdg.status === 0) return { status: "opened", tool: "xdg-open" }
        const gio = await runner("gio", ["open", WEBUI_URL])
        return gio.status === 0
          ? { status: "opened", tool: "gio" }
          : reject("installer_browser_open_failed")
      }
      const result = await runner(input.powershellPath, [
        "-NoProfile",
        "-NonInteractive",
        "-File",
        input.helperPath,
        "-Uri",
        WEBUI_URL,
      ])
      return result.status === 0
        ? { status: "opened", tool: "Start-Process" }
        : reject("installer_browser_open_failed")
    },
  })
}
