import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task0993 hierarchy validation root-name neutrality", () => {
  it("keeps root-child-forbidden diagnostics free of default agent names", () => {
    const source = readFileSync("packages/core/src/orchestration/hierarchy.ts", "utf-8")

    expect(source).toContain("The root main agent must remain parentless and cannot be a child.")
    expect(source).not.toContain("Knowbee must remain the parentless root and cannot be a child.")
    expect(source).not.toMatch(/message:\s*"[^"]*(?:\bKnowbee\b|노비)[^"]*cannot be a child/u)
  })
})
