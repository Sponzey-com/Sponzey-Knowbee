import { describe, expect, it } from "vitest"

import {
  buildYeonjangActiveTabInfoReadinessErrorState,
  buildYeonjangActiveTabInfoReadinessLoadingState,
  loadYeonjangBrowserActiveTabInfoReadinessState,
} from "../packages/webui/src/lib/yeonjang-active-tab-info-readiness-load-state.js"

const text = (ko: string, _en: string) => ko

const publicSummary = {
  schemaVersion: "yeonjang-browser-active-tab-info-public-readiness-summary-v1",
  method: "browser.active_tab_info",
  audience: "general",
  readyCount: 1,
  blockedCount: 1,
  targets: [
    {
      publicTargetName: "Studio Mac",
      platform: "macos",
      readinessStatus: "ready",
      statusLabel: "준비됨",
      userAction: "ready_to_request_active_tab_approval",
      actionLabel: "활성 탭 승인 요청 가능",
      reasonLabel: "활성 탭 확인 준비가 끝났습니다.",
      rawActiveTab: {
        title: "Private Console",
        url: "https://example.test/private?token=secret",
        windowId: "window-private",
        tabId: "tab-private",
      },
    },
    {
      publicTargetName: "Office Windows",
      platform: "windows",
      readinessStatus: "permission_required",
      statusLabel: "권한 필요",
      userAction: "enable_browser_read_permission",
      actionLabel: "브라우저 읽기 권한 허용",
      reasonLabel: "브라우저 읽기 권한이 꺼져 있습니다.",
      advancedDiagnostic: {
        candidateBackendFamilies: ["windows_ui_automation"],
      },
      diagnostic: {
        reasonCode: "browser_read_permission_disabled",
      },
      toolHealth: {
        "browser.active_tab_info": { status: "permission_disabled" },
      },
      internalInstanceId: "internal-private-instance",
    },
  ],
}

describe("Task 204 WebUI active tab info readiness load state", () => {
  it("loads a ready state through parser and general view-model without preserving raw payload fields", async () => {
    const state = await loadYeonjangBrowserActiveTabInfoReadinessState({
      request: async () => publicSummary,
      text,
    })

    expect(state.status).toBe("ready")
    expect(state.view?.audience).toBe("general")
    expect(state.view?.targetCount).toBe(2)
    expect(state.view?.primaryAction?.label).toBe("브라우저 읽기 권한 허용")

    const serialized = JSON.stringify(state)
    expect(serialized).not.toContain("windows_ui_automation")
    expect(serialized).not.toContain("advancedDiagnostic")
    expect(serialized).not.toContain("diagnostic")
    expect(serialized).not.toContain("reasonCode")
    expect(serialized).not.toContain("toolHealth")
    expect(serialized).not.toContain("rawActiveTab")
    expect(serialized).not.toContain("token=secret")
    expect(serialized).not.toContain("window-private")
    expect(serialized).not.toContain("tab-private")
    expect(serialized).not.toContain("internal-private-instance")
  })

  it("represents an empty public summary as an unavailable empty state", async () => {
    const state = await loadYeonjangBrowserActiveTabInfoReadinessState({
      request: async () => ({
        schemaVersion: "yeonjang-browser-active-tab-info-public-readiness-summary-v1",
        method: "browser.active_tab_info",
        audience: "general",
        readyCount: 0,
        blockedCount: 0,
        targets: [],
      }),
      text,
    })

    expect(state.status).toBe("empty")
    expect(state.view?.overallStatus).toBe("unavailable")
    expect(state.view?.summary).toBe("활성 탭을 확인할 수 있는 연장이 없습니다.")
  })

  it("keeps only the previous public view while loading", async () => {
    const previous = await loadYeonjangBrowserActiveTabInfoReadinessState({
      request: async () => publicSummary,
      text,
    })
    const loading = buildYeonjangActiveTabInfoReadinessLoadingState(previous.view)

    expect(loading.status).toBe("loading")
    expect(loading.view?.targetCount).toBe(2)
    expect(JSON.stringify(loading)).not.toContain("rawActiveTab")
    expect(JSON.stringify(loading)).not.toContain("token=secret")
  })

  it("converts request and parse failures into short retryable user-facing error state", async () => {
    const state = await loadYeonjangBrowserActiveTabInfoReadinessState({
      request: async () => {
        throw new Error("GET /api/yeonjang/browser-active-tab-info/readiness token=secret failed")
      },
      text,
    })

    expect(state).toEqual({
      status: "error",
      view: null,
      message: "활성 탭 준비 상태를 불러오지 못했습니다. 잠시 후 다시 시도하세요.",
      retryable: true,
    })
    expect(JSON.stringify(state)).not.toContain("token=secret")

    const parseError = buildYeonjangActiveTabInfoReadinessErrorState(
      new Error("Invalid active tab readiness field: advancedDiagnostic token=secret"),
      null,
      text,
    )
    expect(parseError.message).toBe("활성 탭 준비 상태를 불러오지 못했습니다. 잠시 후 다시 시도하세요.")
    expect(JSON.stringify(parseError)).not.toContain("advancedDiagnostic")
    expect(JSON.stringify(parseError)).not.toContain("token=secret")
  })
})
