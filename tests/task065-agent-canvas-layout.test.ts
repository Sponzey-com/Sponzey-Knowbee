import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const source = readFileSync(
  new URL("../packages/webui/src/components/AgentRelationshipCanvas.tsx", import.meta.url),
  "utf8",
)
const pageSource = readFileSync(
  new URL("../packages/webui/src/pages/AgentsPage.tsx", import.meta.url),
  "utf8",
)

describe("Task065 agent canvas layout", () => {
  it("uses the available viewport instead of a fixed canvas height", () => {
    expect(source).not.toContain('className="h-[420px]')
    expect(source).toContain("h-full")
  })

  it("does not constrain the workspace width or relationship loading height", () => {
    expect(pageSource).not.toContain("max-w-6xl")
    expect(pageSource).not.toContain('height="420px"')
    expect(pageSource).not.toContain('height="240px"')
    expect(pageSource).not.toContain('height="calc(100dvh - 5rem)"')
    expect(pageSource).toContain("xl:grid-cols-[minmax(0,1fr)_26rem]")
    expect(pageSource).toContain("xl:h-[calc(100dvh-18rem)]")
  })

  it("keeps the agent list above the graph and settings sidebar workspace", () => {
    expect(pageSource).toContain('aria-label={text("서브 에이전트 작업대", "Sub-agent workspace")}')
    expect(pageSource).toContain('aria-label={text("서브 에이전트 목록", "Sub-agent list")}')
    expect(pageSource).toContain('aria-label={text("에이전트 구성", "Agent configuration")}')
    expect(pageSource).toContain('aria-label={text("에이전트 설정", "Agent settings")}')
    expect(pageSource).toContain("2xl:grid-cols-5")
    expect(pageSource).not.toContain(
      'open={props.drawerMode === "create" || props.selected !== null}',
    )
  })
})
