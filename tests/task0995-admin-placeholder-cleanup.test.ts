import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task0995 admin placeholder cleanup", () => {
  it("keeps Web UI catalog free of unused future-work placeholder copy", () => {
    const source = readFileSync("packages/webui/src/lib/message-catalog.ts", "utf-8")

    expect(source).not.toContain("admin.placeholder.description")
    expect(source).not.toMatch(/implemented in later work|다음 작업에서 세부 구현/u)
  })
})
