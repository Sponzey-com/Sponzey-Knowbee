import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

function source(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf-8")
}

describe("task0595 MCP error redaction", () => {
  it("routes MCP client and registry failure details through MCP redaction", () => {
    const client = source("packages/core/src/mcp/client.ts")
    const registry = source("packages/core/src/mcp/registry.ts")

    expect(client).toContain("function mcpClientErrorMessage(error: unknown): string")
    expect(client).toContain("const message = mcpClientErrorMessage(error)")
    expect(client).toContain("${mcpClientErrorMessage(error)}")
    expect(client).toContain("const safeName = redactMcpLogText(this.name)")
    expect(registry).toContain("function mcpRegistryErrorMessage(error: unknown): string")
    expect(registry).toContain("const message = mcpRegistryErrorMessage(error)")
    expect(registry).toContain("const errorOutput = redactMcpLogText(result.output)")
    expect(registry).toContain("error: errorOutput")
    expect(registry).not.toContain("error: result.output")
    expect(client).not.toContain("redactMcpLogText(error instanceof Error ? error.message : String(error))")
    expect(registry).not.toContain("redactMcpLogText(error instanceof Error ? error.message : String(error))")
    expect(registry).not.toContain("const message = error instanceof Error ? error.message : String(error)")
  })
})
