import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { createElement } from "../packages/webui/node_modules/react/index.js"
import { localAdapter } from "../packages/webui/src/api/adapters/local.js"
import type { YeonjangCapabilityDetail } from "../packages/webui/src/contracts/yeonjang.js"
import { YeonjangCatalogView } from "../packages/webui/src/pages/YeonjangCatalogPage.js"

const detail: YeonjangCapabilityDetail = {
  yeonjangRef: `yeonjang_v1_${"b".repeat(24)}`,
  displayName: "Remote Linux",
  location: "remote",
  platform: "linux",
  supportProfile: "headless_managed",
  status: "permission_required",
  permissionState: "required",
  lastSeenAt: 1_000,
  lastSeenAgeMs: 2_000,
  stale: false,
  runnable: false,
  capabilityGroups: ["files", "system"],
  actionableIssue: "yeonjang_permission_required",
  revision: 4,
  bindings: {
    boundAgents: [{ agentRef: `agent_v1_${"a".repeat(24)}`, name: "Operator" }],
    availableAgents: [{ agentRef: `agent_v1_${"c".repeat(24)}`, name: "Analyst" }],
  },
}
const operator = detail.bindings.boundAgents[0]
const analyst = detail.bindings.availableAgents[0]
if (!operator || !analyst) throw new Error("Task 035 agent fixture is incomplete.")

const summary = {
  total: 1,
  ready: 0,
  local: 0,
  remote: 1,
  permissionRequired: 1,
  stale: 0,
  duplicateInstanceDetected: false,
  knowbeeFallbackAvailable: true as const,
  computerControlAvailable: false,
}

const handlers = {
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

function renderFlows(
  recoveryFlow: Parameters<typeof YeonjangCatalogView>[0]["recoveryFlow"],
  bindingFlow: Parameters<typeof YeonjangCatalogView>[0]["bindingFlow"],
): string {
  return renderToStaticMarkup(
    createElement(YeonjangCatalogView, {
      ...handlers,
      items: [detail],
      summary,
      selectedItem: detail,
      recoveryFlow,
      bindingFlow,
      loading: false,
      error: null,
      search: "",
      location: "",
      platform: "",
      status: "",
    }),
  )
}

describe("Task 035 Yeonjang Drawer mutation UX", () => {
  it("keeps confirmation, success, failure, and retry feedback explicit", () => {
    const confirming = renderFlows(
      { state: "confirming", action: "check_permissions", reasonCode: null },
      { state: "viewing", selectedAgentRefs: [], reasonCode: null },
    )
    expect(confirming).toContain("실행 전 확인")
    expect(confirming).toContain(">실행<")
    expect(confirming).toContain(">취소<")

    const success = renderFlows(
      { state: "active", action: "check_permissions", reasonCode: null },
      { state: "viewing", selectedAgentRefs: [], reasonCode: null },
    )
    expect(success).toContain("확인 완료")

    const failed = renderFlows(
      { state: "failed", action: "check_permissions", reasonCode: "verification_failed" },
      { state: "viewing", selectedAgentRefs: [], reasonCode: null },
    )
    expect(failed).toContain("작업을 완료하지 못했습니다")
    expect(failed).not.toContain("verification_failed")
    expect(failed).toContain("다시 시도")
  })

  it("renders name-only binding controls and disables duplicate submission while saving", () => {
    const editing = renderFlows(
      { state: "idle", action: null, reasonCode: null },
      { state: "editing", selectedAgentRefs: [operator.agentRef], reasonCode: null },
    )
    expect(editing).toContain('aria-label="Operator"')
    expect(editing).toContain('aria-label="Analyst"')
    expect(editing).not.toContain(operator.agentRef)

    const saving = renderFlows(
      { state: "idle", action: null, reasonCode: null },
      { state: "saving", selectedAgentRefs: [], reasonCode: null },
    )
    expect(saving).toContain('aria-busy="true"')
    expect(saving).toMatch(/<button[^>]*disabled[^>]*>[^<]*취소/)
  })

  it("serializes recovery and binding envelopes without losing AbortSignal", async () => {
    vi.stubGlobal("localStorage", { getItem: () => null })
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ state: "active", revision: 5 }),
    })
    vi.stubGlobal("fetch", fetchMock)
    const controller = new AbortController()
    const envelope = {
      scope: "capability:write" as const,
      mutationId: "mutation-12345678",
      targetRevision: 5,
      purpose: "yeonjang_check_permissions",
      issuedAt: 1_000,
      nonce: "nonce-12345678",
    }
    await localAdapter.recoverYeonjang(
      detail.yeonjangRef,
      { action: "check_permissions", envelope },
      controller.signal,
    )
    await localAdapter.updateYeonjangBinding(
      detail.yeonjangRef,
      analyst.agentRef,
      { bound: true, envelope: { ...envelope, purpose: "yeonjang_bind" } },
      controller.signal,
    )

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      signal: controller.signal,
    })
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body)).toEqual({
      action: "check_permissions",
      envelope,
    })
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: "PATCH",
      signal: controller.signal,
    })
  })
})
