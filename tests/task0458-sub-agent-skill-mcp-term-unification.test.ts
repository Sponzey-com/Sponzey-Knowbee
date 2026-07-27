import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import type { SetupDraft } from "../packages/webui/src/contracts/setup.ts"
import { buildSubAgentAdvancedSettingsView } from "../packages/webui/src/lib/advanced-sub-agent-settings.ts"

const source = readFileSync(
  join(process.cwd(), "packages", "webui", "src", "lib", "advanced-sub-agent-settings.ts"),
  "utf-8",
)

function draft(): SetupDraft {
  return {
    personal: {
      profileName: "user",
      displayName: "User",
      language: "ko",
      timezone: "Asia/Seoul",
      workspace: "/tmp",
    },
    aiBackends: [],
    routingProfiles: [],
    mcp: {
      servers: [
        {
          id: "mcp:browser",
          name: "Browser",
          transport: "stdio",
          command: "browser",
          argsText: "",
          cwd: "",
          url: "",
          required: false,
          enabled: true,
          status: "ready",
          tools: ["search"],
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
      ],
    },
    security: {
      approvalMode: "on-miss",
      approvalTimeout: 60,
      approvalTimeoutFallback: "deny",
      maxDelegationTurns: 5,
    },
    channels: {} as SetupDraft["channels"],
    mqtt: { enabled: false, host: "", port: 1883, username: "", password: "" },
    remoteAccess: { authEnabled: false, authToken: "", host: "", port: 18888 },
    subAgents: {
      orchestrationEnabled: true,
      items: [
        {
          agentId: "agent:alpha",
          agentName: "알파",
          displayName: "알파",
          nickname: "알파",
          role: "테스트",
          description: "테스트",
          status: "enabled",
          createdAt: 1,
          updatedAt: 1,
          profileVersion: 1,
        },
      ],
      runtimeActiveAgentIds: [],
      lastRuntimeSeenAtByAgentId: {},
    },
  }
}

describe("task0458 sub-agent skill/MCP term unification", () => {
  it("uses work ability and external feature wording in sub-agent setting summaries", () => {
    const view = buildSubAgentAdvancedSettingsView({
      draft: draft(),
      selectedAgentId: "agent:alpha",
      language: "ko",
    })

    expect(view.globalPolicy.commonSkillMcpLabel).toBe("작업 능력 1개 / 외부 기능 1개")
    expect(view.selectedAgent?.skillMcp.commonCatalogLabel).toBe("공통 목록 작업 능력 1개 / 외부 기능 1개")
    expect(view.selectedAgent?.sections.find((section) => section.id === "skill_mcp")?.title).toBe("작업 능력/외부 기능")
  })

  it("does not keep old Skill/MCP user-facing strings in the view model source", () => {
    expect(source).not.toContain('"기능/MCP"')
    expect(source).not.toContain('"Skill/MCP"')
    expect(source).not.toContain("Skill/MCP item")
    expect(source).not.toContain("Skill/MCP bindings saved")
    expect(source).not.toContain("네트워크/MCP 접근")
    expect(source).not.toContain("상위 MCP 서버")

    expect(source).toContain("작업 능력/외부 기능")
    expect(source).toContain("네트워크/외부 기능 접근")
    expect(source).toContain("상위 외부 기능 연결")
  })
})
