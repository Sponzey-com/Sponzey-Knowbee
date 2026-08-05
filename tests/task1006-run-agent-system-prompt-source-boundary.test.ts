import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

function readSource(path: string): string {
  return readFileSync(path, "utf-8")
}

describe("task1006 runAgent system prompt source boundary", () => {
  it("does not expose a raw systemPrompt override on RunAgentParams", () => {
    const source = readSource("packages/core/src/agent/index.ts")

    expect(source).toContain("export interface RunAgentParams")
    expect(source).not.toContain("systemPrompt?: string")
  })

  it("builds the base system prompt only from prompt source assembly or system prompt source", () => {
    const source = readSource("packages/core/src/agent/index.ts")

    expect(source).toContain("loadSystemPromptSourceAssembly")
    expect(source).toContain('"execution"')
    expect(source).toMatch(
      /promptAssembly\?\.text\s*\?\?\s*loadPromptTemplate\(\{\s*sourceId: "system"/,
    )
    expect(source).not.toContain("params.systemPrompt")
  })
})
