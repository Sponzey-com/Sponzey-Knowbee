import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { createInstallerBrowserPort } from "../installer/application/browser.mjs"
import {
  createPosixUserPathPort,
  createWindowsUserPathPort,
} from "../installer/application/user-environment.mjs"

const roots: string[] = []

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop()
    if (root) rmSync(root, { recursive: true, force: true })
  }
})

describe("task018 installer user environment", () => {
  it("adds one managed POSIX login PATH block, is idempotent and can restore exact prior bytes", async () => {
    const homeDirectory = mkdtempSync(join(tmpdir(), "knowbee-user-path-"))
    roots.push(homeDirectory)
    const launcherDirectory = join(homeDirectory, ".local", "bin")
    mkdirSync(launcherDirectory, { recursive: true })
    writeFileSync(join(homeDirectory, ".profile"), "# existing profile\n")
    const port = createPosixUserPathPort({
      homeDirectory,
      launcherDirectory,
      shellPath: "/bin/bash",
      currentPath: "/usr/bin:/bin",
    })
    const applied = await port.apply()
    expect(applied).toMatchObject({ status: "configured", changed: true })
    const profile = readFileSync(join(homeDirectory, ".profile"), "utf8")
    expect(profile).toContain("Sponzey Knowbee installer")
    expect(profile).toContain("$HOME/.local/bin:$PATH")
    expect(await port.apply()).toMatchObject({ status: "configured", changed: false })
    expect(readFileSync(join(homeDirectory, ".profile"), "utf8")).toBe(profile)
    expect(await port.rollback(applied)).toEqual({ status: "rolled_back" })
    expect(readFileSync(join(homeDirectory, ".profile"), "utf8")).toBe("# existing profile\n")
  })

  it("rejects a symlinked POSIX profile without replacing its target", async () => {
    const homeDirectory = mkdtempSync(join(tmpdir(), "knowbee-user-path-unsafe-"))
    roots.push(homeDirectory)
    const target = join(homeDirectory, "outside")
    writeFileSync(target, "outside\n")
    symlinkSync(target, join(homeDirectory, ".zprofile"))
    const port = createPosixUserPathPort({
      homeDirectory,
      launcherDirectory: join(homeDirectory, ".local", "bin"),
      shellPath: "/bin/zsh",
      currentPath: "/usr/bin",
    })
    expect(await port.apply()).toEqual({
      status: "rejected",
      reasonCode: "installer_path_profile_unsafe",
    })
    expect(readFileSync(target, "utf8")).toBe("outside\n")
  })

  it("uses a static Windows user-PATH helper with exact argv and no policy bypass", async () => {
    const calls: Array<{ command: string; args: string[] }> = []
    const port = createWindowsUserPathPort({
      powershellPath: "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
      helperPath: "C:\\Knowbee\\windows-user-path.ps1",
      launcherDirectory: "C:\\Users\\Bee\\AppData\\Local\\Knowbee\\bin",
      async runner(command: string, args: string[]) {
        calls.push({ command, args })
        return {
          status: 0,
          stdout: '{"status":"configured","changed":true,"previousPath":"C:\\\\Windows"}\n',
          stderr: "",
        }
      },
    })
    const receipt = await port.apply()
    expect(receipt).toMatchObject({ status: "configured", changed: true })
    expect(calls[0]?.command).toContain("WindowsPowerShell")
    expect(calls[0]?.args).toContain("-File")
    expect(calls[0]?.args.join(" ")).not.toMatch(/ExecutionPolicy|EncodedCommand/iu)
    expect(readFileSync("installer/application/windows-user-path.ps1", "utf8")).toContain(
      "EnvironmentVariableTarget]::User",
    )
  })

  it("opens only the fixed local WebUI and changes Linux tool after an xdg-open failure", async () => {
    const calls: Array<[string, string[]]> = []
    const port = createInstallerBrowserPort({
      platform: "linux",
      async runner(command: string, args: string[]) {
        calls.push([command, args])
        return { status: command === "gio" ? 0 : 1, stdout: "", stderr: "" }
      },
    })
    expect(await port.open()).toEqual({ status: "opened", tool: "gio" })
    expect(calls).toEqual([
      ["xdg-open", ["http://127.0.0.1:18888/"]],
      ["gio", ["open", "http://127.0.0.1:18888/"]],
    ])
  })

  it("makes no browser process call when no-browser is selected", async () => {
    expect(await createInstallerBrowserPort({ disabled: true }).open()).toEqual({
      status: "skipped",
    })
  })
})
