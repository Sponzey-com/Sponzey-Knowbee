import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

function normalizeVersion(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.replace(/^v/i, "")
}

function sanitizeDisplayVersion(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  return trimmed || null
}

export interface VersionEnvironmentSnapshot {
  displayVersion: string | null
  gitVersion: string | null
}

export function createVersionEnvironmentSnapshot(
  env: Readonly<Record<string, string | undefined>>,
): VersionEnvironmentSnapshot {
  return Object.freeze({
    displayVersion: sanitizeDisplayVersion(env["KNOWBEE_DISPLAY_VERSION"]),
    gitVersion: sanitizeDisplayVersion(env["KNOWBEE_GIT_VERSION"]),
  })
}

const VERSION_ENV = createVersionEnvironmentSnapshot(process.env)

export function getWorkspaceRootPath(): string {
  let current = dirname(fileURLToPath(import.meta.url))
  while (true) {
    if (existsSync(join(current, ".git")) && existsSync(join(current, "package.json"))) {
      return current
    }
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }

  return dirname(fileURLToPath(new URL("../../../..", import.meta.url)))
}

export function getWorkspacePackageJsonPath(): string {
  return join(getWorkspaceRootPath(), "package.json")
}

export function getCurrentAppVersion(): string {
  try {
    const raw = readFileSync(getWorkspacePackageJsonPath(), "utf-8")
    const parsed = JSON.parse(raw) as { version?: string }
    return normalizeVersion(parsed.version) ?? "0.1.0"
  } catch {
    return "0.1.0"
  }
}

export function getCurrentDisplayVersion(snapshot: VersionEnvironmentSnapshot = VERSION_ENV): string {
  const explicit = snapshot.displayVersion ?? snapshot.gitVersion
  if (explicit) return explicit

  try {
    const described = execFileSync("git", ["describe", "--tags", "--always", "--dirty"], {
      cwd: getWorkspaceRootPath(),
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
    const sanitized = sanitizeDisplayVersion(described)
    if (sanitized) return sanitized
  } catch {
    // fall through to package version
  }

  return `v${getCurrentAppVersion()}`
}
