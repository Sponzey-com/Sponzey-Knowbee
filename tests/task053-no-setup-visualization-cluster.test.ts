import { existsSync, readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const retired = [
  "packages/webui/src/lib/setup-visualization.ts",
  "packages/webui/src/lib/setup-visualization-beginner.ts",
  "packages/webui/src/lib/setup-visualization-advanced.ts",
  "packages/webui/src/lib/setup-visualization-scenes.ts",
  "packages/webui/src/components/setup/SetupVisualizationCanvas.tsx",
]

describe("task053 retired setup visualization cluster", () => {
  it("does not retain test-only setup visualization modules", () => {
    for (const path of retired) expect(existsSync(path), path).toBe(false)
  })

  it("keeps the active setup page independent from the retired cluster", () => {
    const source = readFileSync("packages/webui/src/pages/SetupPage.tsx", "utf8")
    expect(source).not.toContain("setup-visualization")
    expect(source).not.toContain("SetupVisualization")
  })
})
