import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import type { SetupDraft } from "../packages/webui/src/contracts/setup.ts"
import {
  buildSingleSettingsWorkspace,
  selectSingleSettingsSection,
} from "../packages/webui/src/lib/unified-settings-workspace.ts"
import { buildSingleSettingsWorkspaceForSetup } from "../packages/webui/src/lib/unified-settings-workspace-view.ts"

const lifecycleBySection = {
  basics: "active",
  ai: "unsaved",
  connections: "saved_restart_required",
  sub_agents: "clean",
  automation: "unavailable",
  memory: "active",
  permissions: "active",
  diagnostics: "active",
} as const

describe("task040 single settings workspace", () => {
  it("projects one ordered user workspace and recovers unknown selection", () => {
    const view = buildSingleSettingsWorkspace({
      locale: "ko",
      adminEnabled: false,
      selectedSectionId: "unknown",
      lifecycleBySection,
    })

    expect(view.selectedSectionId).toBe("basics")
    expect(view.requiredSections.map((section) => section.id)).toEqual(["basics", "ai"])
    expect(view.optionalSections.map((section) => section.id)).toEqual([
      "connections",
      "sub_agents",
      "automation",
      "memory",
      "permissions",
    ])
    expect(view.sections.some((section) => section.id === "diagnostics")).toBe(false)
    expect(view.sections.find((section) => section.id === "ai")).toEqual(expect.objectContaining({
      lifecycle: "unsaved",
      canSave: true,
      active: false,
    }))
    expect(view.sections.find((section) => section.id === "connections")).toEqual(expect.objectContaining({
      lifecycle: "saved_restart_required",
      canSave: false,
      active: false,
    }))
  })

  it("keeps diagnostics read-only and visible only with explicit admin visibility", () => {
    const view = buildSingleSettingsWorkspace({
      locale: "en",
      adminEnabled: true,
      selectedSectionId: "diagnostics",
      lifecycleBySection,
    })
    const diagnostics = selectSingleSettingsSection(view, "diagnostics")

    expect(diagnostics).toEqual(expect.objectContaining({
      id: "diagnostics",
      lifecycle: "active",
      canSave: false,
      saveCommand: null,
    }))
    expect(diagnostics?.stateLabel).toBe("Active")
  })

  it("does not treat saved or unavailable state as active", () => {
    const view = buildSingleSettingsWorkspace({
      locale: "en",
      adminEnabled: false,
      lifecycleBySection: {
        ...lifecycleBySection,
        ai: "saved_restart_required",
        memory: "unavailable",
      },
    })

    expect(view.sections.find((section) => section.id === "ai")?.active).toBe(false)
    expect(view.sections.find((section) => section.id === "memory")).toEqual(expect.objectContaining({
      lifecycle: "unavailable",
      active: false,
      canSave: false,
    }))
  })

  it("reuses the existing sub-agent detail view and degrades diagnostics without runtime shell", () => {
    const draft = {
      subAgents: {
        orchestrationEnabled: false,
        items: [],
        runtimeActiveAgentIds: [],
        lastRuntimeSeenAtByAgentId: {},
      },
    } as unknown as SetupDraft

    const view = buildSingleSettingsWorkspaceForSetup({
      draft,
      shell: null,
      language: "ko",
      adminEnabled: true,
      lifecycleBySection,
    })

    expect(view.workspace.sections.find((section) => section.id === "diagnostics")?.lifecycle).toBe("unavailable")
    expect(view.subAgents.title).toBe("서브 에이전트 설정")
    expect(view.subAgents.summary.mode).toBe("direct_main_agent")
    expect(JSON.stringify(view)).not.toContain("agent:knowbee")
  })

  it("keeps projection and adapter free of hidden runtime access", () => {
    const projection = readFileSync("packages/webui/src/lib/unified-settings-workspace.ts", "utf8")
    const adapter = readFileSync("packages/webui/src/lib/unified-settings-workspace-view.ts", "utf8")
    const combined = `${projection}\n${adapter}`

    expect(combined).not.toMatch(/process\.env|localStorage|sessionStorage|document\.cookie/)
    expect(combined).not.toMatch(/fetch\(|readFile|writeFile/)
    expect(combined).not.toContain("window.location")
    expect(combined).not.toContain("pathname")
  })
})
