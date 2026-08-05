import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const repoRoot = process.cwd()

function source(path: string): string {
  return readFileSync(join(repoRoot, path), "utf-8")
}

describe("task0484 architecture static gate cleanup", () => {
  it("restores the architecture cleanup inventory source of truth", () => {
    const inventoryPath = ".tasks/phase001/architecture-cleanup-inventory.md"
    expect(existsSync(join(repoRoot, inventoryPath))).toBe(true)

    const inventory = source(inventoryPath)
    expect(inventory).toContain("compatibility")
    expect(inventory).toContain("sub-agent settings")
    expect(inventory).toContain("runtime references")
    expect(inventory).toContain("rollback evidence")
  })

  it("keeps unified settings mode names out of the legacy single Knowbee compatibility term", () => {
    const unifiedSettingsTs = source("packages/core/src/ui/unified-settings.ts")

    expect(unifiedSettingsTs).toContain('UnifiedSettingsMode = "direct_main_agent" | "orchestration"')
    expect(unifiedSettingsTs).toContain("direct_main_agent_without_sub_agents")
    expect(unifiedSettingsTs).not.toContain("single_knowbee")
  })
})
