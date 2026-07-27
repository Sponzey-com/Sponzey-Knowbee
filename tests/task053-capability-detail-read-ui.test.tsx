import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { createElement } from "../packages/webui/node_modules/react/index.js"
import type { McpCatalogDetail } from "../packages/webui/src/contracts/mcp.js"
import type {
  YeonjangCapabilityDetail,
  YeonjangCapabilitySummary,
} from "../packages/webui/src/contracts/yeonjang.js"
import type { ResourceReadState } from "../packages/webui/src/lib/resource-read-state.js"
import type { UserRecoveryProjection } from "../packages/webui/src/lib/user-recovery.js"
import { McpCatalogView } from "../packages/webui/src/pages/McpCatalogPage.js"
import { YeonjangCatalogView } from "../packages/webui/src/pages/YeonjangCatalogPage.js"

const failure: UserRecoveryProjection = {
  kind: "unavailable",
  reasonCode: "private_adapter_detail_503",
  messageKey: "unavailable",
  action: "refresh_state",
  actionLabelKey: "refresh_state",
}

const mcpDetail: McpCatalogDetail = {
  mcpRef: `mcp_v1_${"a".repeat(24)}`,
  displayName: "Penpot",
  transport: "stdio",
  configuredStatus: "enabled",
  runtimeStatus: "ready",
  required: false,
  toolCount: 1,
  bindingCount: 0,
  issueCode: null,
  revision: 2,
  tools: [{ name: "inspect_design", description: "Inspect a design" }],
  bindings: { boundAgents: [], availableAgents: [] },
}

const yeonjangDetail: YeonjangCapabilityDetail = {
  yeonjangRef: `yeonjang_v1_${"b".repeat(24)}`,
  displayName: "Design Mac",
  location: "local",
  platform: "macos",
  supportProfile: "desktop_interactive",
  status: "ready",
  permissionState: "ready",
  lastSeenAt: 1_000,
  lastSeenAgeMs: 2_000,
  stale: false,
  runnable: true,
  capabilityGroups: ["screen"],
  actionableIssue: null,
  revision: 3,
  bindings: { boundAgents: [], availableAgents: [] },
}

const summary: YeonjangCapabilitySummary = {
  total: 1,
  ready: 1,
  local: 1,
  remote: 0,
  permissionRequired: 0,
  stale: 0,
  duplicateInstanceDetected: false,
  knowbeeFallbackAvailable: true,
  computerControlAvailable: true,
}

function failed<T>(): ResourceReadState<T> {
  return { status: "failed", data: null, observedAt: null, failure }
}

function stale<T>(data: T): ResourceReadState<T> {
  return { status: "stale", data, observedAt: 1_000, failure }
}

const noOp = () => undefined

function renderMcp(detailReadState: ResourceReadState<McpCatalogDetail>): string {
  return renderToStaticMarkup(
    createElement(McpCatalogView, {
      items: [mcpDetail],
      selectedItem: mcpDetail,
      detailReadState,
      loading: false,
      loadingMore: false,
      nextCursor: null,
      search: "",
      transport: "",
      runtimeStatus: "",
      boundOnly: false,
      onSearchChange: noOp,
      onTransportChange: noOp,
      onRuntimeStatusChange: noOp,
      onBoundOnlyChange: noOp,
      onSelect: noOp,
      onCloseDetail: noOp,
      onRefreshDetail: noOp,
      onRefresh: noOp,
      onLoadMore: noOp,
    }),
  )
}

function renderYeonjang(detailReadState: ResourceReadState<YeonjangCapabilityDetail>): string {
  return renderToStaticMarkup(
    createElement(YeonjangCatalogView, {
      items: [yeonjangDetail],
      summary,
      selectedItem: yeonjangDetail,
      detailReadState,
      recoveryFlow: { state: "idle", action: null, reasonCode: null },
      bindingFlow: { state: "viewing", selectedAgentRefs: [], reasonCode: null },
      loading: false,
      search: "",
      location: "",
      platform: "",
      status: "",
      onSearchChange: noOp,
      onLocationChange: noOp,
      onPlatformChange: noOp,
      onStatusChange: noOp,
      onSelect: noOp,
      onCloseDetail: noOp,
      onRefreshDetail: noOp,
      onRefresh: noOp,
      onRequestRecovery: noOp,
      onConfirmRecovery: noOp,
      onCancelRecovery: noOp,
      onEditBindings: noOp,
      onToggleBinding: noOp,
      onSaveBindings: noOp,
      onCancelBindings: noOp,
    }),
  )
}

describe("Task053 capability detail recovery UI", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", { getItem: () => null })
  })

  it("keeps only safe MCP list fields when the first detail read fails", () => {
    const html = renderMcp(failed())
    expect(html).toContain("기능 정보를 불러오지 못했습니다")
    expect(html).toContain("상태 새로고침")
    expect(html).toContain("Penpot")
    expect(html).toContain("상세 정보 확인 필요")
    expect(html).not.toContain("private_adapter_detail_503")
    expect(html).not.toContain("inspect_design")
    expect(html).not.toContain(">수정<")
  })

  it("keeps only safe Yeonjang list fields when the first detail read fails", () => {
    const html = renderYeonjang(failed())
    expect(html).toContain("기능 정보를 불러오지 못했습니다")
    expect(html).toContain("상태 새로고침")
    expect(html).toContain("Design Mac")
    expect(html).toContain("상세 정보 확인 필요")
    expect(html).not.toContain("private_adapter_detail_503")
    expect(html).not.toContain(">사용 가능한 범위</h3>")
    expect(html).not.toContain("연결 관리")
  })

  it("shows stale warnings while retaining the last verified details", () => {
    const mcp = renderMcp(stale(mcpDetail))
    const yeonjang = renderYeonjang(stale(yeonjangDetail))
    for (const html of [mcp, yeonjang]) {
      expect(html).toContain("이전 정보를 표시하고 있습니다")
      expect(html).toContain("상태 새로고침")
      expect(html).not.toContain("private_adapter_detail_503")
    }
    expect(mcp).toContain("inspect_design")
    expect(mcp).toContain(">수정<")
    expect(yeonjang).toContain("사용 가능한 범위")
    expect(yeonjang).toContain("연결 관리")
  })
})
