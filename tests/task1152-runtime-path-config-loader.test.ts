import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { loadConfigSnapshot } from "../packages/core/src/config/index.ts"
import { createRuntimePaths } from "../packages/core/src/config/paths.ts"

const tempDirs: string[] = []

afterEach(() => {
  while (tempDirs.length > 0) {
    const path = tempDirs.pop()
    if (path) rmSync(path, { recursive: true, force: true })
  }
})

describe("task1152 immutable runtime paths and config loader", () => {
  it("calculates stable paths from one explicit environment snapshot", () => {
    const env: Record<string, string | undefined> = {
      KNOWBEE_STATE_DIR: "/runtime/state",
      KNOWBEE_CONFIG: "/runtime/config.json5",
    }
    const paths = createRuntimePaths(env, {
      homeDir: "/home/tester",
      exists: () => false,
    })
    env.KNOWBEE_STATE_DIR = "/changed/state"
    env.KNOWBEE_CONFIG = "/changed/config.json5"

    expect(paths.stateDir).toBe("/runtime/state")
    expect(paths.configFile).toBe("/runtime/config.json5")
    expect(paths.dbFile).toBe("/runtime/state/data.db")
    expect(Object.isFrozen(paths)).toBe(true)
  })

  it.each([
    [{ WIZBY_STATE_DIR: "/wizby" }, "/wizby"],
    [{ HOWIE_STATE_DIR: "/howie" }, "/howie"],
    [{}, "/home/tester/.knowbee"],
  ])("preserves legacy state directory priority", (env, expected) => {
    expect(createRuntimePaths(env, { homeDir: "/home/tester", exists: () => false }).stateDir).toBe(expected)
  })

  it("loads a config from explicit paths and environment only", () => {
    const root = mkdtempSync(join(tmpdir(), "knowbee-task1152-"))
    tempDirs.push(root)
    const stateDir = join(root, "state")
    const configFile = join(root, "explicit.json5")
    mkdirSync(stateDir, { recursive: true })
    writeFileSync(
      configFile,
      '{ ai: { connection: { provider: "openai", model: "${EXPLICIT_MODEL}" } } }',
      "utf-8",
    )
    writeFileSync(join(stateDir, ".env"), "EXPLICIT_MODEL=state-model\n", "utf-8")
    const paths = createRuntimePaths(
      { KNOWBEE_STATE_DIR: stateDir, KNOWBEE_CONFIG: configFile },
      { homeDir: root, exists: () => false },
    )

    const config = loadConfigSnapshot({
      baseEnv: { EXPLICIT_MODEL: "base-model" },
      cwd: root,
      paths,
    })

    expect(config.ai.connection.model).toBe("base-model")
    expect(config.ai.connection.provider).toBe("openai")
  })

  it("keeps hidden process and legacy path access out of the explicit loader", () => {
    const source = readFileSync("packages/core/src/config/index.ts", "utf-8")
    const publicIndex = readFileSync("packages/core/src/index.ts", "utf-8")
    const loader = source.slice(source.indexOf("export function loadConfigSnapshot"))

    expect(loader).not.toContain("process.env")
    expect(loader).not.toContain("process.cwd")
    expect(loader).not.toContain("PATHS.")
    expect(source).not.toMatch(/export function (?:loadConfig|getConfig|reloadConfig)\(/u)
    expect(publicIndex).not.toMatch(/export \{[^}]*\b(?:loadConfig|getConfig|reloadConfig|PATHS)\b/u)
  })
})
