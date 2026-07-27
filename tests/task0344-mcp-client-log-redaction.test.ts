import { afterEach, describe, expect, it, vi } from "vitest"
import { McpStdioClient } from "../packages/core/src/mcp/client.js"

describe("task0344 MCP client log redaction", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("masks secret-like server names, stderr tokens, and local paths in MCP logs", async () => {
    const secretName = "token=task0344-mcp-server-secret"
    const stderrSecret = "token=task0344-stderr-secret"
    const stderrPath = "/Users/task0344/private/mcp-secret"
    const logs: string[] = []
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
      logs.push(String(chunk))
      return true
    })

    const client = new McpStdioClient({
      name: secretName,
      defaultCwd: process.cwd(),
      config: {
        command: process.execPath,
        args: [
          "-e",
          `process.stderr.write(${JSON.stringify(`${stderrSecret} at ${stderrPath}`)}, () => setTimeout(() => process.exit(1), 25));`,
        ],
        startupTimeoutSec: 1,
        toolTimeoutSec: 1,
      },
    })

    await expect(client.initialize()).rejects.toThrow()
    await client.close()

    const output = logs.join("")
    expect(output).toContain("mcp:client")
    expect(output).toContain("***")
    expect(output).toContain("[internal-path-redacted]")
    expect(output).not.toContain(secretName)
    expect(output).not.toContain(stderrSecret)
    expect(output).not.toContain(stderrPath)
  })
})
