import { readFileSync } from "node:fs"
import { createElement } from "../packages/webui/node_modules/react/index.js"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { describe, expect, it } from "vitest"
import { SkillCatalogView } from "../packages/webui/src/pages/SkillCatalogPage.tsx"

describe("task020 skill catalog page", () => {
  const item = {
    skillRef: `skill_v1_${"a".repeat(24)}`,
    displayName: "UI UX Pro Max",
    description: "Review interface quality",
    sourceKind: "local" as const,
    validationStatus: "valid" as const,
    runtimeStatus: "active" as const,
    bindingCount: 2,
    revision: 7,
  }

  it("renders accessible filters, a public-ref list item, and redacted detail", () => {
    const html = renderToStaticMarkup(createElement(SkillCatalogView, {
      items: [item],
      selectedItem: item,
      loading: false,
      loadingMore: false,
      error: null,
      nextCursor: null,
      search: "",
      sourceKind: "",
      runtimeStatus: "",
      boundOnly: false,
      onSearchChange: () => undefined,
      onSourceKindChange: () => undefined,
      onRuntimeStatusChange: () => undefined,
      onBoundOnlyChange: () => undefined,
      onSelect: () => undefined,
      onCloseDetail: () => undefined,
      onRefresh: () => undefined,
      onLoadMore: () => undefined,
    }))
    expect(html).toContain("기능 연결")
    expect(html).toContain('aria-label="Skill 검색"')
    expect(html).toContain(`data-skill-ref="${item.skillRef}"`)
    expect(html).toContain('role="dialog"')
    expect(html).toContain("z-[100]")
    expect(html).toContain("연결된 에이전트")
    expect(html).not.toContain("internal-1")
    expect(html).not.toContain("/private")
  })

  it("keeps request cancellation, stale-response protection, and the exact route explicit", () => {
    const page = readFileSync("packages/webui/src/pages/SkillCatalogPage.tsx", "utf8")
    expect(page).toContain("new AbortController()")
    expect(page).toContain("requestSequenceRef")
    expect(page).toContain("controllerRef.current?.abort()")
    expect(page).toContain("item.skillRef")
    expect(readFileSync("packages/webui/src/components/ui/Drawer.tsx", "utf8")).toContain("createPortal(content, document.body)")
    expect(readFileSync("packages/webui/src/components/Layout.tsx", "utf8")).toContain("overflow-y-auto")

    const app = readFileSync("packages/webui/src/App.tsx", "utf8")
    const exact = app.indexOf('path="/capabilities/skills"')
    const wildcard = app.indexOf('path="/capabilities/*"')
    expect(exact).toBeGreaterThan(-1)
    expect(wildcard).toBeGreaterThan(exact)
  })

  it("shows built-in Web research as read-only while keeping binding management available", () => {
    const webResearch = {
      ...item,
      displayName: "Web research",
      description: "Search and inspect public web sources",
      sourceKind: "builtin" as const,
      risk: "safe" as const,
      bindingCount: 1,
      bindings: {
        boundAgents: [{ agentRef: "agent-main", name: "Knowbee" }],
        availableAgents: [],
      },
    }
    const html = renderToStaticMarkup(createElement(SkillCatalogView, {
      items: [webResearch],
      selectedItem: webResearch,
      loading: false,
      loadingMore: false,
      error: null,
      nextCursor: null,
      search: "",
      sourceKind: "",
      runtimeStatus: "",
      boundOnly: false,
      onSearchChange: () => undefined,
      onSourceKindChange: () => undefined,
      onRuntimeStatusChange: () => undefined,
      onBoundOnlyChange: () => undefined,
      onSelect: () => undefined,
      onCloseDetail: () => undefined,
      onRefresh: () => undefined,
      onLoadMore: () => undefined,
    }))

    expect(html).toContain("기본 제공")
    expect(html).toContain("안전")
    expect(html).toContain("읽기 전용")
    expect(html).toContain(">연결 관리<")
    expect(html).not.toContain(">편집<")
    expect(html).not.toContain(">삭제<")
    expect(html).not.toContain(">비활성화<")
  })
})
