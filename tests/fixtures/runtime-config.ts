import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { loadConfigSnapshot } from "../../packages/core/src/config/index.ts"
import { createRuntimePaths, type RuntimePaths } from "../../packages/core/src/config/paths.ts"
import type { KnowbeeConfig } from "../../packages/core/src/config/types.ts"

export interface TestRuntimeConfigFixtureInput {
  rootDir: string
  env?: Readonly<Record<string, string | undefined>>
  configText?: string
}

export interface TestRuntimeConfigFixture {
  readonly rootDir: string
  readonly paths: RuntimePaths
  readonly config: KnowbeeConfig
  load(): KnowbeeConfig
}

export function createTestRuntimeConfigFixture(
  input: TestRuntimeConfigFixtureInput,
): TestRuntimeConfigFixture {
  const stateDir = join(input.rootDir, "state")
  mkdirSync(stateDir, { recursive: true })
  const env = { ...(input.env ?? {}), KNOWBEE_STATE_DIR: stateDir }
  const paths = createRuntimePaths(env, {
    homeDir: input.rootDir,
    exists: () => false,
  })
  if (input.configText !== undefined) {
    writeFileSync(paths.configFile, input.configText, "utf8")
  }
  const load = () => loadConfigSnapshot({ baseEnv: { ...env }, cwd: input.rootDir, paths })
  return Object.freeze({
    rootDir: input.rootDir,
    paths,
    config: load(),
    load,
  })
}
