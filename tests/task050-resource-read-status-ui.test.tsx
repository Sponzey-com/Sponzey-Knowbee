import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { createElement } from "../packages/webui/node_modules/react/index.js"
import { ResourceReadStatusNotice } from "../packages/webui/src/components/ResourceReadStatusNotice"
import { projectUserRecovery } from "../packages/webui/src/lib/user-recovery"

const text = (ko: string, _en: string) => ko
const failure = projectUserRecovery(new Error("stack /Users/private token=secret"), "read")

describe("Task050 resource read status UI", () => {
  it("renders initial failure without internal text", () => {
    const html = renderToStaticMarkup(
      createElement(ResourceReadStatusNotice, {
        state: { status: "failed", data: null, observedAt: null, failure },
        subject: "work",
        text,
        onRefresh: () => undefined,
      }),
    )
    expect(html).toContain("작업 정보를 불러오지 못했습니다")
    expect(html).toContain("상태 새로고침")
    expect(html).not.toMatch(/stack|Users|private|secret|request_failed/u)
  })

  it("marks retained data as stale and keeps refresh explicit", () => {
    const onRefresh = vi.fn()
    const html = renderToStaticMarkup(
      createElement(ResourceReadStatusNotice, {
        state: { status: "stale", data: { count: 3 }, observedAt: 1_700_000_000_000, failure },
        subject: "agents",
        text,
        onRefresh,
      }),
    )
    expect(html).toContain("이전 정보를 표시하고 있습니다")
    expect(html).toContain("상태 새로고침")
    expect(html).toContain("<output")
    expect(onRefresh).not.toHaveBeenCalled()
  })
})
