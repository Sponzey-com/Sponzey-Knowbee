import { homedir } from "node:os"
import { join } from "node:path"
import { existsSync } from "node:fs"

function getDefaultStateDir(): string {
  const knowbeeDir = join(homedir(), ".knowbee")
  const wizbyDir = join(homedir(), ".wizby")
  const howieDir = join(homedir(), ".howie")
  const legacyDir = join(homedir(), ".knowbee")
  if (existsSync(knowbeeDir)) return knowbeeDir
  if (existsSync(wizbyDir)) return wizbyDir
  if (existsSync(howieDir)) return howieDir
  if (existsSync(legacyDir)) return legacyDir
  return knowbeeDir
}

function getStateDir(): string {
  if (process.env["KNOWBEE_STATE_DIR"]) {
    return process.env["KNOWBEE_STATE_DIR"]
  }
  if (process.env["WIZBY_STATE_DIR"]) {
    return process.env["WIZBY_STATE_DIR"]
  }
  if (process.env["HOWIE_STATE_DIR"]) {
    return process.env["HOWIE_STATE_DIR"]
  }
  if (process.env["KNOWBEE_STATE_DIR"]) {
    return process.env["KNOWBEE_STATE_DIR"]
  }
  return getDefaultStateDir()
}

export const PATHS = {
  get stateDir() {
    return getStateDir()
  },
  get configFile() {
    return process.env["KNOWBEE_CONFIG"] ?? process.env["WIZBY_CONFIG"] ?? process.env["HOWIE_CONFIG"] ?? process.env["KNOWBEE_CONFIG"] ?? join(getStateDir(), "config.json5")
  },
  get dbFile() {
    return join(getStateDir(), "data.db")
  },
  get memoryDbFile() {
    return join(getStateDir(), "memory.db3")
  },
  get setupStateFile() {
    return join(getStateDir(), "setup-state.json")
  },
  get lockFile() {
    return join(getStateDir(), "knowbee.lock")
  },
  get logsDir() {
    return join(getStateDir(), "logs")
  },
  get sessionsDir() {
    return join(getStateDir(), "sessions")
  },
  get pluginsDir() {
    return join(getStateDir(), "plugins")
  },
} as const
