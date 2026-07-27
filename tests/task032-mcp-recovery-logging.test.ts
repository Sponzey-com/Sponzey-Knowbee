import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task032 MCP recovery logging boundary", () => {
  it("uses all three log purposes without configuration or secret fields", () => {
    const source = readFileSync(new URL("../packages/core/src/api/routes/mcp.ts", import.meta.url), "utf8")
    const routeStart = source.indexOf('"/api/capabilities/mcp/:mcpRef/recover"')
    const start = source.indexOf('mcpRouteLogger.product("MCP recovery completed"', routeStart)
    const end = source.indexOf("return reply.status(mutationStatus(receipt, 200)).send(receipt)", start)
    expect(routeStart).toBeGreaterThan(0)
    expect(start).toBeGreaterThan(0)
    expect(end).toBeGreaterThan(start)
    const recovery = source.slice(start, end)
    expect(recovery).toContain('mcpRouteLogger.product("MCP recovery completed"')
    expect(recovery).toContain('mcpRouteLogger.fieldDebug("MCP recovery receipt"')
    expect(recovery).toContain('mcpRouteLogger.development("MCP recovery terminal detail"')
    expect(recovery).not.toMatch(/command|args|cwd|environment|secret|internalMcpId|actorRef/u)
  })
})
