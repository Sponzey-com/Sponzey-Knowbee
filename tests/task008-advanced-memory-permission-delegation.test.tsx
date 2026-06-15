import { createElement } from "../packages/webui/node_modules/react/index.js"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { describe, expect, it } from "vitest"

import { SubAgentAdvancedSettingsPanel } from "../packages/webui/src/components/setup/SubAgentAdvancedSettingsPanel.tsx"
import type { SetupDraft } from "../packages/webui/src/contracts/setup.ts"
import {
  applySubAgentAdvancedCapabilityPolicyCommand,
  applySubAgentAdvancedDelegationPolicyCommand,
  applySubAgentAdvancedMemoryPolicyCommand,
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
    mqtt: { enabled: false, host: "0.0.0.0", port: 1883, username: "", password: "" },
    remoteAccess: { authEnabled: false, authToken: "", host: "127.0.0.1", port: 18888 },
    subAgents: {
      orchestrationEnabled: true,
      items: [
        {
          agentId: "agent:lead",
          displayName: "Lead",
          nickname: "Lead",
          role: "취합 담당",
          description: "하위 결과를 검토하고 취합합니다.",
          delegationPolicy: {
            canDelegate: true,
            directChildOnly: true,
            allowedChildAgentIds: ["agent:research"],
            resultReviewRequired: true,
            aggregationMode: "parent_synthesis",
            redelegationAllowed: true,
            escalationPolicy: "return_to_parent",
            maxParallelSessions: 2,
          },
          status: "enabled",
          createdAt: 1_780_000_000_000,
          updatedAt: 1_780_000_100_000,
          profileVersion: 2,
        },
        {
          agentId: "agent:research",
          parentAgentId: "agent:lead",
          displayName: "Research",
          nickname: "Research",
          role: "조사 담당",
          description: "자료를 찾습니다.",
          memoryPolicy: {
            owner: { ownerType: "sub_agent", ownerId: "agent:research" },
            visibility: "private",
            readScopes: [{ ownerType: "sub_agent", ownerId: "agent:research" }],
            writeScope: { ownerType: "sub_agent", ownerId: "agent:research" },
            retentionPolicy: "short_term",
            writebackReviewRequired: true,
            rawWindowSize: 24_000,
            compactThreshold: 32_000,
            capsuleMode: "session_compaction",
            archiveReferenceMode: "summary_reference",
            handoffCapsuleAllowed: true,
            lastCompactedAt: 1_780_000_050_000,
            capsuleCount: 3,
          },
          capabilityPolicy: {
            permissionProfile: {
              profileId: "profile:research",
              riskCeiling: "moderate",
              approvalRequiredFrom: "moderate",
              allowExternalNetwork: true,
              allowFilesystemWrite: false,
              allowShellExecution: false,
              allowScreenControl: false,
              allowedPaths: [],
            },
            allowedCapabilityIds: ["capability:network_mcp"],
            deniedCapabilityIds: ["capability:shell", "capability:screen_control"],
            approvalRequiredCapabilityIds: ["capability:file_write"],
            osSensitiveCapabilityIds: ["capability:screen_capture"],
          },
          status: "enabled",
          createdAt: 1_780_000_000_000,
          updatedAt: 1_780_000_100_000,
          profileVersion: 4,
        },
        {
          agentId: "agent:writer",
          displayName: "Writer",
          nickname: "Writer",
          role: "작성 담당",
          description: "결과를 작성합니다.",
          status: "disabled",
          createdAt: 1_780_000_000_000,
          updatedAt: 1_780_000_100_000,
          profileVersion: 1,
        },
      ],
      runtimeActiveAgentIds: ["agent:lead", "agent:research"],
      lastRuntimeSeenAtByAgentId: {
        "agent:lead": 1_780_000_120_000,
        "agent:research": 1_780_000_120_000,
      },
    },
  }
}

function visibleText(markup: string): string {
  return markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

describe("task008 advanced memory, permission, and delegation policy", () => {
  it("projects memory isolation, permission states, and direct-child delegation without raw dumps", () => {
    const view = buildSubAgentAdvancedSettingsView({
      draft: draft(),
      selectedAgentId: "agent:research",
      language: "ko",
    })

    expect(view.selectedAgent?.memory.ownerLabel).toBe("Research")
    expect(view.selectedAgent?.memory.isolationState).toBe("handoff_allowed")
    expect(view.selectedAgent?.memory.compactThreshold).toBe(32_000)
    expect(view.selectedAgent?.permission.items.map((item) => `${item.id}:${item.state}`)).toContain("capability:file_write:approval_required")
    expect(view.selectedAgent?.delegation.directChildOnly).toBe(true)
    expect(view.selectedAgent?.delegation.resultReviewRequired).toBe(true)

    const html = renderToStaticMarkup(createElement(SubAgentAdvancedSettingsPanel, {
      view,
      saving: false,
      onSelectAgent: () => undefined,
      onUpdateIdentity: () => undefined,
      onUpdateModelPolicy: () => undefined,
      onUpdateSkillMcpBindings: () => undefined,
      onUpdateMemoryPolicy: () => undefined,
      onUpdateCapabilityPolicy: () => undefined,
      onUpdateDelegationPolicy: () => undefined,
      onSave: () => undefined,
      onCancel: () => undefined,
      onRefresh: () => undefined,
    }))
    const text = visibleText(html)

    expect(html).toContain('data-testid="sub-agent-memory-policy-editor"')
    expect(html).toContain('data-testid="sub-agent-permission-policy-editor"')
    expect(html).toContain('data-testid="sub-agent-delegation-policy-editor"')
    expect(text).toContain("독립 메모리")
    expect(text).toContain("handoff allowed")
    expect(text).toContain("approval_required")
    expect(text).toContain("결과 검토")
    expect(text).not.toMatch(/raw dump|secret|token=/i)
  })

  it("rejects sibling memory access and applies compact settings only to the selected agent", () => {
    const base = draft()
    const invalid = applySubAgentAdvancedMemoryPolicyCommand({
      draft: base,
      language: "ko",
      command: {
        kind: "update_memory_policy",
        source: "advanced",
        agentId: "agent:research",
        owner: { ownerType: "sub_agent", ownerId: "agent:writer" },
        readScopes: [{ ownerType: "sub_agent", ownerId: "agent:writer" }],
        writeScope: { ownerType: "sub_agent", ownerId: "agent:research" },
        compactThreshold: 16_000,
        capsuleMode: "rolling_summary",
        isolationLevel: "private",
      },
    })
    expect(invalid.ok).toBe(false)
    expect(invalid.issueCodes).toContain("memory_owner_scope_mismatch")

    const valid = applySubAgentAdvancedMemoryPolicyCommand({
      draft: base,
      language: "ko",
      now: 1_780_000_300_000,
      command: {
        kind: "update_memory_policy",
        source: "advanced",
        agentId: "agent:research",
        owner: { ownerType: "sub_agent", ownerId: "agent:research" },
        readScopes: [{ ownerType: "sub_agent", ownerId: "agent:research" }],
        writeScope: { ownerType: "sub_agent", ownerId: "agent:research" },
        compactThreshold: 48_000,
        capsuleMode: "rolling_summary",
        isolationLevel: "private",
      },
    })
    expect(valid.ok).toBe(true)
    expect(valid.draft?.subAgents?.items.find((item) => item.agentId === "agent:research")?.memoryPolicy).toEqual(expect.objectContaining({
      compactThreshold: 48_000,
      capsuleMode: "rolling_summary",
      visibility: "private",
    }))
    expect(valid.draft?.subAgents?.items.find((item) => item.agentId === "agent:lead")?.profileVersion).toBe(2)
  })

  it("blocks dangerous permission escalation outside advanced settings and stores explicit advanced policy", () => {
    const base = draft()
    const beginner = applySubAgentAdvancedCapabilityPolicyCommand({
      draft: base,
      language: "ko",
      command: {
        kind: "update_capability_policy",
        source: "beginner",
        agentId: "agent:research",
        allowedCapabilityIds: ["capability:shell"],
        deniedCapabilityIds: [],
        approvalRequiredCapabilityIds: [],
        osSensitiveCapabilityIds: [],
      },
    })
    expect(beginner.ok).toBe(false)
    expect(beginner.issueCodes).toContain("permission_escalation_requires_advanced")

    const advanced = applySubAgentAdvancedCapabilityPolicyCommand({
      draft: base,
      language: "ko",
      now: 1_780_000_300_000,
      command: {
        kind: "update_capability_policy",
        source: "advanced",
        agentId: "agent:research",
        allowedCapabilityIds: ["capability:network_mcp", "capability:shell"],
        deniedCapabilityIds: ["capability:screen_control"],
        approvalRequiredCapabilityIds: ["capability:shell"],
        osSensitiveCapabilityIds: ["capability:screen_capture"],
      },
    })
    expect(advanced.ok).toBe(true)
    expect(advanced.draft?.subAgents?.items.find((item) => item.agentId === "agent:research")?.capabilityPolicy?.permissionProfile).toEqual(expect.objectContaining({
      allowShellExecution: true,
      allowExternalNetwork: true,
      riskCeiling: "dangerous",
    }))
  })

  it("validates direct-child delegation, self delegation, and disabled child targets", () => {
    const base = draft()
    const selfDelegation = applySubAgentAdvancedDelegationPolicyCommand({
      draft: base,
      language: "ko",
      command: {
        kind: "update_delegation_policy",
        source: "advanced",
        agentId: "agent:lead",
        canDelegate: true,
        directChildOnly: true,
        allowedChildAgentIds: ["agent:lead"],
        resultReviewRequired: true,
        redelegationAllowed: true,
      },
    })
    expect(selfDelegation.ok).toBe(false)
    expect(selfDelegation.issueCodes).toContain("delegation_target_self")

    const notDirectChild = applySubAgentAdvancedDelegationPolicyCommand({
      draft: base,
      language: "ko",
      command: {
        kind: "update_delegation_policy",
        source: "advanced",
        agentId: "agent:research",
        canDelegate: true,
        directChildOnly: true,
        allowedChildAgentIds: ["agent:writer"],
        resultReviewRequired: true,
        redelegationAllowed: true,
      },
    })
    expect(notDirectChild.ok).toBe(false)
    expect(notDirectChild.issueCodes).toContain("delegation_target_not_direct_child")

    const disabledChild = applySubAgentAdvancedDelegationPolicyCommand({
      draft: base,
      language: "ko",
      command: {
        kind: "update_delegation_policy",
        source: "advanced",
        agentId: "agent:nobie",
        canDelegate: true,
        directChildOnly: true,
        allowedChildAgentIds: ["agent:writer"],
        resultReviewRequired: true,
        redelegationAllowed: true,
      },
    })
    expect(disabledChild.ok).toBe(false)
    expect(disabledChild.issueCodes).toContain("delegation_target_unavailable")

    const valid = applySubAgentAdvancedDelegationPolicyCommand({
      draft: base,
      language: "ko",
      now: 1_780_000_300_000,
      command: {
        kind: "update_delegation_policy",
        source: "advanced",
        agentId: "agent:lead",
        canDelegate: true,
        directChildOnly: true,
        allowedChildAgentIds: ["agent:research"],
        resultReviewRequired: true,
        redelegationAllowed: true,
      },
    })
    expect(valid.ok).toBe(true)
    expect(valid.draft?.subAgents?.items.find((item) => item.agentId === "agent:lead")?.delegationPolicy).toEqual(expect.objectContaining({
      allowedChildAgentIds: ["agent:research"],
      resultReviewRequired: true,
      aggregationMode: "parent_synthesis",
      redelegationAllowed: true,
    }))
  })
})
