import { readFileSync } from "node:fs"
import { createElement } from "../packages/webui/node_modules/react/index.js"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { describe, expect, it, vi } from "vitest"
import type { SetupDraft } from "../packages/webui/src/contracts/setup.ts"
import { SecuritySettingsForm } from "../packages/webui/src/components/setup/SecuritySettingsForm.tsx"
import {
  buildSetupSectionLifecycles,
  resolveSetupSectionBodyOwner,
} from "../packages/webui/src/lib/setup-section-body-mapping.ts"

function draft(): SetupDraft {
  return {
    personal: { profileName: "User", displayName: "User", language: "ko", timezone: "Asia/Seoul", workspace: "/work" },
    mainAgent: { name: "노비" },
    aiBackends: [],
    routingProfiles: [],
    mcp: { servers: [] },
    skills: { items: [] },
    security: { approvalMode: "on-miss", approvalTimeout: 60, approvalTimeoutFallback: "deny", maxDelegationTurns: 3 },
    channels: {} as SetupDraft["channels"],
    mqtt: { enabled: false, host: "", port: 1883, username: "", password: "" },
    remoteAccess: {} as SetupDraft["remoteAccess"],
    subAgents: { orchestrationEnabled: false, items: [], runtimeActiveAgentIds: [], lastRuntimeSeenAtByAgentId: {} },
  }
}

describe("task044 permissions section migration", () => {
  it("owns permissions through the security setup slice", () => {
    expect(resolveSetupSectionBodyOwner("permissions")).toEqual({
      sectionId: "permissions",
      source: "setup_step",
      setupStepId: "security",
      lifecycle: "active",
    })
  })

  it("marks only permissions unsaved when the security slice changes", () => {
    const persisted = draft()
    const local = structuredClone(persisted)
    local.security.approvalTimeout = 90
    const lifecycle = buildSetupSectionLifecycles({ draft: local, persisted, shell: null })

    expect(lifecycle.permissions).toBe("unsaved")
    expect(lifecycle.basics).toBe("clean")
    expect(lifecycle.connections).toBe("clean")
  })

  it("renders delegation limit with approval settings", () => {
    const html = renderToStaticMarkup(createElement(SecuritySettingsForm, {
      value: draft().security,
      onChange: vi.fn(),
    }))

    expect(html).toContain("승인 모드")
    expect(html).toContain("최대 위임 단계")
    expect(html).toContain('value="3"')
  })

  it("composes permissions save and cancel through the existing setup command", () => {
    const source = readFileSync("packages/webui/src/pages/SetupPage.tsx", "utf8")

    expect(source).toContain('selectedSettingsSectionId === "permissions"')
    expect(source).toContain('mergeSetupStepDraft(draft, activeDraft, "security")')
    expect(source).toContain('revertSetupStepDraft(activeDraft, draft, "security")')
    expect(source).toContain("<SecuritySettingsForm")
  })
})
