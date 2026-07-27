import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

function source(path: string): string {
  return readFileSync(path, "utf8")
}

describe("task0462 setup external feature scene wording", () => {
  it("does not keep old MCP server wording in setup step metadata and readiness summaries", () => {
    const stepMeta = source("packages/webui/src/lib/setup-step-meta.ts")
    const readiness = source("packages/webui/src/lib/setup-readiness.ts")

    expect(stepMeta).not.toContain("연결할 MCP 서버를 추가합니다.")
    expect(stepMeta).not.toContain("Add the MCP servers to connect.")
    expect(stepMeta).toContain("연결할 외부 기능을 추가합니다.")
    expect(stepMeta).toContain("Add the external features to connect.")

    expect(readiness).not.toContain('title: step?.label ?? "MCP"')
    expect(readiness).not.toContain("`servers:${draft.mcp.servers.length}`")
    expect(readiness).toContain('title: step?.label ?? t("외부 기능 연결", "External features")')
    expect(readiness).toContain("`connections:${draft.mcp.servers.length}`")
  })
})
