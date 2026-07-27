import { createElement } from "../packages/webui/node_modules/react/index.js"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { describe, expect, it } from "vitest"

import {
  YeonjangActiveTabInfoAuthorizationPrompt,
  YeonjangActiveTabInfoDiagnosticsPanel,
  YeonjangActiveTabInfoReadinessPanel,
} from "../packages/webui/src/components/setup/YeonjangActiveTabInfoReadinessPanel.js"
import type {
  YeonjangActiveTabInfoAdvancedReadinessView,
  YeonjangActiveTabInfoGeneralReadinessView,
} from "../packages/webui/src/lib/yeonjang-active-tab-info-readiness-view.js"

const generalView: YeonjangActiveTabInfoGeneralReadinessView = {
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
        targetName: "Studio Mac",
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
}

const advancedView: YeonjangActiveTabInfoAdvancedReadinessView = {
  method: "browser.active_tab_info",
  audience: "advanced",
  title: "활성 탭 진단",
  summary: "고급 진단에서만 관찰 backend 후보를 확인합니다.",
  targets: [{
    targetName: "Office Windows",
    platformLabel: "Windows",
    statusLabel: "권한 필요",
    backendFamilyLabels: ["Windows UI Automation", "Browser extension bridge"],
  }],
}

describe("Task 203 WebUI active tab info readiness component", () => {
  it("renders the general readiness view with summary, primary action, and grouped targets", () => {
    const html = renderToStaticMarkup(createElement(YeonjangActiveTabInfoReadinessPanel, { view: generalView }))

    expect(html).toContain("활성 탭 확인 준비")
    expect(html).toContain("확인 필요 1개, 준비됨 1개")
    expect(html).toContain("전체")
    expect(html).toContain(">2<")
    expect(html).toContain("준비")
    expect(html).toContain(">1<")
    expect(html).toContain("확인 필요")
    expect(html).toContain("브라우저 읽기 권한 허용")
    expect(html).toContain("Office Windows")
    expect(html).toContain("Studio Mac")
    expect(html).toContain("준비된 연장")
    expect(html).toContain("확인할 연장")
  })

  it("does not render backend diagnostics or raw source fields in the general panel", () => {
    const html = renderToStaticMarkup(createElement(YeonjangActiveTabInfoReadinessPanel, { view: generalView }))

    expect(html).not.toContain("Windows UI Automation")
    expect(html).not.toContain("Browser extension bridge")
    expect(html).not.toContain("advancedDiagnostic")
    expect(html).not.toContain("diagnostic")
    expect(html).not.toContain("reasonCode")
    expect(html).not.toContain("toolHealth")
    expect(html).not.toContain("rawActiveTab")
    expect(html).not.toContain("internalInstanceId")
    expect(html).not.toContain("token=")
    expect(html).not.toContain("Profile")
    expect(html).not.toContain("windowId")
    expect(html).not.toContain("tabId")
  })

  it("renders backend family labels only in the explicit advanced diagnostics panel", () => {
    const html = renderToStaticMarkup(createElement(YeonjangActiveTabInfoDiagnosticsPanel, { view: advancedView }))

    expect(html).toContain("활성 탭 진단")
    expect(html).toContain("Office Windows")
    expect(html).toContain("Windows UI Automation")
    expect(html).toContain("Browser extension bridge")
  })

  it("renders an explicit sensitive-read authorization prompt without raw target internals", () => {
    const html = renderToStaticMarkup(
      createElement(YeonjangActiveTabInfoAuthorizationPrompt, {
        action: generalView.primaryAction,
        receipt: {
          method: "browser.active_tab_info",
          publicTargetName: "Office Windows",
          approvalScope: "allow_once",
          approvedAt: "2026-07-22T05:00:00.000Z",
          nonce: "receipt-nonce-123",
        },
      }),
    )

    expect(html).toContain("활성 탭 확인 승인")
    expect(html).toContain("browser.active_tab_info")
    expect(html).toContain("민감한 읽기 작업")
    expect(html).toContain("Office Windows")
    expect(html).toContain("브라우저 읽기 권한 허용")
    expect(html).toContain("승인 전에는 실행하지 않습니다")
    expect(html).toContain("승인 영수증 생성됨")
    expect(html).toContain("이번 단계")
    expect(html).not.toContain("Windows UI Automation")
    expect(html).not.toContain("Browser extension bridge")
    expect(html).not.toContain("internalInstanceId")
    expect(html).not.toContain("rawActiveTab")
    expect(html).not.toContain("windowId")
    expect(html).not.toContain("tabId")
    expect(html).not.toContain("Profile")
    expect(html).not.toContain("token=")
    expect(html).not.toContain("https://")
    expect(html).not.toContain("receipt-nonce-123")
  })

  it("does not render an authorization prompt when no primary action exists", () => {
    const html = renderToStaticMarkup(
      createElement(YeonjangActiveTabInfoAuthorizationPrompt, {
        action: null,
      }),
    )

    expect(html).toBe("")
  })
})
