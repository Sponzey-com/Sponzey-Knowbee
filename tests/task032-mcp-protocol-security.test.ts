import { existsSync, rmSync } from "node:fs"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { McpStdioClient } from "../packages/core/src/mcp/client.js"

const fixture = path.resolve("tests/fixtures/fake-mcp-server.mjs")
const clients: McpStdioClient[] = []
const client = (mode: string, command = process.execPath) => {
  const value = new McpStdioClient({
    name: `fixture-${mode}`,
    defaultCwd: process.cwd(),
    baseEnv: {},
    config: { command, args: [fixture, mode], startupTimeoutSec: 1, toolTimeoutSec: 1 },
  })
  clients.push(value)
  return value
}

afterEach(async () => {
  await Promise.all(clients.splice(0).map((entry) => entry.close()))
})

describe("task032 MCP protocol and process security fixtures", () => {
  it("accepts zero tools and filters malformed partial tool rows", async () => {
    await expect(client("zero-tools").listTools()).resolves.toEqual([])
    await expect(client("partial-tools").listTools()).resolves.toEqual([
      expect.objectContaining({ name: "echo", description: "Echoes the given text." }),
    ])
  })

  it("rejects an invalid handshake and a startup timeout, then closes each child", async () => {
    const invalid = client("invalid-handshake")
    await expect(invalid.initialize()).rejects.toThrow(/handshake is invalid/)
    await invalid.close()
    expect((invalid as unknown as { process: unknown }).process).toBeNull()
    const timeout = client("timeout")
    await expect(timeout.initialize()).rejects.toThrow(/timed out/)
    await timeout.close()
    expect((timeout as unknown as { process: unknown }).process).toBeNull()
  })

  it("passes command and arguments directly without executing shell separators", async () => {
    const marker = path.resolve(".tasks/task032-shell-marker")
    rmSync(marker, { force: true })
    const injected = client("normal", `${process.execPath}; touch ${marker}`)
    await expect(injected.initialize()).rejects.toThrow()
    expect(existsSync(marker)).toBe(false)
  })
})
