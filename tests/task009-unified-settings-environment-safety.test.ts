import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const unifiedSettingsSources = [
  "packages/core/src/ui/unified-settings.ts",
  "packages/webui/src/lib/unified-settings-view.ts",
  "packages/webui/src/components/setup/UnifiedSettingsSummaryPanel.tsx",
]

function source(path: string): string {
  return readFileSync(path, "utf8")
}

function unifiedSettingsSource(): string {
  return unifiedSettingsSources.map((path) => `\n// ${path}\n${source(path)}`).join("\n")
}

describe("task009 unified settings environment safety gate", () => {
  it("keeps unified settings core, adapter, and component free of hidden environment, storage, and endpoint access", () => {
    const combined = unifiedSettingsSource()

    expect(combined).not.toMatch(/process\.env/)
    expect(combined).not.toMatch(/Date\.now\s*\(/)
    expect(combined).not.toMatch(/localStorage|sessionStorage|document\.cookie/)
    expect(combined).not.toMatch(/fetch\s*\(/)
    expect(combined).not.toMatch(/\bapi\./)
    expect(combined).not.toMatch(/readFile|writeFile/)
  })

  it("keeps runtime time input explicit instead of reading global time inside the adapter", () => {
    const adapter = source("packages/webui/src/lib/unified-settings-view.ts")

    expect(adapter).toContain("now?: number")
    expect(adapter).toContain("now: number | undefined")
    expect(adapter).toContain("monitoring.refreshedAt + monitoring.staleAfterMs < now")
    expect(adapter).not.toContain("Date.now")
    expect(adapter).not.toContain("new Date()")
  })

  it("documents the unified settings safety gate in the architecture cleanup inventory", () => {
    const inventory = source(".tasks/architecture-cleanup-inventory.md")

    expect(inventory).toContain("Unified Settings Environment Safety Gate")
    expect(inventory).toContain("process.env")
    expect(inventory).toContain("Date.now")
    expect(inventory).toContain("명시 인자")
    expect(inventory).toContain("runtime endpoint")
  })
})
