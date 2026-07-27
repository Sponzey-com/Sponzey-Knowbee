import type { KnowbeeConfig } from "./types.js"

export type StartupConfigSourceState = "empty" | "loading" | "ready" | "failed"
export type StartupConfigLoader = () => KnowbeeConfig

export interface StartupConfigSource {
  getState(): StartupConfigSourceState
  getSnapshot(): KnowbeeConfig
}

const immutableSnapshots = new WeakSet<object>()
const snapshotsByInput = new WeakMap<object, KnowbeeConfig>()

function freezeDeep(value: unknown, visited: WeakSet<object>): void {
  if (value === null || typeof value !== "object" || visited.has(value)) return
  visited.add(value)
  for (const nested of Object.values(value as Record<string, unknown>)) {
    freezeDeep(nested, visited)
  }
  Object.freeze(value)
}

export function createImmutableConfigSnapshot(config: KnowbeeConfig): KnowbeeConfig {
  if (immutableSnapshots.has(config)) return config
  const existing = snapshotsByInput.get(config)
  if (existing) return existing

  const snapshot = structuredClone(config)
  freezeDeep(snapshot, new WeakSet())
  immutableSnapshots.add(snapshot)
  snapshotsByInput.set(config, snapshot)
  return snapshot
}

export function createStartupConfigSource(loader: StartupConfigLoader): StartupConfigSource {
  let state: StartupConfigSourceState = "empty"
  let snapshot: KnowbeeConfig | null = null
  let failure: unknown

  return {
    getState(): StartupConfigSourceState {
      return state
    },
    getSnapshot(): KnowbeeConfig {
      if (state === "ready" && snapshot) return snapshot
      if (state === "failed") throw failure
      if (state === "loading") throw new Error("startup_config_load_reentrant")

      state = "loading"
      try {
        snapshot = createImmutableConfigSnapshot(loader())
        state = "ready"
        return snapshot
      } catch (error) {
        failure = error
        state = "failed"
        throw error
      }
    },
  }
}
