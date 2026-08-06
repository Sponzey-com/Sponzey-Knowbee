import type { InstallerTarget } from "./installer-contract.js"

export interface InstallerLayout {
  readonly installRoot: string
  readonly versionsRoot: string
  readonly currentPointer: string
  readonly stateRoot: string
  readonly binDirectory: string
  readonly serviceIdentity: string
  readonly serviceDefinition: string
}

export interface InstallerPreflightInput {
  readonly hostSupport: {
    readonly status: "supported"
    readonly target: InstallerTarget
  }
  readonly paths: {
    readonly homeDirectory?: string
    readonly xdgDataHome?: string
    readonly xdgConfigHome?: string
    readonly userProfile?: string
    readonly localAppData?: string
  }
  readonly prerequisites: {
    readonly tlsTrusted: boolean
    readonly commands: readonly string[]
  }
  readonly disk: {
    readonly availableBytes: number
    readonly requiredBytes: number
  }
  readonly interaction: {
    readonly tty: boolean
    readonly nonInteractive: boolean
  }
  readonly currentPathEntries: readonly string[]
}

export type InstallerPreflightResult =
  | {
      readonly status: "ready"
      readonly target: InstallerTarget
      readonly layout: InstallerLayout
      readonly mutations: {
        readonly userPath: boolean
        readonly userService: true
        readonly browserLaunch: true
      }
      readonly userActions: {
        readonly commandCount: 1
        readonly confirmationCount: 0 | 1
        readonly followUpCommandCount: 0
      }
    }
  | { readonly status: "blocked"; readonly reasonCode: string }

function blocked(reasonCode: string): InstallerPreflightResult {
  return { status: "blocked", reasonCode }
}

function validPosixPath(value: unknown): value is string {
  if (typeof value !== "string" || !value.startsWith("/") || value.includes("\0")) return false
  return value.split("/").every((segment) => segment !== "..")
}

function validWindowsPath(value: unknown): value is string {
  if (typeof value !== "string" || !/^[A-Za-z]:\\/.test(value) || value.includes("\0")) {
    return false
  }
  return value.split("\\").every((segment) => segment !== "..")
}

function trimTrailing(value: string, separator: "/" | "\\"): string {
  let result = value
  while (result.length > 1 && result.endsWith(separator)) result = result.slice(0, -1)
  return result
}

function joinPath(base: string, separator: "/" | "\\", ...segments: readonly string[]): string {
  return [trimTrailing(base, separator), ...segments].join(separator)
}

function buildPosixLayout(
  input: InstallerPreflightInput,
  os: "darwin" | "linux",
): InstallerLayout | undefined {
  const home = input.paths.homeDirectory
  if (!validPosixPath(home)) return undefined
  const normalizedHome = trimTrailing(home, "/")
  const stateRoot = joinPath(normalizedHome, "/", ".knowbee")
  const binDirectory = joinPath(normalizedHome, "/", ".local", "bin")
  if (os === "darwin") {
    const installRoot = joinPath(normalizedHome, "/", "Library", "Application Support", "Knowbee")
    return {
      installRoot,
      versionsRoot: joinPath(installRoot, "/", "versions"),
      currentPointer: joinPath(installRoot, "/", "current"),
      stateRoot,
      binDirectory,
      serviceIdentity: "com.sponzey.knowbee",
      serviceDefinition: joinPath(
        normalizedHome,
        "/",
        "Library",
        "LaunchAgents",
        "com.sponzey.knowbee.plist",
      ),
    }
  }
  const dataHome = input.paths.xdgDataHome ?? joinPath(normalizedHome, "/", ".local", "share")
  const configHome = input.paths.xdgConfigHome ?? joinPath(normalizedHome, "/", ".config")
  if (!validPosixPath(dataHome) || !validPosixPath(configHome)) return undefined
  const installRoot = joinPath(dataHome, "/", "knowbee")
  return {
    installRoot,
    versionsRoot: joinPath(installRoot, "/", "versions"),
    currentPointer: joinPath(installRoot, "/", "current"),
    stateRoot,
    binDirectory,
    serviceIdentity: "knowbee.service",
    serviceDefinition: joinPath(configHome, "/", "systemd", "user", "knowbee.service"),
  }
}

function buildWindowsLayout(input: InstallerPreflightInput): InstallerLayout | undefined {
  const userProfile = input.paths.userProfile
  const localAppData = input.paths.localAppData
  if (!validWindowsPath(userProfile) || !validWindowsPath(localAppData)) return undefined
  const profile = trimTrailing(userProfile, "\\")
  const local = trimTrailing(localAppData, "\\")
  const installRoot = joinPath(local, "\\", "Knowbee")
  return {
    installRoot,
    versionsRoot: joinPath(installRoot, "\\", "versions"),
    currentPointer: joinPath(installRoot, "\\", "current"),
    stateRoot: joinPath(profile, "\\", ".knowbee"),
    binDirectory: joinPath(installRoot, "\\", "bin"),
    serviceIdentity: "Sponzey Knowbee",
    serviceDefinition: "Sponzey Knowbee",
  }
}

function platform(target: InstallerTarget): "darwin" | "linux" | "win32" {
  if (target.startsWith("darwin-")) return "darwin"
  if (target.startsWith("linux-")) return "linux"
  return "win32"
}

function missingPrerequisite(
  input: InstallerPreflightInput,
  os: "darwin" | "linux" | "win32",
): string | undefined {
  const available = new Set(input.prerequisites.commands)
  const required =
    os === "darwin"
      ? ["curl", "tar", "gzip", "launchctl", "plutil"]
      : os === "linux"
        ? ["curl", "tar", "gzip", "systemctl"]
        : ["powershell", "expand-archive", "scheduled-tasks"]
  const missing = required.find((command) => !available.has(command))
  if (missing) return missing
  if (os === "linux" && !available.has("xdg-open") && !available.has("gio")) {
    return "browser-opener"
  }
  return undefined
}

function pathContains(entries: readonly string[], expected: string, windows: boolean): boolean {
  const normalize = (value: string) => {
    const trimmed = trimTrailing(value, windows ? "\\" : "/")
    return windows ? trimmed.toLocaleLowerCase("en-US") : trimmed
  }
  return entries.some((entry) => normalize(entry) === normalize(expected))
}

export function buildInstallerPreflight(input: InstallerPreflightInput): InstallerPreflightResult {
  if (!input.interaction.tty && !input.interaction.nonInteractive) {
    return blocked("installer_non_interactive_flag_required")
  }
  if (
    !Number.isSafeInteger(input.disk.availableBytes) ||
    !Number.isSafeInteger(input.disk.requiredBytes) ||
    input.disk.availableBytes < 0 ||
    input.disk.requiredBytes <= 0
  ) {
    return blocked("installer_disk_invalid")
  }
  if (input.disk.availableBytes < input.disk.requiredBytes) {
    return blocked("installer_disk_insufficient")
  }
  if (!input.prerequisites.tlsTrusted) return blocked("installer_tls_unavailable")

  const os = platform(input.hostSupport.target)
  const layout = os === "win32" ? buildWindowsLayout(input) : buildPosixLayout(input, os)
  if (!layout) return blocked("installer_path_invalid")
  const missing = missingPrerequisite(input, os)
  if (missing) return blocked(`installer_prerequisite_missing:${missing}`)

  return {
    status: "ready",
    target: input.hostSupport.target,
    layout,
    mutations: {
      userPath: !pathContains(input.currentPathEntries, layout.binDirectory, os === "win32"),
      userService: true,
      browserLaunch: true,
    },
    userActions: {
      commandCount: 1,
      confirmationCount: input.interaction.nonInteractive ? 0 : 1,
      followUpCommandCount: 0,
    },
  }
}
