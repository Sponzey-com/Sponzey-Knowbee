import { createElement } from "../packages/webui/node_modules/react/index.js"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { describe, expect, it } from "vitest"
import { YeonjangCatalogView } from "../packages/webui/src/pages/YeonjangCatalogPage.tsx"

const item = {
  yeonjangRef: "yeonjang:labels",
  displayName: "작업 컴퓨터",
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
  revision: 1,
  bindings: { boundAgents: [], availableAgents: [] },
}

describe("task026 Yeonjang capability group labels", () => {
  it("shows user-facing capability group labels in cards and details", () => {
    const html = renderToStaticMarkup(
      createElement(YeonjangCatalogView, {
        items: [item],
        summary: {
          total: 1,
          ready: 1,
          local: 1,
          remote: 0,
          permissionRequired: 0,
          stale: 0,
          duplicateInstanceDetected: false,
          knowbeeFallbackAvailable: true,
          computerControlAvailable: true,
        },
        selectedItem: detail,
        recoveryFlow: { state: "idle" },
        bindingFlow: { state: "viewing" },
        loading: false,
        error: null,
        search: "",
        location: "",
        platform: "",
        status: "",
        onSearchChange: () => undefined,
        onLocationChange: () => undefined,
        onPlatformChange: () => undefined,
        onStatusChange: () => undefined,
        onSelect: () => undefined,
        onCloseDetail: () => undefined,
        onRefresh: () => undefined,
        onRequestRecovery: () => undefined,
        onRequestItemRecovery: () => undefined,
        onConfirmRecovery: () => undefined,
        onCancelRecovery: () => undefined,
        onEditBindings: () => undefined,
        onToggleBinding: () => undefined,
        onSaveBindings: () => undefined,
        onCancelBindings: () => undefined,
      }),
    )

    expect(html).toContain(">파일<")
    expect(html).toContain("화면 캡처")
    expect(html).toContain(">시스템<")
    expect(html).not.toContain(">files<")
    expect(html).not.toContain(">screen<")
    expect(html).not.toContain(">system<")
    expect(html).not.toMatch(/capabilityMatrix|raw|private|secret/i)
  })
})
