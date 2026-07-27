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
    mcp: { servers: [] },
    skills: { items: [] },
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
          agentId: "agent:child",
          parentAgentId: "agent:missing-parent",
          agentName: "하위 담당",
          displayName: "Legacy Child",
          nickname: "Legacy Child",
          role: "하위 작업",
          description: "하위 작업",
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

describe("task0459 sub-agent parent label redaction", () => {
  it("does not expose missing parent agent ids as user-facing labels", () => {
    const view = buildSubAgentAdvancedSettingsView({
      draft: draft(),
      selectedAgentId: "agent:child",
      language: "ko",
    })

    expect(view.selectedAgent?.parentLabel).toBe("알 수 없는 서브 에이전트")
    expect(view.selectedAgent?.parentLabel).not.toContain("agent:missing-parent")
    expect(view.selectedAgent?.sections.find((section) => section.id === "identity")?.items).toContain("알 수 없는 서브 에이전트")
  })
})
