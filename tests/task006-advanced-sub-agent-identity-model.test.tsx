import { readFileSync } from "node:fs"
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
          agentName: "Res",
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
          agentName: "작성자",
          displayName: "Writer Legacy Display",
          nickname: "Writer Legacy Nick",
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
          agentName: "Res",
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
  return markup
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

describe("task006 advanced sub-agent identity and model policy", () => {
  it("renders editable identity/model sections while marking the root as the main agent", () => {
    const view = buildSubAgentAdvancedSettingsView({
      draft: draft(),
      selectedAgentId: "agent:writer",
      language: "ko",
    })
    const html = renderToStaticMarkup(
      createElement(SubAgentAdvancedSettingsPanel, {
        view,
        saving: false,
        onSelectAgent: () => undefined,
        onUpdateIdentity: () => undefined,
        onUpdateModelPolicy: () => undefined,
        onSave: () => undefined,
        onCancel: () => undefined,
        onRefresh: () => undefined,
      }),
    )
    const text = visibleText(html)

    expect(html).toContain('data-testid="sub-agent-identity-editor"')
    expect(html).toContain('data-testid="sub-agent-model-policy-editor"')
    expect(text).toContain("메인 에이전트는 이 화면에서 편집하지 않습니다")
    expect(text).toContain("작성자")
    expect(text).not.toContain("Writer Legacy")
    expect(text).toContain("에이전트 이름")
    expect(html).not.toContain(">별명<")
    expect(text).toContain("기본 정보 저장")
    expect(text).toContain("모델 정책 저장")
    expect(text).toContain("상위 에이전트")
    expect(text).toContain("개별 설정")
    expect(text).toContain("활성화 필요")
    expect(text).toContain("실행 반영")
    expect(text).toContain("제공자")
    expect(text).not.toContain("internal id")
    expect(text).not.toContain("agent:writer")
    expect(text).not.toContain("Agent detail")
    expect(text).not.toContain("parent ")
    expect(text).not.toContain("warn ")
    expect(text).not.toContain("저장 후 runtime 반영 필요")
    expect(text).not.toContain("provider 선택")
    expect(text).not.toContain("Fallback model")
    expect(text).not.toContain("overridden")
    expect(text).not.toContain("publish required")
    expect(text).not.toContain("allowed ")
    expect(text).not.toContain("denied")
    expect(text).not.toContain("approval required")
    expect(text).not.toContain("direct child")
    expect(text).not.toContain("can delegate")
    expect(text).not.toContain("trace event")
    expect(text).not.toContain("runtime trace")
    expect(text).not.toContain("final delivery")
    expect(text).not.toContain("runs ")
    expect(text).not.toContain("event ")
    expect(text).not.toContain("log product")
    expect(text).not.toContain("approval moderate")
    expect(text).not.toContain("fallback 없음")
    expect(text).not.toContain("부모-자식")
  })

  it("uses the configured main agent name for root labels and reserved-name validation", () => {
    const configured = {
      ...draft(),
      mainAgent: { name: "마당쇠" },
    }
    const view = buildSubAgentAdvancedSettingsView({
      draft: configured,
      selectedAgentId: "agent:writer",
      language: "ko",
    })
    const html = renderToStaticMarkup(
      createElement(SubAgentAdvancedSettingsPanel, {
        view,
        saving: false,
        onSelectAgent: () => undefined,
        onUpdateIdentity: () => undefined,
        onUpdateModelPolicy: () => undefined,
        onSave: () => undefined,
        onCancel: () => undefined,
        onRefresh: () => undefined,
      }),
    )
    const reserved = applySubAgentAdvancedIdentityCommand({
      draft: configured,
      language: "ko",
      command: {
        kind: "update_identity",
        source: "advanced",
        agentId: "agent:writer",
        agentName: "마당쇠",
        role: "답변 작성",
        description: "최종 답변을 정리합니다.",
        attributionLabel: "마당쇠",
      },
    })

    expect(view.globalPolicy.rootAgentLabel).toBe("마당쇠")
    expect(view.selectedAgent?.parentLabel).toBe("마당쇠")
    expect(visibleText(html)).toContain("마당쇠는 이 화면에서 편집하지 않습니다")
    expect(reserved.ok).toBe(false)
    expect(reserved.issueCodes).toContain("reserved_knowbee_name")
    expect(reserved.message).toContain("메인 에이전트")
  })

  it("keeps the advanced identity editor to a single agent name input", () => {
    const source = readFileSync(
      new URL(
        "../packages/webui/src/components/setup/SubAgentAdvancedSettingsPanel.tsx",
        import.meta.url,
      ),
      "utf-8",
    )
    const viewSource = readFileSync(
      new URL("../packages/webui/src/lib/advanced-sub-agent-settings.ts", import.meta.url),
      "utf-8",
    )

    expect(source).toContain('label="에이전트 이름"')
    expect(source).not.toContain('label="이름"')
    expect(source).toContain("agentName: agentName")
    expect(source).not.toContain("displayName: agentName")
    expect(source).not.toContain("nickname: agentName")
    expect(source).not.toContain("setDescription")
    expect(source).not.toContain("<textarea")
    expect(source).not.toContain("fieldErrors.description")
    expect(source).not.toContain("fieldErrors.nickname")
    expect(source).not.toContain("fieldErrors.displayName")
    expect(source).not.toContain("row.nickname")
    expect(source).not.toContain("detail.nickname")
    expect(source).not.toContain("child.nickname")
    expect(source).not.toContain("{row.displayName}")
    expect(source).not.toContain("{detail.nickname}")
    expect(source).not.toContain("{child.displayName} · {child.role}")
    expect(viewSource).not.toContain("row.displayName, row.nickname")
    expect(viewSource).not.toContain(["internal", "DebugId"].join(""))
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
        agentName: "Res",
        role: "답변 작성",
        description: "최종 답변을 정리합니다.",
        attributionLabel: "Res",
      },
    })
    expect(duplicate.ok).toBe(false)
    expect(duplicate.issueCodes).toContain("agent_name_duplicate")
    expect(duplicate.message).toContain("이름")
    expect(duplicate.message).not.toMatch(/별명|nickname|agent:/)

    const reserved = applySubAgentAdvancedIdentityCommand({
      draft: base,
      language: "ko",
      command: {
        kind: "update_identity",
        source: "advanced",
        agentId: "agent:writer",
        agentName: "Knowbee",
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
        agentName: "Res",
        role: "자료 조사 개선",
        description: "근거를 더 넓게 찾습니다.",
        attributionLabel: "Res",
      },
    })
    expect(archivedDoesNotBlock.ok).toBe(true)
    expect(base.subAgents?.items[0]?.displayName).toBe("Researcher")
    const updatedResearchAgent = archivedDoesNotBlock.draft?.subAgents?.items[0]
    expect(updatedResearchAgent).toEqual(
      expect.objectContaining({
        agentName: "Res",
        description: "근거를 찾습니다.",
        profileVersion: 4,
        updatedAt: 1_780_000_300_000,
      }),
    )
    expect(updatedResearchAgent).not.toHaveProperty("displayName")
    expect(updatedResearchAgent).not.toHaveProperty("nickname")
  })

  it("ignores legacy displayName and nickname for advanced identity warnings and saved name copies", () => {
    const duplicateLegacyNickname = {
      ...draft(),
      subAgents: {
        ...draft().subAgents!,
        items: draft().subAgents!.items.map((item) =>
          item.agentId === "agent:writer"
            ? {
                ...item,
                agentName: "작성자",
                displayName: "Legacy Display",
                nickname: "Res",
              }
            : item,
        ),
      },
    }
    const rootLegacyNickname = {
      ...draft(),
      mainAgent: { name: "마당쇠" },
      subAgents: {
        ...draft().subAgents!,
        items: draft().subAgents!.items.map((item) =>
          item.agentId === "agent:writer"
            ? {
                ...item,
                agentName: "작성자",
                displayName: "Legacy Display",
                nickname: "마당쇠",
              }
            : item,
        ),
      },
    }

    const duplicateWarningView = buildSubAgentAdvancedSettingsView({
      draft: duplicateLegacyNickname,
      selectedAgentId: "agent:writer",
      language: "ko",
    })
    const rootWarningView = buildSubAgentAdvancedSettingsView({
      draft: rootLegacyNickname,
      selectedAgentId: "agent:writer",
      language: "ko",
    })
    const saved = applySubAgentAdvancedIdentityCommand({
      draft: draft(),
      language: "ko",
      now: 1_780_000_500_000,
      command: {
        kind: "update_identity",
        source: "advanced",
        agentId: "agent:writer",
        agentName: "검토자",
        role: "답변 검토",
        description: "최종 답변을 검토합니다.",
        attributionLabel: "검토자",
      },
    })

    expect(duplicateWarningView.selectedAgent?.identity.warnings.join(" ")).not.toContain("중복")
    expect(rootWarningView.selectedAgent?.identity.warnings.join(" ")).not.toContain(
      "메인 에이전트 이름",
    )
    expect(saved.ok).toBe(true)
    const updatedWriterAgent = saved.draft?.subAgents?.items.find((item) => item.agentId === "agent:writer")
    expect(updatedWriterAgent).toEqual(
      expect.objectContaining({
        agentName: "검토자",
        role: "답변 검토",
        description: "최종 답변을 정리합니다.",
        updatedAt: 1_780_000_500_000,
      }),
    )
    expect(updatedWriterAgent).not.toHaveProperty("displayName")
    expect(updatedWriterAgent).not.toHaveProperty("nickname")
  })

  it("projects inherited and overridden model policy without using environment injection", () => {
    const view = buildSubAgentAdvancedSettingsView({
      draft: draft(),
      selectedAgentId: "agent:research",
      language: "ko",
    })
    expect(view.selectedAgent?.modelPolicy.mode).toBe("inherit")
    expect(view.selectedAgent?.modelPolicy.effectiveModelLabel).toBe("기본 AI 모델 설정됨")
    expect(view.globalPolicy.inheritedAgentCount).toBe(1)
    expect(view.globalPolicy.overriddenAgentCount).toBe(1)
    expect(
      view.selectedAgent?.modelPolicy.options.map(
        (option) => `${option.providerId}:${option.modelId}`,
      ),
    ).toContain("openai:gpt-5.4-mini")
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
