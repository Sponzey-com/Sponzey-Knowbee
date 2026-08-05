import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

function sourceSlice(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker)
  expect(start).toBeGreaterThanOrEqual(0)
  const end = source.indexOf(endMarker, start + startMarker.length)
  expect(end).toBeGreaterThan(start)
  return source.slice(start, end)
}

describe("task0907 MCP client base environment snapshot gate", () => {
  it("keeps MCP process env construction behind MCP_BASE_ENV and explicit config env", () => {
    const source = readFileSync(
      join(process.cwd(), "packages/core/src/mcp/client.ts"),
      "utf-8",
    )
    const constructorBody = sourceSlice(source, "constructor(options:", "\n  async initialize")
    const ensureProcessBody = sourceSlice(source, "private async ensureProcess", "\n  private startupTimeoutMs")

    expect(source).toContain("const MCP_BASE_ENV: NodeJS.ProcessEnv = { ...process.env }")
    expect(constructorBody).toContain("options.baseEnv ?? MCP_BASE_ENV")
    expect(constructorBody).toContain("this.defaultCwd = options.defaultCwd")
    expect(constructorBody).not.toContain("process.env")
    expect(ensureProcessBody).toContain("...this.baseEnv")
    expect(ensureProcessBody).toContain("...(this.config.env ?? {})")
    expect(ensureProcessBody).toContain("cwd: this.config.cwd || this.defaultCwd")
    expect(ensureProcessBody).not.toContain("process.cwd()")
    expect(ensureProcessBody).not.toContain("process.env")
  })
})
