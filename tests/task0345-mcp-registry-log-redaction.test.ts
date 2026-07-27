import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.js"
import { mcpRegistry } from "../packages/core/src/mcp/registry.js"

const tempDirs: string[] = []

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "knowbee-task0345-mcp-"))
  tempDirs.push(dir)
  return dir
}

describe("task0345 MCP registry log redaction", () => {
  afterEach(async () => {
    await mcpRegistry.closeAll()
    vi.restoreAllMocks()
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()
      if (dir) rmSync(dir, { recursive: true, force: true })
    }
  })

  it("uses a bounded reason without target or error detail in Product Logs", async () => {
    const cwd = makeTempDir()
    const secretName = "token=task0345-registry-secret"
    const missingCommand = join(cwd, "missing-registry-mcp")
    const logs: string[] = []
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
      logs.push(String(chunk))
      return true
    })
    vi.spyOn(process.stderr, "write").mockImplementation((chunk: string | Uint8Array) => {
      logs.push(String(chunk))
      return true
    })

    await mcpRegistry.loadFromConfig({
      ...DEFAULT_CONFIG,
      mcp: {
        servers: {
          [secretName]: {
            command: missingCommand,
            cwd,
            startupTimeoutSec: 1,
            toolTimeoutSec: 1,
          },
        },
      },
    })

    const output = logs.join("")
    expect(output).toContain("mcp:registry")
    expect(output).toContain("external_feature_connection_failed")
    expect(output).toContain("mcp_connection_failed")
    expect(output).toContain('"required":false')
    expect(output).not.toContain(secretName)
    expect(output).not.toContain(missingCommand)
    expect(output).not.toContain(cwd)
    expect(output).not.toContain("ENOENT")
  })
})
