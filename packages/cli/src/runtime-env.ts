import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const DEFAULT_SERVICE_PATH = "/usr/local/bin:/usr/bin:/bin"

function resolveDefaultStateDir(homeDir: string): string {
  const candidates = [join(homeDir, ".knowbee"), join(homeDir, ".wizby"), join(homeDir, ".howie")]

  return candidates.find((candidate) => existsSync(candidate)) ?? join(homeDir, ".knowbee")
}

export interface CliRuntimeEnvSnapshot {
  readonly baseEnv: Readonly<NodeJS.ProcessEnv>
  readonly cwd: string
  readonly stateDir: string
  readonly path: string
  readonly user: string
  readonly noColorDisabled: boolean
  readonly channelSmokeLiveEnabled: boolean
  readonly liveAcceptanceEnabled: boolean
}

const CLI_RUNTIME_ENV: CliRuntimeEnvSnapshot = Object.freeze({
  baseEnv: Object.freeze({ ...process.env }),
  cwd: process.cwd(),
  stateDir:
    process.env.KNOWBEE_STATE_DIR ??
    process.env.WIZBY_STATE_DIR ??
    process.env.HOWIE_STATE_DIR ??
    resolveDefaultStateDir(homedir()),
  path: process.env.PATH ?? DEFAULT_SERVICE_PATH,
  user: process.env.USER ?? "",
  noColorDisabled: process.env.KNOWBEE_NO_COLOR != null,
  channelSmokeLiveEnabled: process.env.KNOWBEE_CHANNEL_SMOKE_LIVE === "1",
  liveAcceptanceEnabled: process.env.KNOWBEE_LIVE_ACCEPTANCE === "1",
})

export function getCliBaseEnv(): NodeJS.ProcessEnv {
  return { ...CLI_RUNTIME_ENV.baseEnv }
}

export function getCliCwd(): string {
  return CLI_RUNTIME_ENV.cwd
}

export function getCliStateDir(): string {
  return CLI_RUNTIME_ENV.stateDir
}

export function getCliServicePath(): string {
  return CLI_RUNTIME_ENV.path
}

export function getCliUserName(): string {
  return CLI_RUNTIME_ENV.user
}

export function isCliNoColorDisabled(): boolean {
  return CLI_RUNTIME_ENV.noColorDisabled
}

export function isCliChannelSmokeLiveEnabled(): boolean {
  return CLI_RUNTIME_ENV.channelSmokeLiveEnabled
}

export function isCliLiveAcceptanceEnabled(): boolean {
  return CLI_RUNTIME_ENV.liveAcceptanceEnabled
}
