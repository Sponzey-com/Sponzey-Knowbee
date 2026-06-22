import { createElement } from "../packages/webui/node_modules/react/index.js"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { describe, expect, it } from "vitest"

import { SubAgentAdvancedSettingsPanel } from "../packages/webui/src/components/setup/SubAgentAdvancedSettingsPanel.tsx"
import type { SetupDraft } from "../packages/webui/src/contracts/setup.ts"
import {
  applySubAgentAdvancedIdentityCommand,
  applySubAgentAdvancedModelPolicyCommand,
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
        availableModels: ["gpt-5.4", "gpt-5.4-mini"],
        defaultModel: "gpt-5.4",
        status: "ready",
        summary: "primary",
        tags: ["primary"],
        endpoint: "https://api.openai.com/v1",
      },
      {
        id: "provider:custom",
        label: "Custom Offline",
        kind: "provider",
        providerType: "custom",
        authMode: "api_key",
        credentials: {},
        local: false,
        enabled: false,
        availableModels: ["custom-large"],
        defaultModel: "custom-large",
        status: "disabled",
        summary: "offline",
        tags: [],
      },
    ],
    routingProfiles: [{ id: "default", label: "Default", targets: ["provider:openai"] }],
    mcp: { servers: [] },
    skills: { items: [] },
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
          agentId: "agent:research",
          displayName: "Researcher",
          nickname: "Res",
          role: "자료 조사",
          description: "근거를 찾습니다.",
          status: "enabled",
          createdAt: 1_780_000_000_000,
          updatedAt: 1_780_000_100_000,
          profileVersion: 3,
        },
        {
          agentId: "agent:writer",
          displayName: "Writer",
          nickname: "Writer",
          role: "답변 작성",
          description: "최종 답변을 정리합니다.",
          modelPolicy: {
            mode: "override",
            providerId: "openai",
            modelId: "gpt-5.4-mini",
            fallbackModelId: "gpt-5.4",
          },
          status: "enabled",
          createdAt: 1_780_000_000_000,
          updatedAt: 1_780_000_200_000,
          profileVersion: 2,
        },
        {
          agentId: "agent:old",
          displayName: "Old",
          nickname: "Res",
          role: "보관됨",
          description: "보관된 agent의 별명은 active 충돌로 보지 않습니다.",
          status: "archived",
          createdAt: 1_780_000_000_000,
          updatedAt: 1_780_000_010_000,
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

describe("task006 advanced sub-agent identity and model policy", () => {
  it("renders editable identity/model sections while marking root Knowbee as main agent", () => {
    const view = buildSubAgentAdvancedSettingsView({
      draft: draft(),
      selectedAgentId: "agent:writer",
      language: "ko",
    })
    const html = renderToStaticMarkup(createElement(SubAgentAdvancedSettingsPanel, {
      view,
      saving: false,
      onSelectAgent: () => undefined,
      onUpdateIdentity: () => undefined,
      onUpdateModelPolicy: () => undefined,
      onSave: () => undefined,
      onCancel: () => undefined,
      onRefresh: () => undefined,
    }))
    const text = visibleText(html)

    expect(html).toContain('data-testid="sub-agent-identity-editor"')
    expect(html).toContain('data-testid="sub-agent-model-policy-editor"')
    expect(text).toContain("Knowbee는 메인 agent")
    expect(text).toContain("기본 정보 저장")
    expect(text).toContain("모델 정책 저장")
    expect(text).toContain("overridden")
    expect(text).toContain("publish required")
    expect(text).toContain("internal id: agent:writer")
  })

  it("applies identity commands only after validation and preserves archived nickname policy", () => {
    const base = draft()
    const duplicate = applySubAgentAdvancedIdentityCommand({
      draft: base,
      language: "ko",
      command: {
        kind: "update_identity",
        source: "advanced",
        agentId: "agent:writer",
        displayName: "Writer",
        nickname: "Res",
        role: "답변 작성",
        description: "최종 답변을 정리합니다.",
        attributionLabel: "Res",
      },
    })
    expect(duplicate.ok).toBe(false)
    expect(duplicate.issueCodes).toContain("nickname_duplicate")

    const reserved = applySubAgentAdvancedIdentityCommand({
      draft: base,
      language: "ko",
      command: {
        kind: "update_identity",
        source: "advanced",
        agentId: "agent:writer",
        displayName: "Knowbee",
        nickname: "Knowbee",
        role: "답변 작성",
        description: "최종 답변을 정리합니다.",
        attributionLabel: "Knowbee",
      },
    })
    expect(reserved.ok).toBe(false)
    expect(reserved.issueCodes).toContain("reserved_knowbee_name")

    const archivedDoesNotBlock = applySubAgentAdvancedIdentityCommand({
      draft: base,
      language: "ko",
      now: 1_780_000_300_000,
      command: {
        kind: "update_identity",
        source: "advanced",
        agentId: "agent:research",
        displayName: "Researcher Plus",
        nickname: "Res",
        role: "자료 조사 개선",
        description: "근거를 더 넓게 찾습니다.",
        attributionLabel: "Res",
      },
    })
    expect(archivedDoesNotBlock.ok).toBe(true)
    expect(base.subAgents?.items[0]?.displayName).toBe("Researcher")
    expect(archivedDoesNotBlock.draft?.subAgents?.items[0]).toEqual(expect.objectContaining({
      displayName: "Researcher Plus",
      nickname: "Res",
      profileVersion: 4,
      updatedAt: 1_780_000_300_000,
    }))
  })

  it("projects inherited and overridden model policy without using environment injection", () => {
    const view = buildSubAgentAdvancedSettingsView({
      draft: draft(),
      selectedAgentId: "agent:research",
      language: "ko",
    })
    expect(view.selectedAgent?.modelPolicy.mode).toBe("inherit")
    expect(view.selectedAgent?.modelPolicy.effectiveModelLabel).toBe("OpenAI / gpt-5.4")
    expect(view.globalPolicy.inheritedAgentCount).toBe(1)
    expect(view.globalPolicy.overriddenAgentCount).toBe(1)
    expect(view.selectedAgent?.modelPolicy.options.map((option) => `${option.providerId}:${option.modelId}`)).toContain("openai:gpt-5.4-mini")
  })

  it("validates model override catalog, provider availability, and fallback policy", () => {
    const base = draft()
    const missing = applySubAgentAdvancedModelPolicyCommand({
      draft: base,
      language: "ko",
      command: {
        kind: "update_model_policy",
        source: "advanced",
        agentId: "agent:research",
        mode: "override",
        providerId: "openai",
        modelId: "missing",
      },
    })
    expect(missing.ok).toBe(false)
    expect(missing.issueCodes).toContain("model_id_missing")

    const unavailable = applySubAgentAdvancedModelPolicyCommand({
      draft: base,
      language: "ko",
      command: {
        kind: "update_model_policy",
        source: "advanced",
        agentId: "agent:research",
        mode: "override",
        providerId: "custom",
        modelId: "custom-large",
      },
    })
    expect(unavailable.ok).toBe(false)
    expect(unavailable.issueCodes).toContain("model_provider_unavailable")

    const sameFallback = applySubAgentAdvancedModelPolicyCommand({
      draft: base,
      language: "ko",
      command: {
        kind: "update_model_policy",
        source: "advanced",
        agentId: "agent:research",
        mode: "override",
        providerId: "openai",
        modelId: "gpt-5.4",
        fallbackModelId: "gpt-5.4",
      },
    })
    expect(sameFallback.ok).toBe(false)
    expect(sameFallback.issueCodes).toContain("fallback_model_same_as_primary")

    const valid = applySubAgentAdvancedModelPolicyCommand({
      draft: base,
      language: "ko",
      now: 1_780_000_400_000,
      command: {
        kind: "update_model_policy",
        source: "advanced",
        agentId: "agent:research",
        mode: "override",
        providerId: "openai",
        modelId: "gpt-5.4-mini",
        fallbackModelId: "gpt-5.4",
      },
    })
    expect(valid.ok).toBe(true)
    expect(valid.draft?.subAgents?.items[0]?.modelPolicy).toEqual({
      mode: "override",
      providerId: "openai",
      modelId: "gpt-5.4-mini",
      fallbackModelId: "gpt-5.4",
    })
    expect(valid.draft?.subAgents?.items[0]?.profileVersion).toBe(4)
    expect(base.subAgents?.items[0]?.modelPolicy).toBeUndefined()
  })
})
