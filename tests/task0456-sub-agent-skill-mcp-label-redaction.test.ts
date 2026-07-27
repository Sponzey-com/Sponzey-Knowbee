import { describe, expect, it } from "vitest"
import type { SetupDraft } from "../packages/webui/src/contracts/setup.ts"
import { buildSubAgentAdvancedSettingsView } from "../packages/webui/src/lib/advanced-sub-agent-settings.ts"

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
          id: "mcp:private-shell",
          name: "",
          transport: "stdio",
          command: "shell",
          argsText: "",
          cwd: "",
          url: "",
          required: false,
          enabled: true,
          status: "ready",
          tools: ["mcp__private_shell__system.exec", "private_tool.read_file"],
        },
      ],
    },
    skills: {
      items: [
        {
          id: "skill:private-research",
          label: "",
          description: "",
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
          skillMcpBindings: {
            enabledSkillIds: ["skill:private-research"],
            enabledMcpServerIds: ["mcp:private-shell"],
            enabledToolNames: ["mcp__private_shell__system.exec"],
            disabledToolNames: [],
          },
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

describe("task0456 sub-agent skill and external feature label redaction", () => {
  it("does not use skill or external feature ids as catalog display labels", () => {
    const view = buildSubAgentAdvancedSettingsView({
      draft: draft(),
      selectedAgentId: "agent:alpha",
      language: "ko",
    })

    const items = view.selectedAgent?.skillMcp.items ?? []
    const skill = items.find((item) => item.id === "skill:private-research")
    const server = items.find((item) => item.id === "mcp:private-shell")

    expect(skill?.label).toBe("작업 능력 1")
    expect(skill?.sourceLabel).toBe("기본 제공")
    expect(server?.label).toBe("외부 기능 연결 1")
    expect(server?.sourceLabel).toBe("로컬 실행 연결")

    expect(items.map((item) => item.label)).not.toContain("skill:private-research")
    expect(items.map((item) => item.label)).not.toContain("mcp:private-shell")
    expect(items.map((item) => item.sourceLabel)).not.toContain("stdio")
  })

  it("formats external tool names and parent labels before display", () => {
    const view = buildSubAgentAdvancedSettingsView({
      draft: draft(),
      selectedAgentId: "agent:alpha",
      language: "ko",
    })

    const items = view.selectedAgent?.skillMcp.items ?? []
    const tool = items.find((item) => item.id === "mcp__private_shell__system.exec")
    const secondTool = items.find((item) => item.id === "private_tool.read_file")

    expect(tool?.label).toBe("System exec")
    expect(tool?.sourceLabel).toBe("외부 기능 연결 1")
    expect(tool?.description).toBe("외부 기능 연결 1의 외부 도구")
    expect(secondTool?.label).toBe("Private tool read file")

    expect(items.map((item) => item.label)).not.toContain("mcp__private_shell__system.exec")
    expect(items.map((item) => item.sourceLabel)).not.toContain("mcp:private-shell")
  })
})
