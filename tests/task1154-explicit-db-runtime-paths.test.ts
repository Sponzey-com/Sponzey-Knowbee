import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createRuntimePaths } from "../packages/core/src/config/paths.ts"
import { closeDb, getDb } from "../packages/core/src/db/index.ts"

const tempDirs: string[] = []

afterEach(() => {
  closeDb()
  while (tempDirs.length > 0) {
    const path = tempDirs.pop()
    if (path) rmSync(path, { recursive: true, force: true })
  }
})

describe("task1154 explicit DB runtime paths", () => {
  it("initializes DB and migration backup paths from explicit runtime paths", () => {
    const root = mkdtempSync(join(tmpdir(), "knowbee-task1154-"))
    tempDirs.push(root)
    const explicitState = join(root, "explicit")
    const fallbackState = join(root, "fallback")
    const paths = createRuntimePaths(
      { KNOWBEE_STATE_DIR: explicitState },
      { homeDir: root, exists: () => false },
    )
    getDb({ paths })
    expect(existsSync(paths.dbFile)).toBe(true)
    expect(existsSync(join(fallbackState, "data.db"))).toBe(false)
  })

  it("threads one startup process path snapshot through production bootstrap", () => {
    const core = readFileSync("packages/core/src/runtime/bootstrap.ts", "utf-8")

    expect(core).toContain("function resolveBootstrapRuntimePaths()")
    expect(core).toContain("startupRuntimePaths ??= createRuntimePaths(resolveBootstrapProcessContext().env)")
    expect(core).toContain("getDb({ paths: runtimePaths })")
    expect(core).not.toContain("getDb()")
  })
})
