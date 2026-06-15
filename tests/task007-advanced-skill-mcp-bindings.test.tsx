import { createElement } from "../packages/webui/node_modules/react/index.js"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { describe, expect, it } from "vitest"

import { SubAgentAdvancedSettingsPanel } from "../packages/webui/src/components/setup/SubAgentAdvancedSettingsPanel.tsx"
import type { SetupDraft } from "../packages/webui/src/contracts/setup.ts"
import {
  applySubAgentAdvancedSkillMcpBindingsCommand,
  buildSubAgentAdvancedSettingsView,
} from "../packages/webui/src/lib/advanced-sub-agent-settings.ts"

function draft(): SetupDraft {
  return {
    personal: {
      profileName: "dongwoo",
      displayName: "Dongwoo",
      language: "ko",
      timezone: "Asia/Seoul",
      workspace: "/tmp",
    },
    aiBackends: [
      {
        id: "provider:openai",
        label: "OpenAI",
        kind: "provider",
        providerType: "openai",
        authMode: "api_key",
        credentials: { apiKey: "sk-test" },
        local: false,
        enabled: true,
        availableModels: ["gpt-5.4"],
        defaultModel: "gpt-5.4",
        status: "ready",
        summary: "primary",
        tags: ["primary"],
        endpoint: "https://api.openai.com/v1",
      },
    ],
    routingProfiles: [{ id: "default", label: "Default", targets: ["provider:openai"] }],
    mcp: {
      servers: [
        {
          id: "mcp:browser",
          name: "Browser MCP",
          transport: "stdio",
          command: "browser",
          argsText: "",
          cwd: "",
          url: "",
          required: false,
          enabled: true,
          status: "ready",
          tools: ["mcp__browser__search", "mcp__browser__open"],
        },
        {
          id: "mcp:shell",
          name: "Shell MCP",
          transport: "stdio",
          command: "shell",
          argsText: "",
          cwd: "",
          url: "",
          required: true,
          enabled: false,
          status: "error",
          reason: "token=raw-secret-value sk-raw-secret-never-show",
          tools: ["system.exec"],
        },
      ],
    },
    skills: {
      items: [
        {
          id: "skill:research",
          label: "Research",
          description: "Find facts",
          source: "builtin",
          path: "",
          enabled: true,
          required: false,
          status: "ready",
        },
        {
          id: "skill:writing",
          label: "Writing",
          description: "Draft final answers",
          source: "builtin",
          path: "",
          enabled: true,
          required: false,
          status: "ready",
        },
        {
          id: "skill:unsafe",
          label: "Unsafe",
          description: "Unavailable local skill",
          source: "local",
          path: "/tmp/unsafe",
          enabled: false,
          required: false,
          status: "error",
          reason: "apiKey=sk-local-secret-never-show",
        },
      ],
    },
    security: {
      approvalMode: "on-miss",
      approvalTimeout: 60,
      approvalTimeoutFallback: "deny",
      maxDelegationTurns: 5,
    },
    channels: {} as SetupDraft["channels"],
    mqtt: { enabled: false, host: "0.0.0.0", port: 1883, username: "", password: "" },
    remoteAccess: { authEnabled: false, authToken: "", host: "127.0.0.1", port: 18888 },
    subAgents: {
      orchestrationEnabled: true,
      items: [
        {
          agentId: "agent:alpha",
          displayName: "Alpha",
          nickname: "Alpha",
          role: "자료 조사",
          description: "조사 담당",
          skillMcpBindings: {
            enabledSkillIds: ["skill:research"],
            enabledMcpServerIds: ["mcp:browser"],
            enabledToolNames: ["mcp__browser__search"],
            disabledToolNames: ["mcp__browser__open"],
            recommendedSkillIds: ["skill:writing"],
            recommendedMcpServerIds: ["mcp:shell"],
            connectionStateByCatalogId: {
              "mcp:browser": "connected",
              "mcp:shell": "degraded",
            },
          },
          status: "enabled",
          createdAt: 1_780_000_000_000,
          updatedAt: 1_780_000_100_000,
          profileVersion: 2,
        },
        {
          agentId: "agent:beta",
          displayName: "Beta",
          nickname: "Beta",
          role: "작성",
          description: "작성 담당",
          skillMcpBindings: {
            enabledSkillIds: [],
            enabledMcpServerIds: [],
            enabledToolNames: [],
            disabledToolNames: [],
          },
          status: "enabled",
          createdAt: 1_780_000_000_000,
          updatedAt: 1_780_000_100_000,
          profileVersion: 2,
        },
        {
          agentId: "agent:old",
          displayName: "Old",
          nickname: "Old",
          role: "보관됨",
          description: "보관된 agent",
          skillMcpBindings: {
            enabledSkillIds: [],
            enabledMcpServerIds: [],
            enabledToolNames: [],
            disabledToolNames: [],
          },
          status: "archived",
          createdAt: 1_780_000_000_000,
          updatedAt: 1_780_000_100_000,
          profileVersion: 1,
        },
      ],
      runtimeActiveAgentIds: [],
      lastRuntimeSeenAtByAgentId: {},
    },
  }
}

function visibleText(markup: string): string {
  return markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

describe("task007 advanced Skill/MCP catalog and bindings", () => {
  it("projects common catalog separately from selected agent binding state", () => {
    const view = buildSubAgentAdvancedSettingsView({
      draft: draft(),
      selectedAgentId: "agent:alpha",
      language: "ko",
    })

    expect(view.globalPolicy.commonSkillMcpLabel).toBe("Skill 2개 / MCP 1개")
    expect(view.selectedAgent?.skillMcp.commonCatalogLabel).toBe("공통 catalog Skill 3개 / MCP 2개")
    expect(view.selectedAgent?.skillMcp.enabledSkillIds).toEqual(["skill:research"])
    expect(view.selectedAgent?.skillMcp.enabledMcpServerIds).toEqual(["mcp:browser"])
    expect(view.selectedAgent?.skillMcp.recommendedSkillIds).toEqual(["skill:writing"])
    expect(view.selectedAgent?.skillMcp.items.find((item) => item.id === "skill:writing")).toEqual(expect.objectContaining({
      enabledForAgent: false,
      recommendedForAgent: true,
    }))
    expect(view.selectedAgent?.skillMcp.items.find((item) => item.id === "mcp:browser")).toEqual(expect.objectContaining({
      enabledForAgent: true,
      connectionState: "connected",
    }))
  })

  it("applies binding commands to one agent without changing another agent or common catalog", () => {
    const base = draft()
    const result = applySubAgentAdvancedSkillMcpBindingsCommand({
      draft: base,
      language: "ko",
      now: 1_780_000_300_000,
      command: {
        kind: "update_skill_mcp_bindings",
        source: "advanced",
        agentId: "agent:alpha",
        enabledSkillIds: ["skill:research", "skill:writing"],
        enabledMcpServerIds: ["mcp:browser"],
        enabledToolNames: ["mcp__browser__search", "mcp__browser__open"],
        disabledToolNames: [],
      },
    })

    expect(result.ok).toBe(true)
    expect(base.subAgents?.items[0]?.skillMcpBindings?.enabledSkillIds).toEqual(["skill:research"])
    expect(result.draft?.skills.items.map((item) => item.id)).toEqual(["skill:research", "skill:writing", "skill:unsafe"])
    expect(result.draft?.subAgents?.items[0]?.skillMcpBindings).toEqual(expect.objectContaining({
      enabledSkillIds: ["skill:research", "skill:writing"],
      enabledMcpServerIds: ["mcp:browser"],
      disabledToolNames: [],
    }))
    expect(result.draft?.subAgents?.items[0]?.profileVersion).toBe(3)
    expect(result.draft?.subAgents?.items[1]?.skillMcpBindings?.enabledSkillIds).toEqual([])
  })

  it("blocks missing, unavailable, and archived binding updates", () => {
    const base = draft()
    const missing = applySubAgentAdvancedSkillMcpBindingsCommand({
      draft: base,
      language: "ko",
      command: {
        kind: "update_skill_mcp_bindings",
        source: "advanced",
        agentId: "agent:alpha",
        enabledSkillIds: ["skill:missing"],
        enabledMcpServerIds: [],
        enabledToolNames: [],
        disabledToolNames: [],
      },
    })
    expect(missing.ok).toBe(false)
    expect(missing.issueCodes).toContain("catalog_id_missing")

    const unavailable = applySubAgentAdvancedSkillMcpBindingsCommand({
      draft: base,
      language: "ko",
      command: {
        kind: "update_skill_mcp_bindings",
        source: "advanced",
        agentId: "agent:alpha",
        enabledSkillIds: ["skill:unsafe"],
        enabledMcpServerIds: [],
        enabledToolNames: [],
        disabledToolNames: [],
      },
    })
    expect(unavailable.ok).toBe(false)
    expect(unavailable.issueCodes).toContain("catalog_item_unavailable")

    const archived = applySubAgentAdvancedSkillMcpBindingsCommand({
      draft: base,
      language: "ko",
      command: {
        kind: "update_skill_mcp_bindings",
        source: "advanced",
        agentId: "agent:old",
        enabledSkillIds: ["skill:research"],
        enabledMcpServerIds: [],
        enabledToolNames: [],
        disabledToolNames: [],
      },
    })
    expect(archived.ok).toBe(false)
    expect(archived.issueCodes).toContain("archived_agent_not_editable")
  })

  it("renders catalog summary, binding toggles, connection state, and redacted diagnostics", () => {
    const view = buildSubAgentAdvancedSettingsView({
      draft: draft(),
      selectedAgentId: "agent:alpha",
      language: "ko",
    })
    const html = renderToStaticMarkup(createElement(SubAgentAdvancedSettingsPanel, {
      view,
      saving: false,
      onSelectAgent: () => undefined,
      onUpdateIdentity: () => undefined,
      onUpdateModelPolicy: () => undefined,
      onUpdateSkillMcpBindings: () => undefined,
      onSave: () => undefined,
      onCancel: () => undefined,
      onRefresh: () => undefined,
    }))
    const text = visibleText(html)

    expect(html).toContain('data-testid="sub-agent-skill-mcp-editor"')
    expect(text).toContain("Skill/MCP binding")
    expect(text).toContain("recommended draft")
    expect(text).toContain("Browser MCP")
    expect(text).toContain("connected")
    expect(text).toContain("[secret redacted]")
    expect(text).not.toContain("sk-raw-secret-never-show")
    expect(text).not.toContain("raw-secret-value")
  })
})
