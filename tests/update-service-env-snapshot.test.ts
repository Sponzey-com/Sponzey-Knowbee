import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

const tempDirs: string[] = []

function useTempState(): string {
  const stateDir = mkdtempSync(join(tmpdir(), "knowbee-update-env-"))
  tempDirs.push(stateDir)
  return stateDir
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("update service env snapshot", () => {
  it("keeps update repository env fixed in the runtime context and allows explicit override", async () => {
    const stateDir = useTempState()
    vi.resetModules()
    const mod = await import("../packages/core/src/update/service.ts?snapshot") as typeof import("../packages/core/src/update/service.ts")
    const { createRuntimePaths } = await import("../packages/core/src/config/paths.ts")
    const context = mod.createUpdateRuntimeContext(
      createRuntimePaths({ KNOWBEE_STATE_DIR: stateDir }),
      { KNOWBEE_UPDATE_REPOSITORY: "https://github.com/example/first.git" },
    )

    expect(mod.getUpdateSnapshot(context).repositoryUrl).toBe("https://github.com/example/first")
    expect(mod.getUpdateSnapshot(context, { repositoryUrl: "https://github.com/example/override.git" }).repositoryUrl).toBe("https://github.com/example/override")
  })

  it("keeps repository resolution free of direct env reads", () => {
    const source = readFileSync(new URL("../packages/core/src/update/service.ts", import.meta.url), "utf-8")
    const functionBody = source.slice(source.indexOf("function getConfiguredRepositoryUrl"), source.indexOf("function parseGithubRepository"))

    expect(source).toContain("createUpdateRuntimeContext")
    expect(functionBody).not.toContain("process.env")
  })
})
