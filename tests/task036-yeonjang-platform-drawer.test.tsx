import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { createElement } from "../packages/webui/node_modules/react/index.js"
import type { YeonjangCapabilityDetail } from "../packages/webui/src/contracts/yeonjang.js"
import { YeonjangCatalogView } from "../packages/webui/src/pages/YeonjangCatalogPage.js"

describe("Task 036 Yeonjang platform drawer", () => {
  it("renders the bounded platform summary without reason codes or internal identifiers", () => {
    const selectedItem: YeonjangCapabilityDetail = {
      yeonjangRef: `yeonjang_v1_${"a".repeat(24)}`,
      displayName: "Remote Linux",
      location: "remote",
      platform: "linux",
      supportProfile: "headless_managed",
      status: "ready",
      permissionState: "ready",
      lastSeenAt: 1_000,
      lastSeenAgeMs: 2_000,
      stale: false,
      runnable: true,
      capabilityGroups: ["files", "system"],
      actionableIssue: null,
      revision: 1,
      bindings: { boundAgents: [], availableAgents: [] },
      platformSupport: {
        platform: "linux",
        supportProfile: "headless_managed",
        capabilities: {
          applications: { status: "supported", reasonCodes: [] },
          files: { status: "supported", reasonCodes: [] },
          input: { status: "unsupported", reasonCodes: ["headless_desktop_absent"] },
          screen: { status: "unsupported", reasonCodes: ["headless_desktop_absent"] },
          system: { status: "supported", reasonCodes: [] },
        },
        processControl: { status: "supported", reasonCodes: [] },
        trayWindow: { status: "unsupported", reasonCodes: ["headless_profile_no_tray"] },
        packageSmoke: { status: "supported", reasonCodes: [] },
        runnableCapabilityGroups: ["files", "system"],
      },
    }
    const html = renderToStaticMarkup(
      createElement(YeonjangCatalogView, {
        items: [selectedItem],
        summary: {
          total: 1,
          ready: 1,
          local: 0,
          remote: 1,
          permissionRequired: 0,
          stale: 0,
          duplicateInstanceDetected: false,
          knowbeeFallbackAvailable: true,
          computerControlAvailable: true,
        },
        selectedItem,
        recoveryFlow: { state: "idle", action: null, reasonCode: null },
        bindingFlow: { state: "viewing", selectedAgentRefs: [], reasonCode: null },
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
        onConfirmRecovery: () => undefined,
        onCancelRecovery: () => undefined,
        onEditBindings: () => undefined,
        onToggleBinding: () => undefined,
        onSaveBindings: () => undefined,
        onCancelBindings: () => undefined,
      }),
    )

    expect(html).toContain("플랫폼 지원")
    expect(html).toContain("프로세스 제어")
    expect(html).toContain("트레이와 창")
    expect(html).toContain("설치 패키지")
    expect(html).not.toMatch(/headless_desktop_absent|headless_profile_no_tray/iu)
    expect(html).not.toMatch(/instanceId|sessionId|command|mqtt|executable|internal-path/iu)
  })
})
