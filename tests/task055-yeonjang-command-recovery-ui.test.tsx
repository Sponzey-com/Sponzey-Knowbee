import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { createElement } from "../packages/webui/node_modules/react/index.js"
import type { YeonjangCapabilityDetail } from "../packages/webui/src/contracts/yeonjang.js"
import { YeonjangCatalogView } from "../packages/webui/src/pages/YeonjangCatalogPage.js"

const detail = {
  yeonjangRef: `yeonjang_v1_${"c".repeat(24)}`,
  displayName: "Design Mac",
  location: "local",
  platform: "macos",
  supportProfile: "desktop_interactive",
  status: "permission_required",
  permissionState: "required",
  lastSeenAt: 1_000,
  lastSeenAgeMs: 2_000,
  stale: false,
  runnable: false,
  capabilityGroups: ["screen"],
  actionableIssue: "yeonjang_permission_required",
  revision: 2,
  bindings: {
    boundAgents: [{ agentRef: `agent_v1_${"a".repeat(24)}`, name: "Operator" }],
    availableAgents: [{ agentRef: `agent_v1_${"b".repeat(24)}`, name: "Analyst" }],
  },
} satisfies YeonjangCapabilityDetail

const summary = {
  total: 1,
  ready: 0,
  local: 1,
  remote: 0,
  permissionRequired: 1,
  stale: 0,
  duplicateInstanceDetected: false,
  knowbeeFallbackAvailable: true as const,
  computerControlAvailable: false,
}

const noOp = () => undefined

function render(
  recoveryFlow: Parameters<typeof YeonjangCatalogView>[0]["recoveryFlow"],
  bindingFlow: Parameters<typeof YeonjangCatalogView>[0]["bindingFlow"],
): string {
  return renderToStaticMarkup(
    createElement(YeonjangCatalogView, {
      items: [detail],
      summary,
      selectedItem: detail,
      recoveryFlow,
      bindingFlow,
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

describe("Task055 Yeonjang command recovery UI", () => {
  it("maps unknown recovery failures to safe copy and a specific recovery action", () => {
    const html = render(
      { state: "failed", action: "check_permissions", reasonCode: "private_raw_reason" },
      { state: "viewing", selectedAgentRefs: [], reasonCode: null },
    )
    expect(html).toContain("작업을 완료하지 못했습니다")
    expect(html).toContain(">권한 다시 확인<")
    expect(html).not.toContain("private_raw_reason")
  })

  it("requires state refresh instead of resubmission after partial binding", () => {
    const html = render(
      { state: "idle", action: null, reasonCode: null },
      {
        state: "failed",
        selectedAgentRefs: detail.bindings.boundAgents.map((agent) => agent.agentRef),
        reasonCode: "capability_command_unavailable",
        requiresRefresh: true,
      },
    )
    expect(html).toContain("연장에 일시적으로 연결할 수 없습니다")
    expect(html).toContain(">상태 새로고침<")
    expect(html).not.toContain(">연결 저장<")
    expect(html).not.toContain("capability_command_unavailable")
  })
})
