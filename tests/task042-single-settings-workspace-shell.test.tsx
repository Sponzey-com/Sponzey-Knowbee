import { readFileSync } from "node:fs"
import { createElement } from "../packages/webui/node_modules/react/index.js"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { describe, expect, it, vi } from "vitest"
import { SingleSettingsWorkspaceShell } from "../packages/webui/src/components/setup/SingleSettingsWorkspaceShell.tsx"
import { buildSingleSettingsWorkspace } from "../packages/webui/src/lib/unified-settings-workspace.ts"

const workspace = buildSingleSettingsWorkspace({
  locale: "ko",
  adminEnabled: false,
  selectedSectionId: "connections",
  lifecycleBySection: {
    basics: "active",
    ai: "active",
    connections: "saved_restart_required",
    sub_agents: "clean",
    automation: "unavailable",
    memory: "unsaved",
    permissions: "active",
  },
})

describe("task042 single settings workspace shell", () => {
  it("renders ordered required and optional navigation with one selected state", () => {
    const html = renderToStaticMarkup(createElement(SingleSettingsWorkspaceShell, {
      workspace,
      onSelectSection: vi.fn(),
      children: createElement("div", null, "연결 설정 본문"),
    }))

    expect(html).toContain('aria-label="설정"')
    expect(html).toContain('aria-current="page"')
    expect(html.match(/aria-current="page"/g)).toHaveLength(1)
    expect(html.indexOf("기본 설정")).toBeLessThan(html.indexOf("AI"))
    expect(html.indexOf("AI")).toBeLessThan(html.indexOf("연결"))
    expect(html).toContain("저장됨 · 다시 시작 필요")
    expect(html).toContain("연결 설정 본문")
    expect(html).not.toContain("setup.connections.save")
    expect(html).not.toContain("beginner")
    expect(html).not.toContain("advanced")
  })

  it("uses view-model labels for unavailable and unsaved sections without raw details", () => {
    const html = renderToStaticMarkup(createElement(SingleSettingsWorkspaceShell, {
      workspace,
      onSelectSection: vi.fn(),
      children: null,
      emptyMessage: "현재 표시할 설정이 없습니다.",
    }))

    expect(html).toContain("확인 불가")
    expect(html).toContain("저장 필요")
    expect(html).toContain("현재 표시할 설정이 없습니다.")
    expect(html).not.toContain("unavailable")
    expect(html).not.toContain("unsaved")
  })

  it("keeps responsive and wrapping constraints in the presentational boundary", () => {
    const source = readFileSync("packages/webui/src/components/setup/SingleSettingsWorkspaceShell.tsx", "utf8")

    expect(source).toContain("lg:grid-cols-[240px_minmax(0,1fr)]")
    expect(source).toContain("min-w-0")
    expect(source).toContain("break-words")
    expect(source).toContain("[overflow-wrap:anywhere]")
    expect(source).not.toMatch(/useUiModeStore|useSetupStore|useLocation|localStorage|process\.env|fetch\(/)
    expect(source).not.toContain("saveCommand")
  })
})
