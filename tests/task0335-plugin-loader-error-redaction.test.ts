import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import { PluginLoader } from "../packages/core/src/plugins/loader.ts"
import type { PluginMeta } from "../packages/core/src/plugins/types.ts"

const tempDirs: string[] = []

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task0335 plugin loader error redaction", () => {
  it("does not include missing entry paths in loader errors", async () => {
    const root = makeTempDir("knowbee-task0335-plugin-")
    const missingEntryPath = join(root, "missing", "plugin.js")
    const loader = new PluginLoader()
    const meta: PluginMeta = {
      id: "plugin-task0335",
      name: "missing-entry-plugin",
      version: "0.0.1",
      description: null,
      entry_path: missingEntryPath,
      enabled: 1,
      config: "{}",
      installed_at: Date.now(),
      updated_at: Date.now(),
    }

    const config = DEFAULT_CONFIG
    await expect(loader.load(meta, { config })).rejects.toThrow("Plugin entry not found.")
    await loader.load(meta, { config }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      expect(message).not.toContain(missingEntryPath)
      expect(message).not.toContain(root)
    })
  })
})
