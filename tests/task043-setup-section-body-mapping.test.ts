import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  buildSetupSectionLifecycles,
  SETUP_SECTION_BODY_OWNERS,
  resolveSetupSectionBodyOwner,
} from "../packages/webui/src/lib/setup-section-body-mapping.ts"
import type { SetupDraft } from "../packages/webui/src/contracts/setup.ts"

describe("task043 setup section body mapping", () => {
  it("assigns every workspace section one explicit body owner", () => {
    expect(SETUP_SECTION_BODY_OWNERS.map((item) => item.sectionId)).toEqual([
      "basics",
      "ai",
      "connections",
      "sub_agents",
      "automation",
      "memory",
      "permissions",
      "diagnostics",
    ])
    expect(resolveSetupSectionBodyOwner("basics")).toEqual(expect.objectContaining({
      source: "setup_step",
      setupStepId: "personal",
    }))
    expect(resolveSetupSectionBodyOwner("ai")).toEqual(expect.objectContaining({
      source: "simple_body",
      simpleBodyId: "ai",
    }))
    expect(resolveSetupSectionBodyOwner("connections")).toEqual(expect.objectContaining({
      source: "simple_body",
      simpleBodyId: "channels",
    }))
    expect(resolveSetupSectionBodyOwner("sub_agents")?.source).toBe("sub_agent_view")
  })

  it("maps optional sections without routing to a legacy page", () => {
    expect(resolveSetupSectionBodyOwner("automation")).toEqual(expect.objectContaining({
      source: "simple_body",
      simpleBodyId: "schedules",
    }))
    expect(resolveSetupSectionBodyOwner("memory")).toEqual(expect.objectContaining({
      source: "simple_body",
      simpleBodyId: "memory",
    }))
    expect(resolveSetupSectionBodyOwner("diagnostics")).toEqual(expect.objectContaining({
      source: "simple_body",
      simpleBodyId: "test",
    }))
  })

  it("keeps mapping pure and independent from mode, routes, storage, and environment", () => {
    const source = readFileSync("packages/webui/src/lib/setup-section-body-mapping.ts", "utf8")
    expect(source).not.toMatch(/beginner|advanced|pathname|localStorage|process\.env|fetch\(/)
  })

  it("separates unsaved draft state from runtime-active evidence", () => {
    const persisted = {
      personal: { profileName: "User", displayName: "User", language: "ko", timezone: "Asia/Seoul", workspace: "/work" },
      mainAgent: { name: "노비" },
      aiBackends: [],
      routingProfiles: [],
      channels: {},
      mqtt: { enabled: false },
      remoteAccess: {},
      subAgents: { orchestrationEnabled: false, items: [], runtimeActiveAgentIds: [], lastRuntimeSeenAtByAgentId: {} },
    } as unknown as SetupDraft
    const draft = structuredClone(persisted)
    draft.mainAgent = { name: "마당쇠" }

    const lifecycle = buildSetupSectionLifecycles({
      draft,
      persisted,
      shell: null,
    })

    expect(lifecycle.basics).toBe("unsaved")
    expect(lifecycle.ai).toBe("clean")
    expect(lifecycle.diagnostics).toBe("unavailable")
    expect(lifecycle.memory).toBe("unavailable")
  })
})
