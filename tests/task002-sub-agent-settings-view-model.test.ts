import { describe, expect, it } from "vitest"
import {
  CONTRACT_SCHEMA_VERSION,
  type AgentRelationship,
  type MemoryPolicy,
  type PermissionProfile,
  type RuntimeIdentity,
  type SkillMcpAllowlist,
  type SubAgentConfig,
} from "../packages/core/src/index.ts"
import {
  buildAdvancedSubAgentSettingsView,
  buildBeginnerSubAgentSetupView,
  buildSubAgentStateProjection,
  validateSubAgentSettingsCommand,
  type SubAgentSettingsValidationContext,
} from "../packages/core/src/ui/sub-agent-settings.ts"

const now = Date.UTC(2026, 5, 12, 0, 0, 0)

function owner(
  ownerType: RuntimeIdentity["owner"]["ownerType"] = "sub_agent",
  ownerId = "agent:researcher",
): RuntimeIdentity["owner"] {
  return { ownerType, ownerId }
}

const safePermissionProfile: PermissionProfile = {
  profileId: "profile:safe",
  riskCeiling: "moderate",
  approvalRequiredFrom: "moderate",
  allowExternalNetwork: true,
  allowFilesystemWrite: false,
  allowShellExecution: false,
  allowScreenControl: false,
  allowedPaths: [],
}

const allowlist: SkillMcpAllowlist = {
  enabledSkillIds: ["skill:research"],
  enabledMcpServerIds: ["mcp:browser"],
  enabledToolNames: ["web_search"],
  disabledToolNames: [],
  secretScopeId: "scope:researcher",
}

function memoryPolicy(agentId: string): MemoryPolicy {
  return {
    owner: owner("sub_agent", agentId),
    visibility: "private",
    readScopes: [owner("sub_agent", agentId)],
    writeScope: owner("sub_agent", agentId),
    retentionPolicy: "short_term",
    writebackReviewRequired: true,
  }
}

function subAgent(
  agentId: string,
  displayName: string,
  nickname: string,
  overrides: Partial<SubAgentConfig> = {},
): SubAgentConfig {
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    agentType: "sub_agent",
    agentId,
    displayName,
    nickname,
    status: "enabled",
    role: `${displayName} role`,
    personality: "Focused and concise",
    specialtyTags: ["research"],
    avoidTasks: [],
    modelProfile: {
      providerId: "openai",
      modelId: "gpt-5.4",
      fallbackModelId: "gpt-5.4-mini",
    },
    memoryPolicy: memoryPolicy(agentId),
    capabilityPolicy: {
      permissionProfile: safePermissionProfile,
      skillMcpAllowlist: {
        ...allowlist,
        secretScopeId: `scope:${agentId}`,
      },
      rateLimit: { maxConcurrentCalls: 2 },
    },
    delegationPolicy: {
      enabled: true,
      maxParallelSessions: 2,
    },
    teamIds: [],
    delegation: {
      enabled: true,
      maxParallelSessions: 2,
    },
    profileVersion: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

const relationships: AgentRelationship[] = [
  {
    edgeId: "edge:knowbee:researcher",
    parentAgentId: "agent:knowbee",
    childAgentId: "agent:researcher",
    relationshipType: "parent_child",
    status: "active",
    sortOrder: 0,
  },
  {
    edgeId: "edge:researcher:writer",
    parentAgentId: "agent:researcher",
    childAgentId: "agent:writer",
    relationshipType: "parent_child",
    status: "active",
    sortOrder: 0,
  },
]

const validationContext: SubAgentSettingsValidationContext = {
  rootAgent: {
    agentId: "agent:knowbee",
    displayName: "Knowbee",
    nickname: "Knowbee",
  },
  agents: [
    subAgent("agent:researcher", "Researcher", "Res"),
    subAgent("agent:writer", "Writer", "Writer"),
  ],
  relationships,
  catalogs: {
    skillIds: ["skill:research"],
    mcpServerIds: ["mcp:browser"],
    modelIds: ["openai:gpt-5.4", "openai:gpt-5.4-mini"],
    capabilityIds: ["capability:web", "capability:file_read"],
    dangerousCapabilityIds: ["capability:shell"],
  },
}

describe("task002 sub-agent settings view model and command contracts", () => {
  it("builds beginner and advanced projections from the same saved source", () => {
    const savedAgents = [
      subAgent("agent:researcher", "Researcher", "Res"),
      subAgent("agent:writer", "Writer", "Writer"),
    ]

    const beginner = buildBeginnerSubAgentSetupView({
      rootAgent: validationContext.rootAgent,
      savedAgents,
      relationships,
      catalogs: validationContext.catalogs,
      runtime: {
        activeAgentIds: ["agent:researcher"],
        lastSeenAtByAgentId: { "agent:researcher": now + 1_000 },
      },
      now,
    })

    const advanced = buildAdvancedSubAgentSettingsView({
      rootAgent: validationContext.rootAgent,
      savedAgents,
      relationships,
      catalogs: validationContext.catalogs,
      selectedAgentId: "agent:researcher",
      runtime: {
        activeAgentIds: ["agent:researcher"],
        lastSeenAtByAgentId: { "agent:researcher": now + 1_000 },
      },
      now,
    })

    expect(beginner.orchestrationMode).toBe("orchestration")
    expect(beginner.cards[0]).toEqual(expect.objectContaining({
      id: "agent:researcher",
      displayName: "Researcher",
      nickname: "Res",
      attributionLabel: "Res",
      parentDisplayName: "Knowbee",
      childCount: 1,
      isTopLevel: true,
      readinessState: "ready",
      lifecycleState: "runtime_active",
    }))
    expect(beginner.cards[0]?.displayLabel).toBe("Res")
    expect(beginner.cards[0]?.displayLabel).not.toBe("agent:researcher")

    expect(advanced.agents[0]).toEqual(expect.objectContaining({
      id: "agent:researcher",
      displayName: "Researcher",
      nickname: "Res",
      readinessState: "ready",
      lifecycleState: "runtime_active",
    }))
    expect(advanced.selectedAgent?.identity.attributionLabel).toBe("Res")
    expect(advanced.selectedAgent?.model.mode).toBe("override")
    expect(advanced.selectedAgent?.skillMcp.enabledSkillIds).toEqual(["skill:research"])
    expect(advanced.selectedAgent?.memory.ownerId).toBe("agent:researcher")
    expect(advanced.selectedAgent?.delegation.directChildAgentIds).toEqual(["agent:writer"])
  })

  it("validates section commands before they can mutate saved settings", () => {
    expect(validateSubAgentSettingsCommand({
      kind: "create_basic",
      source: "beginner",
      parentAgentId: "agent:knowbee",
      displayName: "Researcher 2",
      nickname: "Res2",
      role: "Research helper",
      description: "Collect evidence.",
      initialLifecycleState: "draft",
      safeDefaultPolicy: true,
    }, validationContext).ok).toBe(true)

    expect(validateSubAgentSettingsCommand({
      kind: "update_identity",
      source: "advanced",
      agentId: "agent:writer",
      displayName: "Writer",
      nickname: "Res",
      role: "Writer role",
      description: "Draft responses.",
      attributionLabel: "Res",
    }, validationContext).issues.map((issue) => issue.code)).toContain("nickname_duplicate")

    expect(validateSubAgentSettingsCommand({
      kind: "update_identity",
      source: "advanced",
      agentId: "agent:writer",
      displayName: "Knowbee",
      nickname: "Knowbee",
      role: "Writer role",
      description: "Draft responses.",
      attributionLabel: "Knowbee",
    }, validationContext).issues.map((issue) => issue.code)).toContain("reserved_knowbee_name")

    expect(validateSubAgentSettingsCommand({
      kind: "update_skill_mcp_bindings",
      source: "advanced",
      agentId: "agent:researcher",
      enabledSkillIds: ["skill:missing"],
      enabledMcpServerIds: ["mcp:browser"],
      enabledToolNames: ["web_search"],
      disabledToolNames: [],
    }, validationContext).issues.map((issue) => issue.code)).toContain("catalog_id_missing")

    expect(validateSubAgentSettingsCommand({
      kind: "update_model_policy",
      source: "advanced",
      agentId: "agent:researcher",
      mode: "override",
      providerId: "openai",
      modelId: "missing-model",
    }, validationContext).issues.map((issue) => issue.code)).toContain("model_id_missing")

    expect(validateSubAgentSettingsCommand({
      kind: "update_memory_policy",
      source: "advanced",
      agentId: "agent:researcher",
      owner: owner("sub_agent", "agent:writer"),
      readScopes: [owner("sub_agent", "agent:writer")],
      writeScope: owner("sub_agent", "agent:writer"),
      compactThreshold: 10_000,
      capsuleMode: "session_compaction",
      isolationLevel: "private",
    }, validationContext).issues.map((issue) => issue.code)).toContain("memory_owner_scope_mismatch")

    expect(validateSubAgentSettingsCommand({
      kind: "update_capability_policy",
      source: "beginner",
      agentId: "agent:researcher",
      allowedCapabilityIds: ["capability:shell"],
      deniedCapabilityIds: [],
      approvalRequiredCapabilityIds: [],
      osSensitiveCapabilityIds: [],
    }, validationContext).issues.map((issue) => issue.code)).toContain("permission_escalation_requires_advanced")

    expect(validateSubAgentSettingsCommand({
      kind: "update_delegation_policy",
      source: "advanced",
      agentId: "agent:writer",
      canDelegate: true,
      directChildOnly: true,
      allowedChildAgentIds: ["agent:researcher"],
      resultReviewRequired: true,
      redelegationAllowed: true,
    }, validationContext).issues.map((issue) => issue.code)).toContain("delegation_target_not_direct_child")
  })

  it("keeps draft, saved, and runtime active projections separated", () => {
    const saved = subAgent("agent:researcher", "Researcher", "Res")
    const draft = subAgent("agent:researcher", "Researcher draft", "ResDraft", {
      updatedAt: now + 2_000,
    })
    const runtimeActive = subAgent("agent:researcher", "Researcher", "Res", {
      profileVersion: 1,
      updatedAt: now - 5_000,
    })

    const projection = buildSubAgentStateProjection({
      rootAgent: validationContext.rootAgent,
      draftAgent: draft,
      savedAgent: saved,
      runtimeActiveAgent: runtimeActive,
      relationships,
      catalogs: validationContext.catalogs,
      runtime: {
        activeAgentIds: ["agent:researcher"],
        lastSeenAtByAgentId: { "agent:researcher": now + 1_000 },
        activeVersionByAgentId: { "agent:researcher": 1 },
      },
      now,
    })

    expect(projection.agentId).toBe("agent:researcher")
    expect(projection.draft?.displayName).toBe("Researcher draft")
    expect(projection.saved?.displayName).toBe("Researcher")
    expect(projection.runtimeActive?.displayName).toBe("Researcher")
    expect(projection.stateLabel).toBe("unsaved_changes")
    expect(projection.runtimeActive?.driftFromSaved).toBe(false)
    expect(projection.draft?.displayLabel).toBe("ResDraft")
    expect(projection.runtimeActive?.displayLabel).toBe("Res")
  })
})
