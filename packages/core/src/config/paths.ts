import { homedir } from "node:os"
import { join } from "node:path"
import { existsSync } from "node:fs"

export type RuntimePathEnvironment = Readonly<Record<string, string | undefined>>

export interface RuntimePathDependencies {
  homeDir: string
  exists(path: string): boolean
}

export interface RuntimePaths {
  readonly stateDir: string
  readonly configFile: string
  readonly dbFile: string
  readonly memoryDbFile: string
  readonly setupStateFile: string
  readonly lockFile: string
  readonly logsDir: string
  readonly sessionsDir: string
  readonly pluginsDir: string
}

function getDefaultStateDir(dependencies: RuntimePathDependencies): string {
  const knowbeeDir = join(dependencies.homeDir, ".knowbee")
  const wizbyDir = join(dependencies.homeDir, ".wizby")
  const howieDir = join(dependencies.homeDir, ".howie")
  if (dependencies.exists(knowbeeDir)) return knowbeeDir
  if (dependencies.exists(wizbyDir)) return wizbyDir
  if (dependencies.exists(howieDir)) return howieDir
  return knowbeeDir
}

export function createRuntimePaths(
  env: RuntimePathEnvironment,
  dependencies: RuntimePathDependencies = {
    homeDir: homedir(),
    exists: existsSync,
  },
): RuntimePaths {
  const stateDir =
    env["KNOWBEE_STATE_DIR"] ??
    env["WIZBY_STATE_DIR"] ??
    env["HOWIE_STATE_DIR"] ??
    getDefaultStateDir(dependencies)
  const configFile =
    env["KNOWBEE_CONFIG"] ??
    env["WIZBY_CONFIG"] ??
    env["HOWIE_CONFIG"] ??
    join(stateDir, "config.json5")

  return Object.freeze({
    stateDir,
    configFile,
    dbFile: join(stateDir, "data.db"),
    memoryDbFile: join(stateDir, "memory.db3"),
    setupStateFile: join(stateDir, "setup-state.json"),
    lockFile: join(stateDir, "knowbee.lock"),
    logsDir: join(stateDir, "logs"),
    sessionsDir: join(stateDir, "sessions"),
    pluginsDir: join(stateDir, "plugins"),
  })
}

export function captureRuntimePaths(): RuntimePaths {
  return createRuntimePaths({ ...process.env })
}
