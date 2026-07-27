import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(join(process.cwd(), "packages", "webui", "src", "components", "McpServersPanel.tsx"), "utf-8")

describe("task0414 mcp panel user wording", () => {
  it("uses external feature wording instead of MCP server and discovery wording", () => {
    expect(source).not.toContain(">MCP Servers<")
    expect(source).not.toContain('text("stdio 기반 MCP server 연결 상태와 discovery된 도구", "The stdio-based MCP server status and the discovered tools")')
    expect(source).not.toContain('text("MCP 재로드", "Reload MCP")')
    expect(source).not.toContain('text("도구 수", "Tools")')
    expect(source).not.toContain('text("필수 실패", "Required Failures")')
    expect(source).not.toContain('text(`도구 ${server.registeredToolCount}`, `tools ${server.registeredToolCount}`)')
    expect(source).not.toContain('text("도구", "Tools")')
    expect(source).not.toContain('text("discovery된 MCP 도구가 없습니다.", "No MCP tools were discovered.")')
    expect(source).not.toContain('text("설정된 MCP 서버가 없습니다.", "There are no configured MCP servers.")')

    expect(source).toContain('text("외부 기능 연결", "External feature connections")')
    expect(source).toContain('text("외부 기능 연결 상태와 사용할 수 있는 외부 도구를 확인합니다.", "Check external feature connection status and available external tools.")')
    expect(source).toContain('text("연결 다시 확인", "Recheck connections")')
    expect(source).toContain('text("외부 도구 수", "External tools")')
    expect(source).toContain('text("필수 연결 문제", "Required connection issues")')
    expect(source).toContain('text(`외부 도구 ${server.registeredToolCount}`, `external tools ${server.registeredToolCount}`)')
    expect(source).toContain('text("사용 가능한 외부 도구", "Available external tools")')
    expect(source).toContain('text("확인된 외부 도구가 없습니다.", "No external tools are available.")')
    expect(source).toContain('text("설정된 외부 기능 연결이 없습니다.", "There are no configured external feature connections.")')
  })

  it("uses user-facing labels for command and url rows", () => {
    expect(source).not.toContain('<DetailRow label="Command" value={server.command} mono />')
    expect(source).not.toContain('<DetailRow label="URL" value={server.url} mono />')
    expect(source).not.toContain("value={server.command}")
    expect(source).not.toContain("value={server.url}")

    expect(source).toContain('<DetailRow label={text("연결 대상", "Connection target")} value={describeMcpConnectionTarget(server.transport, text)} />')
  })
})
