import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type Database from "better-sqlite3"
import { createRuntimePaths } from "../../packages/core/src/config/paths.ts"
import type { RuntimePaths } from "../../packages/core/src/config/paths.ts"
import { closeDb, getDb, getDbRuntimeState } from "../../packages/core/src/db/index.js"

export function initializeTestDbRuntime(stateDir: string) {
  const paths = createRuntimePaths(
    { KNOWBEE_STATE_DIR: stateDir },
    { homeDir: stateDir, exists: () => false },
  )
  return getDb({ paths })
}

export interface TestDbRuntimeFixture {
  readonly rootDir: string
  readonly paths: RuntimePaths
  readonly db: Database.Database
  dispose(): void
}

export function createTestDbRuntimeFixture(prefix = "knowbee-test-db-"): TestDbRuntimeFixture {
  const initialState = getDbRuntimeState()
  if (initialState !== "uninitialized") {
    throw new Error(`Test DB runtime requires an uninitialized owner state; received ${initialState}.`)
  }
  const rootDir = mkdtempSync(join(tmpdir(), prefix))
  const paths = createRuntimePaths(
    { KNOWBEE_STATE_DIR: rootDir },
    { homeDir: rootDir, exists: () => false },
  )
  const db = getDb({ paths })
  let disposed = false
  return Object.freeze({
    rootDir,
    paths,
    db,
    dispose: () => {
      if (disposed) return
      const state = getDbRuntimeState()
      if (state === "ready") {
        getDb({ paths })
        closeDb()
      } else if (state !== "uninitialized") {
        throw new Error(`Test DB runtime cannot dispose from state ${state}.`)
      }
      disposed = true
      rmSync(rootDir, { recursive: true, force: true })
    },
  })
}
