import { describe, expect, it } from "vitest"
import type { SetupDraft } from "../packages/webui/src/contracts/setup.ts"
import { buildSubAgentAdvancedSettingsView } from "../packages/webui/src/lib/advanced-sub-agent-settings.ts"

function draft(modelPolicy?: SetupDraft["subAgents"]["items"][number]["modelPolicy"]): SetupDraft {
  return {
    personal: {
      profileName: "user",
      displayName: "User",
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
        availableModels: ["gpt-5.4", "gpt-5.4-mini"],
        defaultModel: "gpt-5.4",
        status: "ready",
        summary: "primary",
        tags: [],
        endpoint: "https://api.openai.com/v1",
      },
    ],
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
          agentId: "agent:alpha",
          agentName: "알파",
          displayName: "알파",
          nickname: "알파",
          role: "테스트",
          description: "테스트",
          ...(modelPolicy ? { modelPolicy } : {}),
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

describe("task0457 sub-agent model summary redaction", () => {
  it("summarizes inherited default model without exposing the model id", () => {
    const view = buildSubAgentAdvancedSettingsView({
      draft: draft(),
      selectedAgentId: "agent:alpha",
      language: "ko",
    })

    expect(view.globalPolicy.defaultModelLabel).toBe("기본 AI 모델 설정됨")
    expect(view.selectedAgent?.modelPolicy.inheritedModelLabel).toBe("기본 AI 모델 설정됨")
    expect(view.selectedAgent?.modelPolicy.effectiveModelLabel).toBe("기본 AI 모델 설정됨")
    expect(view.globalPolicy.defaultModelLabel).not.toContain("gpt-5.4")
    expect(view.selectedAgent?.modelPolicy.effectiveModelLabel).not.toContain("gpt-5.4")
  })

  it("summarizes override model selection without exposing provider/model ids in the summary", () => {
    const view = buildSubAgentAdvancedSettingsView({
      draft: draft({
        mode: "override",
        providerId: "openai",
        modelId: "gpt-5.4-mini",
        fallbackModelId: "gpt-5.4",
      }),
      selectedAgentId: "agent:alpha",
      language: "ko",
    })

    expect(view.selectedAgent?.modelPolicy.providerId).toBe("openai")
    expect(view.selectedAgent?.modelPolicy.modelId).toBe("gpt-5.4-mini")
    expect(view.selectedAgent?.modelPolicy.effectiveModelLabel).toBe("개별 AI 모델 설정됨")
    expect(view.selectedAgent?.modelPolicy.effectiveModelLabel).not.toContain("openai")
    expect(view.selectedAgent?.modelPolicy.effectiveModelLabel).not.toContain("gpt-5.4")
  })
})
