import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { createElement } from "../packages/webui/node_modules/react/index.js"
import type { McpCatalogPageResponse } from "../packages/webui/src/contracts/mcp.js"
import type {
  YeonjangCapabilityItem,
  YeonjangCapabilityPage,
} from "../packages/webui/src/contracts/yeonjang.js"
import type { ResourceReadState } from "../packages/webui/src/lib/resource-read-state.js"
import { McpCatalogView } from "../packages/webui/src/pages/McpCatalogPage.js"
import { YeonjangCatalogView } from "../packages/webui/src/pages/YeonjangCatalogPage.js"

const noop = () => undefined
const failure = {
  kind: "unknown",
  reasonCode: "catalog_read_failed",
  safeMessage: "The latest catalog could not be loaded.",
  action: "refresh_state",
} as const

describe("Task051 stale capability catalog UI", () => {
  it("keeps a verified MCP row visible after refresh failure", () => {
    vi.stubGlobal("localStorage", { getItem: () => null })
    const item = {
      mcpRef: `mcp_v1_${"a".repeat(24)}`,
      displayName: "Penpot",
      transport: "stdio",
      configuredStatus: "enabled",
      runtimeStatus: "ready",
      required: false,
      toolCount: 2,
      bindingCount: 1,
      issueCode: null,
      revision: 3,
    } as const
    const data: McpCatalogPageResponse = {
      items: [item],
      nextCursor: null,
      revision: 3,
      observedAt: 1_000,
    }
    const readState: ResourceReadState<McpCatalogPageResponse> = {
      status: "stale",
      data,
      observedAt: data.observedAt,
      failure,
    }
    const html = renderToStaticMarkup(
      createElement(McpCatalogView, {
        items: [item],
        selectedItem: null,
        loading: false,
        loadingMore: false,
        detailLoading: false,
        readState,
        nextCursor: null,
        search: "",
        transport: "",
        runtimeStatus: "",
        boundOnly: false,
        onSearchChange: noop,
        onTransportChange: noop,
        onRuntimeStatusChange: noop,
        onBoundOnlyChange: noop,
        onSelect: noop,
        onCloseDetail: noop,
        onRefresh: noop,
        onLoadMore: noop,
      }),
    )
    expect(html).toContain("Penpot")
    expect(html).toContain("이전 정보를 표시하고 있습니다")
    expect(html).not.toContain("catalog_read_failed")
  })

  it("keeps the Yeonjang row and summary visible after refresh failure", () => {
    vi.stubGlobal("localStorage", { getItem: () => null })
    const item: YeonjangCapabilityItem = {
      yeonjangRef: `yeonjang_v1_${"b".repeat(24)}`,
      displayName: "Office Mac",
      location: "local",
      platform: "macos",
      supportProfile: "desktop_interactive",
      status: "ready",
      permissionState: "ready",
      lastSeenAt: 900,
      lastSeenAgeMs: 100,
      stale: false,
      runnable: true,
      capabilityGroups: ["screen"],
      actionableIssue: null,
    }
    const data: YeonjangCapabilityPage = {
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
      revision: 4,
      nextCursor: null,
      observedAt: 1_000,
    }
    const readState: ResourceReadState<YeonjangCapabilityPage> = {
      status: "stale",
      data,
      observedAt: data.observedAt,
      failure,
    }
    const html = renderToStaticMarkup(
      createElement(YeonjangCatalogView, {
        items: [item],
        summary: data.summary,
        selectedItem: null,
        recoveryFlow: { state: "idle", action: null, reasonCode: null },
        bindingFlow: { state: "viewing", selectedAgentRefs: [], reasonCode: null },
        loading: false,
        readState,
        search: "",
        location: "",
        platform: "",
        status: "",
        onSearchChange: noop,
        onLocationChange: noop,
        onPlatformChange: noop,
        onStatusChange: noop,
        onSelect: noop,
        onCloseDetail: noop,
        onRefresh: noop,
        onRequestRecovery: noop,
        onConfirmRecovery: noop,
        onCancelRecovery: noop,
        onEditBindings: noop,
        onToggleBinding: noop,
        onSaveBindings: noop,
        onCancelBindings: noop,
      }),
    )
    expect(html).toContain("Office Mac")
    expect(html).toContain("이전 정보를 표시하고 있습니다")
    expect(html).not.toContain("catalog_read_failed")
  })
})
