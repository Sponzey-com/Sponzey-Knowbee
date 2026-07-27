import { readFileSync } from "node:fs"
import { createElement } from "../packages/webui/node_modules/react/index.js"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { describe, expect, it } from "vitest"
import { YeonjangCatalogView } from "../packages/webui/src/pages/YeonjangCatalogPage.tsx"

const readyItem = {
  yeonjangRef: "yeonjang:ready",
  displayName: "마당쇠 컴퓨터",
  location: "local" as const,
  platform: "macos" as const,
  supportProfile: "desktop_interactive" as const,
  status: "ready" as const,
  permissionState: "ready" as const,
  lastSeenAt: 1_000,
  lastSeenAgeMs: 5_000,
  stale: false,
  runnable: true,
  capabilityGroups: ["files", "screen", "system"] as const,
  actionableIssue: null,
}

const readyDetail = {
  ...readyItem,
  revision: 3,
  bindings: {
    boundAgents: [],
    availableAgents: [],
  },
  platformSupport: {
    platform: "macos" as const,
    supportProfile: "desktop_interactive" as const,
    capabilities: {
      files: { status: "supported" as const, reasonCodes: [] },
      screen: { status: "supported" as const, reasonCodes: [] },
      system: { status: "supported" as const, reasonCodes: [] },
      input: { status: "supported" as const, reasonCodes: [] },
      applications: { status: "supported" as const, reasonCodes: [] },
    },
    processControl: { status: "supported" as const, reasonCodes: [] },
    trayWindow: { status: "supported" as const, reasonCodes: [] },
    packageSmoke: { status: "supported" as const, reasonCodes: [] },
    runnableCapabilityGroups: ["files", "screen", "system"] as const,
  },
}

const baseProps = {
  items: [readyItem],
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
  selectedItem: readyDetail,
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
  onRequestItemRecovery: () => undefined,
  onConfirmRecovery: () => undefined,
  onCancelRecovery: () => undefined,
  onEditBindings: () => undefined,
  onToggleBinding: () => undefined,
  onSaveBindings: () => undefined,
  onCancelBindings: () => undefined,
}

describe("task027 Yeonjang detail status check action", () => {
  it("renders a manual status check action for a ready selected Yeonjang", () => {
    const html = renderToStaticMarkup(createElement(YeonjangCatalogView, baseProps))

    expect(html).toContain("상태 확인")
    expect(html).toContain('data-yeonjang-action="check_permissions"')
    expect(html).toContain("마당쇠 컴퓨터")
    expect(html).not.toMatch(/raw|secret|private|capabilityMatrix/i)
  })

  it("wires the ready-state detail action through the explicit recovery state machine action", () => {
    const source = readFileSync("packages/webui/src/pages/YeonjangCatalogPage.tsx", "utf8")

    expect(source).toContain("manualStatusCheckAction")
    expect(source).toContain('props.onRequestRecovery(displayRecoveryAction)')
    expect(source).toContain('manualStatusCheckAction ? text("상태 확인", "Check status")')
  })
})
