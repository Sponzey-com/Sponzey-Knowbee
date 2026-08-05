import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task029 MCP mutation architecture boundary", () => {
  it("keeps domain/application commands free of infrastructure access", () => {
    const source = ["mcp-mutation-command.ts", "mcp-mutation-runtime.ts"].map((name) => readFileSync(`packages/core/src/capabilities/${name}`, "utf8")).join("\n")
    expect(source).not.toMatch(/process\.env|node:fs|node:path|Fastify|mcpRegistry|mcp\/client|db\/index|persisted-file/)
  })

  it("keeps process environment and legacy reload outside the canonical route command", () => {
    const route = readFileSync("packages/core/src/api/routes/mcp.ts", "utf8")
    const commandSection = route.slice(route.indexOf("const envelopeFrom"), route.indexOf('app.get("/api/mcp/servers"'))
    expect(commandSection).not.toMatch(/process\.env|reloadFromConfig|getApiRuntimeConfig|readPersistedRawConfig|writePersistedRawConfig/)
    expect(commandSection).not.toMatch(/command:|args:|cwd:|environment|token|secret/)
  })
})
