import { createElement } from "../packages/webui/node_modules/react/index.js"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { describe, expect, it } from "vitest"
import { YeonjangCatalogView } from "../packages/webui/src/pages/YeonjangCatalogPage.tsx"

const item = {
  yeonjangRef: "yeonjang:main",
  displayName: "마당쇠 컴퓨터",
  location: "local" as const,
  platform: "macos" as const,
  supportProfile: "desktop_interactive" as const,
  status: "ready" as const,
  permissionState: "ready" as const,
  lastSeenAt: 1_000,
  lastSeenAgeMs: 10_000,
  stale: false,
  runnable: true,
  capabilityGroups: ["files", "screen", "system"] as const,
  actionableIssue: null,
}

const detail = {
  ...item,
  revision: 7,
  bindings: {
    boundAgents: [{ agentRef: "agent:main", name: "마당쇠" }],
    availableAgents: [],
  },
  platformSupport: {
    platform: "macos" as const,
    supportProfile: "desktop_interactive" as const,
    capabilities: {
      files: { status: "supported" as const, reasonCodes: [] },
      screen: { status: "supported" as const, reasonCodes: [] },
      system: { status: "supported" as const, reasonCodes: [] },
      input: { status: "permission_required" as const, reasonCodes: ["permission"] },
      applications: { status: "supported" as const, reasonCodes: [] },
    },
    processControl: { status: "supported" as const, reasonCodes: [] },
    trayWindow: { status: "supported" as const, reasonCodes: [] },
    packageSmoke: { status: "supported" as const, reasonCodes: [] },
    runnableCapabilityGroups: ["files", "screen", "system"] as const,
  },
}

const baseProps = {
  items: [item],
  summary: {
    total: 1,
    ready: 1,
    local: 1,
    remote: 0,
    permissionRequired: 0,
    stale: 0,
    duplicateInstanceDetected: false,
    knowbeeFallbackAvailable: true as const,
    computerControlAvailable: true,
  },
  recoveryFlow: { state: "idle" as const },
  bindingFlow: { state: "viewing" as const },
  loading: false,
  error: null,
  search: "",
  location: "" as const,
  platform: "" as const,
  status: "" as const,
  onSearchChange: () => undefined,
  onLocationChange: () => undefined,
  onPlatformChange: () => undefined,
  onStatusChange: () => undefined,
  onSelect: () => undefined,
  onCloseDetail: () => undefined,
  onRefresh: () => undefined,
  onRequestRecovery: () => undefined,
  onConfirmRecovery: () => undefined,
  onCancelRecovery: () => undefined,
  onEditBindings: () => undefined,
  onToggleBinding: () => undefined,
  onSaveBindings: () => undefined,
  onCancelBindings: () => undefined,
}

describe("task024 Yeonjang catalog layout", () => {
  it("renders the list and the selected Yeonjang detail as an always-visible side panel", () => {
    const html = renderToStaticMarkup(
      createElement(YeonjangCatalogView, {
        ...baseProps,
        selectedItem: detail,
      }),
    )

    expect(html).toContain('aria-label="연장 목록과 상세"')
    expect(html).toContain('aria-label="연장 운영 상세"')
    expect(html).toContain('data-yeonjang-ref="yeonjang:main"')
    expect(html.indexOf('data-yeonjang-ref="yeonjang:main"')).toBeLessThan(
      html.indexOf('aria-label="연장 운영 상세"'),
    )
    expect(html).toContain("마당쇠 컴퓨터")
    expect(html).toContain("사용 가능한 범위")
    expect(html).not.toContain('role="dialog"')
    expect(html).not.toContain("z-[100]")
    expect(html).not.toMatch(/raw|secret|private|capabilityMatrix/i)
  })

  it("keeps a stable detail panel placeholder when no Yeonjang is selected", () => {
    const html = renderToStaticMarkup(
      createElement(YeonjangCatalogView, {
        ...baseProps,
        selectedItem: null,
      }),
    )

    expect(html).toContain('aria-label="연장 운영 상세"')
    expect(html).toContain("연장을 선택하세요")
    expect(html).not.toContain('role="dialog"')
  })
})
