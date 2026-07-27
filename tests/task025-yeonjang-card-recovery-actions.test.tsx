import { readFileSync } from "node:fs"
import { createElement } from "../packages/webui/node_modules/react/index.js"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { describe, expect, it } from "vitest"
import { YeonjangCatalogView } from "../packages/webui/src/pages/YeonjangCatalogPage.tsx"

function item(overrides: Partial<Parameters<typeof YeonjangCatalogView>[0]["items"][number]>) {
  return {
    yeonjangRef: overrides.yeonjangRef ?? "yeonjang:ready",
    displayName: overrides.displayName ?? "작업 컴퓨터",
    location: overrides.location ?? "local",
    platform: overrides.platform ?? "macos",
    supportProfile: overrides.supportProfile ?? "desktop_interactive",
    status: overrides.status ?? "ready",
    permissionState: overrides.permissionState ?? "ready",
    lastSeenAt: overrides.lastSeenAt ?? 1_000,
    lastSeenAgeMs: overrides.lastSeenAgeMs ?? 10_000,
    stale: overrides.stale ?? false,
    runnable: overrides.runnable ?? true,
    capabilityGroups: overrides.capabilityGroups ?? ["files", "system"],
    actionableIssue: overrides.actionableIssue ?? null,
  } as Parameters<typeof YeonjangCatalogView>[0]["items"][number]
}

const baseProps = {
  items: [
    item({ yeonjangRef: "yeonjang:ready", displayName: "준비됨" }),
    item({
      yeonjangRef: "yeonjang:permission",
      displayName: "권한 필요 컴퓨터",
      status: "permission_required",
      permissionState: "required",
      actionableIssue: "yeonjang_permission_required",
    }),
    item({
      yeonjangRef: "yeonjang:stale",
      displayName: "응답 지연 컴퓨터",
      status: "stale",
      stale: true,
      actionableIssue: "yeonjang_stale",
    }),
  ],
  summary: {
    total: 3,
    ready: 1,
    local: 3,
    remote: 0,
    permissionRequired: 1,
    stale: 1,
    duplicateInstanceDetected: false,
    knowbeeFallbackAvailable: true as const,
    computerControlAvailable: true,
  },
  selectedItem: null,
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

describe("task025 Yeonjang card recovery actions", () => {
  it("renders card-level recovery actions for permission and stale Yeonjang states", () => {
    const html = renderToStaticMarkup(createElement(YeonjangCatalogView, baseProps))

    expect(html).toContain("권한 필요 컴퓨터")
    expect(html).toContain("응답 지연 컴퓨터")
    expect(html).toContain('data-yeonjang-action="check_permissions"')
    expect(html).toContain('data-yeonjang-action="reconnect"')
    expect(html).toContain("권한 확인")
    expect(html).toContain("다시 연결")
    expect(html).toContain("상세 보기")
    expect(html).not.toMatch(/raw|secret|private|capabilityMatrix/i)
  })

  it("keeps item-level recovery wired through selection and the existing recovery reducer", () => {
    const source = readFileSync("packages/webui/src/pages/YeonjangCatalogPage.tsx", "utf8")

    expect(source).toContain("onRequestItemRecovery")
    expect(source).toContain("requestItemRecovery")
    expect(source).toContain("await select(yeonjangRef)")
    expect(source).toContain('reduceYeonjangRecoveryFlow(current, { type: "request", action })')
  })
})
