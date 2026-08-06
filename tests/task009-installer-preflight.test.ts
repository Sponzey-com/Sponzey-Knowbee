import { describe, expect, it } from "vitest"

import { buildInstallerPreflight } from "../packages/core/src/release/installer-preflight.js"

describe("task009 installer preflight", () => {
  it("builds the macOS XDG-compatible layout with one confirmation", () => {
    const result = buildInstallerPreflight({
      hostSupport: { status: "supported", target: "darwin-arm64" },
      paths: { homeDirectory: "/Users/한 사람 (개발)" },
      prerequisites: {
        tlsTrusted: true,
        commands: ["curl", "tar", "gzip", "launchctl", "plutil"],
      },
      disk: { availableBytes: 2_000_000_000, requiredBytes: 1_000_000_000 },
      interaction: { tty: true, nonInteractive: false },
      currentPathEntries: ["/usr/bin"],
    })

    expect(result).toEqual({
      status: "ready",
      target: "darwin-arm64",
      layout: {
        installRoot: "/Users/한 사람 (개발)/Library/Application Support/Knowbee",
        versionsRoot: "/Users/한 사람 (개발)/Library/Application Support/Knowbee/versions",
        currentPointer: "/Users/한 사람 (개발)/Library/Application Support/Knowbee/current",
        stateRoot: "/Users/한 사람 (개발)/.knowbee",
        binDirectory: "/Users/한 사람 (개발)/.local/bin",
        serviceIdentity: "com.sponzey.knowbee",
        serviceDefinition: "/Users/한 사람 (개발)/Library/LaunchAgents/com.sponzey.knowbee.plist",
      },
      mutations: { userPath: true, userService: true, browserLaunch: true },
      userActions: { commandCount: 1, confirmationCount: 1, followUpCommandCount: 0 },
    })
  })

  it("uses explicit Linux XDG roots and accepts gio as the browser adapter", () => {
    expect(
      buildInstallerPreflight({
        hostSupport: { status: "supported", target: "linux-x64" },
        paths: {
          homeDirectory: "/home/a user",
          xdgDataHome: "/mnt/data home",
          xdgConfigHome: "/mnt/config home",
        },
        prerequisites: {
          tlsTrusted: true,
          commands: ["curl", "tar", "gzip", "systemctl", "gio"],
        },
        disk: { availableBytes: 3_000_000_000, requiredBytes: 1_000_000_000 },
        interaction: { tty: false, nonInteractive: true },
        currentPathEntries: ["/home/a user/.local/bin"],
      }),
    ).toEqual({
      status: "ready",
      target: "linux-x64",
      layout: {
        installRoot: "/mnt/data home/knowbee",
        versionsRoot: "/mnt/data home/knowbee/versions",
        currentPointer: "/mnt/data home/knowbee/current",
        stateRoot: "/home/a user/.knowbee",
        binDirectory: "/home/a user/.local/bin",
        serviceIdentity: "knowbee.service",
        serviceDefinition: "/mnt/config home/systemd/user/knowbee.service",
      },
      mutations: { userPath: false, userService: true, browserLaunch: true },
      userActions: { commandCount: 1, confirmationCount: 0, followUpCommandCount: 0 },
    })
  })

  it("uses LocalAppData and a user Scheduled Task on Windows", () => {
    const result = buildInstallerPreflight({
      hostSupport: { status: "supported", target: "win32-arm64" },
      paths: {
        userProfile: "C:\\Users\\한 사람 & Co",
        localAppData: "C:\\Users\\한 사람 & Co\\AppData\\Local",
      },
      prerequisites: {
        tlsTrusted: true,
        commands: ["powershell", "expand-archive", "scheduled-tasks"],
      },
      disk: { availableBytes: 2_000_000_000, requiredBytes: 1_000_000_000 },
      interaction: { tty: true, nonInteractive: false },
      currentPathEntries: [],
    })

    expect(result).toMatchObject({
      status: "ready",
      target: "win32-arm64",
      layout: {
        installRoot: "C:\\Users\\한 사람 & Co\\AppData\\Local\\Knowbee",
        stateRoot: "C:\\Users\\한 사람 & Co\\.knowbee",
        binDirectory: "C:\\Users\\한 사람 & Co\\AppData\\Local\\Knowbee\\bin",
        serviceIdentity: "Sponzey Knowbee",
        serviceDefinition: "Sponzey Knowbee",
      },
      mutations: { userPath: true, userService: true, browserLaunch: true },
      userActions: { commandCount: 1, confirmationCount: 1, followUpCommandCount: 0 },
    })
  })

  it.each([
    [
      "non-TTY without explicit automation",
      { interaction: { tty: false, nonInteractive: false } },
      "installer_non_interactive_flag_required",
    ],
    [
      "insufficient disk",
      { disk: { availableBytes: 100, requiredBytes: 101 } },
      "installer_disk_insufficient",
    ],
    [
      "untrusted TLS",
      {
        prerequisites: { tlsTrusted: false, commands: ["curl", "tar", "gzip", "systemctl", "gio"] },
      },
      "installer_tls_unavailable",
    ],
    [
      "missing systemd user command",
      { prerequisites: { tlsTrusted: true, commands: ["curl", "tar", "gzip", "gio"] } },
      "installer_prerequisite_missing:systemctl",
    ],
  ])("blocks $0 before mutation", (_name, override, reasonCode) => {
    const base = {
      hostSupport: { status: "supported" as const, target: "linux-x64" as const },
      paths: { homeDirectory: "/home/test" },
      prerequisites: {
        tlsTrusted: true,
        commands: ["curl", "tar", "gzip", "systemctl", "gio"],
      },
      disk: { availableBytes: 2_000_000_000, requiredBytes: 1_000_000_000 },
      interaction: { tty: true, nonInteractive: false },
      currentPathEntries: [],
    }
    expect(buildInstallerPreflight({ ...base, ...override })).toEqual({
      status: "blocked",
      reasonCode,
    })
  })

  it("rejects unsafe home paths and host/target mismatches", () => {
    const base = {
      prerequisites: {
        tlsTrusted: true,
        commands: ["curl", "tar", "gzip", "launchctl", "plutil"],
      },
      disk: { availableBytes: 2_000_000_000, requiredBytes: 1_000_000_000 },
      interaction: { tty: true, nonInteractive: false },
      currentPathEntries: [],
    }
    expect(
      buildInstallerPreflight({
        ...base,
        hostSupport: { status: "supported", target: "darwin-x64" },
        paths: { homeDirectory: "../escape" },
      }),
    ).toEqual({ status: "blocked", reasonCode: "installer_path_invalid" })
    expect(
      buildInstallerPreflight({
        ...base,
        hostSupport: { status: "supported", target: "win32-x64" },
        paths: { homeDirectory: "/Users/test" },
      }),
    ).toEqual({ status: "blocked", reasonCode: "installer_path_invalid" })
  })
})
