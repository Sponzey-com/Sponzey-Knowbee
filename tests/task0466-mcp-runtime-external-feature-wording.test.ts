import { readFileSync } from "node:fs"
import { afterEach, describe, expect, it } from "vitest"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import { mcpRegistry } from "../packages/core/src/mcp/registry.ts"

afterEach(async () => {
  await mcpRegistry.closeAll()
})

function source(path: string): string {
  return readFileSync(path, "utf8")
}

describe("task0466 mcp runtime external feature wording", () => {
  it("uses external feature connection wording for registry status errors", async () => {
    await mcpRegistry.loadFromConfig({
      ...DEFAULT_CONFIG,
      mcp: {
        servers: {
          disabled_connection: {
            enabled: false,
            command: "node",
          },
          http_connection: {
            transport: "http",
            url: "http://127.0.0.1:39999",
          },
          missing_command: {
            enabled: true,
            required: true,
          },
        },
      },
    })

    const statuses = Object.fromEntries(mcpRegistry.getStatuses().map((status) => [status.name, status]))

    expect(statuses["disabled_connection"]?.error).toBe("설정에서 비활성화된 외부 기능 연결입니다.")
    expect(statuses["http_connection"]?.error).toBe(
      "HTTP 방식 외부 기능 연결은 현재 사용할 수 없습니다. 지금은 stdio 방식만 사용할 수 있습니다.",
    )
    expect(statuses["missing_command"]?.error).toBe("실행 명령이 설정되지 않아 외부 기능 연결을 시작할 수 없습니다.")

    const serialized = JSON.stringify(mcpRegistry.getStatuses())
    expect(serialized).not.toContain("MCP 서버")
    expect(serialized).not.toContain("MCP server")
    expect(serialized).not.toContain("MCP transport")
  })

  it("does not keep old MCP server runtime wording in registry and client sources", () => {
    const combined = [
      source("packages/core/src/mcp/registry.ts"),
      source("packages/core/src/mcp/client.ts"),
      source("packages/core/src/mcp/registry.js"),
      source("packages/core/src/mcp/client.js"),
    ].join("\n")

    expect(combined).not.toContain("MCP tool error")
    expect(combined).not.toContain("MCP server")
    expect(combined).not.toContain("MCP request")
    expect(combined).not.toContain("MCP transport")
    expect(combined).not.toContain("MCP message")
    expect(combined).not.toContain("MCP stdio")
    expect(combined).not.toContain("MCP 서버")
    expect(combined).toContain("External feature connection")
    expect(combined).toContain("External tool error")
  })
})
