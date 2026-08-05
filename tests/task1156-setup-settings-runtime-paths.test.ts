import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createRuntimePaths } from "../packages/core/src/config/paths.ts"
import { readSetupState, writeSetupState } from "../packages/core/src/control-plane/index.ts"

const tempDirs: string[] = []

afterEach(() => {
  while (tempDirs.length > 0) {
    const path = tempDirs.pop()
    if (path) rmSync(path, { recursive: true, force: true })
  }
})

describe("task1156 setup and settings runtime path ownership", () => {
  it("reads and writes only the explicit setup state path", () => {
    const root = mkdtempSync(join(tmpdir(), "knowbee-task1156-"))
    tempDirs.push(root)
    const explicit = createRuntimePaths(
      { KNOWBEE_STATE_DIR: join(root, "explicit") },
      { homeDir: root, exists: () => false },
    )
    const fallback = createRuntimePaths(
      { KNOWBEE_STATE_DIR: join(root, "fallback") },
      { homeDir: root, exists: () => false },
    )
    writeSetupState({
      version: 1,
      completed: true,
      currentStep: "done",
      skipped: { telegram: false, remoteAccess: true },
    }, explicit)

    expect(readSetupState(explicit)).toMatchObject({ completed: true, currentStep: "done" })
    expect(existsSync(explicit.setupStateFile)).toBe(true)
    expect(existsSync(fallback.setupStateFile)).toBe(false)
  })

  it("removes dynamic PATHS access from setup, settings, status, and UI routes", () => {
    const files = [
      "packages/core/src/control-plane/index.ts",
      "packages/core/src/api/routes/setup.ts",
      "packages/core/src/api/routes/settings.ts",
      "packages/core/src/api/routes/status.ts",
      "packages/core/src/api/routes/ui-mode.ts",
    ]
    for (const file of files) {
      const source = readFileSync(file, "utf-8")
      expect(source, file).not.toMatch(/import .*\bPATHS\b/)
    }
  })

  it("threads request runtime paths through all persistence routes", () => {
    const setup = readFileSync("packages/core/src/api/routes/setup.ts", "utf-8")
    const settings = readFileSync("packages/core/src/api/routes/settings.ts", "utf-8")
    const status = readFileSync("packages/core/src/api/routes/status.ts", "utf-8")

    expect(setup).toContain("getApiRuntimePaths(req)")
    expect(settings).toContain("const paths = getApiRuntimePaths(req)")
    expect(settings).toContain("writeFileSync(paths.configFile")
    expect(status).toContain("readSetupState(getApiRuntimePaths(req))")
  })
})
