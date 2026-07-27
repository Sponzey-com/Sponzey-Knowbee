import { readFileSync } from "node:fs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { createElement } from "../packages/webui/node_modules/react/index.js"
import { localAdapter } from "../packages/webui/src/api/adapters/local.js"
import type {
  YeonjangCapabilityItem,
  YeonjangCapabilitySummary,
} from "../packages/webui/src/contracts/yeonjang.js"
import type { YeonjangActiveTabInfoReadinessLoadState } from "../packages/webui/src/lib/yeonjang-active-tab-info-readiness-load-state.js"
import { YeonjangCatalogView } from "../packages/webui/src/pages/YeonjangCatalogPage.js"

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

const item: YeonjangCapabilityItem = {
  yeonjangRef: `yeonjang_v1_${"a".repeat(24)}`,
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
  capabilityGroups: ["applications", "screen"],
  actionableIssue: null,
}

const callbacks = {
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

const detail = {
  ...item,
  revision: 0,
  bindings: { boundAgents: [], availableAgents: [] },
}

const flows = {
  recoveryFlow: { state: "idle", action: null, reasonCode: null } as const,
  bindingFlow: { state: "viewing", selectedAgentRefs: [], reasonCode: null } as const,
}

const activeTabInfoReadinessState: YeonjangActiveTabInfoReadinessLoadState = {
  status: "ready",
  message: null,
  retryable: false,
  view: {
    method: "browser.active_tab_info",
    audience: "general",
    overallStatus: "action_required",
    title: "활성 탭 확인 준비",
    summary: "확인 필요 1개, 준비됨 1개",
    targetCount: 2,
    readyCount: 1,
    blockedCount: 1,
    primaryAction: {
      userAction: "enable_browser_read_permission",
      label: "브라우저 읽기 권한 허용",
      targetName: "Office Windows",
    },
    groups: {
      ready: {
        count: 1,
        targets: [{
          targetName: "Design Mac",
          platformLabel: "macOS",
          status: "ready",
          statusLabel: "준비됨",
          userAction: "ready_to_request_active_tab_approval",
          actionLabel: "활성 탭 승인 요청 가능",
          reasonLabel: "활성 탭 확인 준비가 끝났습니다.",
          tone: "ready",
          priority: 90,
        }],
      },
      blocked: {
        count: 1,
        targets: [{
          targetName: "Office Windows",
          platformLabel: "Windows",
          status: "permission_required",
          statusLabel: "권한 필요",
          userAction: "enable_browser_read_permission",
          actionLabel: "브라우저 읽기 권한 허용",
          reasonLabel: "브라우저 읽기 권한이 꺼져 있습니다.",
          tone: "warning",
          priority: 10,
        }],
      },
    },
  },
}

describe("task034 Yeonjang catalog page", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubGlobal("localStorage", { getItem: () => null })
  })

  it("serializes public filters and forwards the abort signal", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [item], summary, revision: 0, nextCursor: null }),
    })
    vi.stubGlobal("fetch", fetchMock)
    const controller = new AbortController()
    await localAdapter.getYeonjangCapabilities(
      {
        limit: 100,
        search: "design",
        location: "local",
        platform: "macos",
        status: "ready",
      },
      controller.signal,
    )
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/capabilities/yeonjang?limit=100&search=design&location=local&platform=macos&status=ready",
    )
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(controller.signal)
  })

  it("renders filters, one public row, and a redacted detail drawer", () => {
    const html = renderToStaticMarkup(
      createElement(YeonjangCatalogView, {
        ...callbacks,
        ...flows,
        items: [item],
        summary,
        selectedItem: detail,
        loading: false,
        error: null,
        search: "",
        location: "",
        platform: "",
        status: "",
      }),
    )
    expect(html).toContain('aria-label="연장 검색"')
    expect(html).toContain(`data-yeonjang-ref="${item.yeonjangRef}"`)
    expect(html).toContain('role="dialog"')
    expect(html).toContain("사용 가능한 범위")
    expect(html).not.toMatch(/instanceId|nodeId|mqtt|fingerprint|sessionId|supportedMethods/)
  })

  it("renders active tab readiness as read-only public state without advanced diagnostics", () => {
    const html = renderToStaticMarkup(
      createElement(YeonjangCatalogView, {
        ...callbacks,
        ...flows,
        items: [item],
        summary,
        selectedItem: null,
        activeTabInfoReadinessState,
        loading: false,
        error: null,
        search: "",
        location: "",
        platform: "",
        status: "",
      }),
    )

    expect(html).toContain("활성 탭 확인 준비")
    expect(html).toContain("브라우저 읽기 권한 허용")
    expect(html).toContain("Office Windows")
    expect(html).not.toContain("Windows UI Automation")
    expect(html).not.toContain("advancedDiagnostic")
    expect(html).not.toContain("diagnostic")
    expect(html).not.toContain("reasonCode")
    expect(html).not.toContain("toolHealth")
    expect(html).not.toContain("rawActiveTab")
    expect(html).not.toContain("token=")
    expect(html).not.toContain("internalInstanceId")
  })

  it("renders active tab authorization prompt only from explicit selected public action", () => {
    const html = renderToStaticMarkup(
      createElement(YeonjangCatalogView, {
        ...callbacks,
        ...flows,
        items: [item],
        summary,
        selectedItem: null,
        activeTabInfoReadinessState,
        activeTabInfoAuthorizationAction: activeTabInfoReadinessState.view?.primaryAction,
        loading: false,
        error: null,
        search: "",
        location: "",
        platform: "",
        status: "",
      }),
    )

    expect(html).toContain("활성 탭 확인 승인")
    expect(html).toContain("민감한 읽기 작업")
    expect(html).toContain("승인 전에는 실행하지 않습니다")
    expect(html).toContain("Office Windows")
    expect(html).toContain("브라우저 읽기 권한 허용")
    expect(html).not.toContain("Windows UI Automation")
    expect(html).not.toContain("Browser extension bridge")
    expect(html).not.toContain("internalInstanceId")
    expect(html).not.toContain("rawActiveTab")
    expect(html).not.toContain("windowId")
    expect(html).not.toContain("tabId")
    expect(html).not.toContain("token=")
    expect(html).not.toContain("https://")
  })

  it("renders active tab approval receipt projection without nonce or dispatch output", () => {
    const html = renderToStaticMarkup(
      createElement(YeonjangCatalogView, {
        ...callbacks,
        ...flows,
        items: [item],
        summary,
        selectedItem: null,
        activeTabInfoReadinessState,
        activeTabInfoAuthorizationAction: activeTabInfoReadinessState.view?.primaryAction,
        activeTabInfoApprovalReceipt: {
          method: "browser.active_tab_info",
          publicTargetName: "Office Windows",
          approvalScope: "allow_once",
          approvedAt: "2026-07-22T05:00:00.000Z",
        },
        loading: false,
        error: null,
        search: "",
        location: "",
        platform: "",
        status: "",
      }),
    )

    expect(html).toContain("승인 영수증 생성됨")
    expect(html).toContain("Office Windows")
    expect(html).toContain("이번 단계")
    expect(html).not.toContain("receipt-nonce")
    expect(html).not.toContain("nonce")
    expect(html).not.toContain("invokeNow")
    expect(html).not.toContain("dispatch")
    expect(html).not.toContain("rawActiveTab")
    expect(html).not.toContain("token=")
    expect(html).not.toContain("internalInstanceId")
  })

  it("renders active tab pre-dispatch preview as a pre-run check without raw request data", () => {
    const html = renderToStaticMarkup(
      createElement(YeonjangCatalogView, {
        ...callbacks,
        ...flows,
        items: [item],
        summary,
        selectedItem: null,
        activeTabInfoReadinessState,
        activeTabInfoAuthorizationAction: activeTabInfoReadinessState.view?.primaryAction,
        activeTabInfoApprovalReceipt: {
          method: "browser.active_tab_info",
          publicTargetName: "Office Windows",
          approvalScope: "allow_once",
          approvedAt: "2026-07-22T05:00:00.000Z",
        },
        activeTabInfoPreDispatchPreview: {
          status: "prepared",
          reasonCode: "active_tab_info_pre_dispatch_prepared",
          method: "browser.active_tab_info",
          toolName: "yeonjang_browser_active_tab_info",
          publicTargetName: "Office Windows",
          platform: "windows",
          observationStatus: "available",
          browserName: "Google Chrome",
          requiredGateCount: 5,
          invokeNow: false,
          addRustDispatchNow: false,
          addProductionBindingNow: false,
        },
        loading: false,
        error: null,
        search: "",
        location: "",
        platform: "",
        status: "",
      }),
    )

    expect(html).toContain("실행 전 점검 결과")
    expect(html).toContain("실행 준비됨")
    expect(html).toContain("Office Windows")
    expect(html).not.toContain("receipt-nonce")
    expect(html).not.toContain("nonce")
    expect(html).not.toContain("rawActiveTab")
    expect(html).not.toContain("token=")
    expect(html).not.toContain("internalInstanceId")
    expect(html).not.toContain("backendFamily")
  })

  it("renders active tab readiness failures as short recovery notice without raw error details", () => {
    const html = renderToStaticMarkup(
      createElement(YeonjangCatalogView, {
        ...callbacks,
        ...flows,
        items: [item],
        summary,
        selectedItem: null,
        activeTabInfoReadinessState: {
          status: "error",
          view: null,
          message: "활성 탭 준비 상태를 불러오지 못했습니다. 잠시 후 다시 시도하세요.",
          retryable: true,
        },
        loading: false,
        error: null,
        search: "",
        location: "",
        platform: "",
        status: "",
      }),
    )

    expect(html).toContain("활성 탭 준비 상태를 확인하지 못했습니다")
    expect(html).toContain("잠시 후 다시 시도하세요")
    expect(html).not.toContain("/api/yeonjang/browser-active-tab-info")
    expect(html).not.toContain("token=secret")
    expect(html).not.toContain("advancedDiagnostic")
  })

  it("keeps empty, error, and 100-row states explicit", () => {
    const base = {
      ...callbacks,
      ...flows,
      summary: { ...summary, total: 0, ready: 0, computerControlAvailable: false },
      selectedItem: null,
      loading: false,
      search: "",
      location: "" as const,
      platform: "" as const,
      status: "" as const,
    }
    const empty = renderToStaticMarkup(
      createElement(YeonjangCatalogView, { ...base, items: [], error: null }),
    )
    expect(empty).toContain("조건에 맞는 연장이 없습니다")
    expect(empty).toContain("Knowbee 자체 기능은 계속 사용할 수 있습니다")
    const error = renderToStaticMarkup(
      createElement(YeonjangCatalogView, {
        ...base,
        items: [],
        error: "yeonjang_catalog_read_failed",
      }),
    )
    expect(error).toContain("기능 정보를 불러오지 못했습니다")
    expect(error).toContain("상태 새로고침")
    expect(error).not.toContain("yeonjang_catalog_read_failed")
    const many = Array.from({ length: 100 }, (_, index) => ({
      ...item,
      yeonjangRef: `yeonjang_v1_${index.toString(16).padStart(24, "0")}`,
      displayName: `Computer ${index + 1}`,
    }))
    const list = renderToStaticMarkup(
      createElement(YeonjangCatalogView, {
        ...base,
        items: many,
        summary: { ...summary, total: 100 },
        error: null,
      }),
    )
    expect(list.match(/data-yeonjang-ref=/g)).toHaveLength(100)
  })

  it("owns the exact route before the compatibility wildcard", () => {
    const app = readFileSync("packages/webui/src/App.tsx", "utf8")
    const exact = app.indexOf('path="/capabilities/yeonjang"')
    expect(exact).toBeGreaterThan(-1)
    expect(exact).toBeLessThan(app.indexOf('path="/capabilities/*"'))
    expect(
      readFileSync("packages/webui/src/lib/canonical-compatibility-shell.ts", "utf8"),
    ).not.toContain('{ path: "/capabilities/yeonjang"')
  })
})
