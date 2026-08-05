import path from "node:path"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.js"
import { mcpRegistry } from "../packages/core/src/mcp/registry.js"
import { initializeToolDispatcher } from "../packages/core/src/tools/index.js"

const fixture = path.resolve("tests/fixtures/fake-mcp-server.mjs")

beforeAll(() => {
  initializeToolDispatcher(DEFAULT_CONFIG)
})

afterEach(async () => {
  await mcpRegistry.closeAll()
})

describe("task032 targeted MCP registry reload", () => {
  it("restarts only the selected server and preserves every other status", async () => {
    await mcpRegistry.loadFromConfig({
      profile: { workspace: process.cwd() },
      mcp: {
        servers: {
          penpot: { transport: "stdio", command: process.execPath, args: [fixture] },
          notes: { transport: "stdio", command: process.execPath, args: [fixture] },
        },
      },
    } as never)
    const before = mcpRegistry.getStatuses().find((entry) => entry.name === "notes")

    const recovered = await mcpRegistry.reloadServer(
      "penpot",
      { transport: "stdio", command: process.execPath, args: [fixture] },
      { defaultCwd: process.cwd() },
    )

    expect(recovered).toMatchObject({ name: "penpot", ready: true, toolCount: 2 })
    expect(mcpRegistry.getStatuses().find((entry) => entry.name === "notes")).toEqual(before)
    expect(mcpRegistry.getStatuses().map((entry) => entry.name)).toEqual(["notes", "penpot"])
  })
})
