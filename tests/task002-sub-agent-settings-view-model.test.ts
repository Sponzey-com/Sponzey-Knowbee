import { readFileSync } from "node:fs"
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
    agentName: nickname,
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
    agentName: "Knowbee",
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
  it("uses canonical direct main-agent mode when no sub-agents are configured", () => {
    const beginner = buildBeginnerSubAgentSetupView({
      rootAgent: validationContext.rootAgent,
      savedAgents: [],
      relationships: [],
      catalogs: validationContext.catalogs,
      now,
    })

    expect(beginner.orchestrationMode).toBe("direct_main_agent")
    expect(beginner.status).toBe("empty")
    expect(beginner.primaryAction).toBe("create_first_sub_agent")
  })

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
      agentName: "Res",
      attributionLabel: "Res",
      parentDisplayName: "Knowbee",
      childCount: 1,
      isTopLevel: true,
      readinessState: "ready",
      lifecycleState: "runtime_active",
    }))
    expect(beginner.cards[0]?.displayLabel).toBe("Res")
    expect(beginner.cards[0]?.displayLabel).not.toBe("agent:researcher")
    expect(beginner.cards[0]).not.toHaveProperty("displayName")
    expect(beginner.cards[0]).not.toHaveProperty("nickname")

    expect(advanced.agents[0]).toEqual(expect.objectContaining({
      id: "agent:researcher",
      agentName: "Res",
      readinessState: "ready",
      lifecycleState: "runtime_active",
    }))
    expect(advanced.agents[0]).not.toHaveProperty("displayName")
    expect(advanced.agents[0]).not.toHaveProperty("nickname")
    expect(advanced.selectedAgent?.identity.agentName).toBe("Res")
    expect(advanced.selectedAgent?.identity).not.toHaveProperty("displayName")
    expect(advanced.selectedAgent?.identity).not.toHaveProperty("nickname")
    expect(advanced.selectedAgent?.identity.attributionLabel).toBe("Res")
    expect(advanced.selectedAgent?.model.mode).toBe("override")
    expect(advanced.selectedAgent?.skillMcp.enabledSkillIds).toEqual(["skill:research"])
    expect(advanced.selectedAgent?.memory.ownerId).toBe("agent:researcher")
    expect(advanced.selectedAgent?.delegation.directChildAgentIds).toEqual(["agent:writer"])
  })

  it("projects canonical agentName ahead of legacy displayName and nickname", () => {
    const savedAgents = [
      subAgent("agent:researcher", "Researcher Display", "Researcher Legacy", {
        agentName: "Researcher Canonical",
      }),
    ]

    const beginner = buildBeginnerSubAgentSetupView({
      rootAgent: validationContext.rootAgent,
      savedAgents,
      relationships: relationships.slice(0, 1),
      catalogs: validationContext.catalogs,
      now,
    })
    const advanced = buildAdvancedSubAgentSettingsView({
      rootAgent: validationContext.rootAgent,
      savedAgents,
      relationships: relationships.slice(0, 1),
      catalogs: validationContext.catalogs,
      selectedAgentId: "agent:researcher",
      now,
    })

    expect(beginner.cards[0]?.agentName).toBe("Researcher Canonical")
    expect(beginner.cards[0]?.displayLabel).toBe("Researcher Canonical")
    expect(advanced.selectedAgent?.identity.agentName).toBe("Researcher Canonical")
    expect(advanced.selectedAgent?.identity.attributionLabel).toBe("Researcher Canonical")
  })

  it("sorts visible sub-agent rows by canonical agentName instead of legacy displayName", () => {
    const savedAgents = [
      subAgent("agent:alpha", "Z legacy display", "Z legacy nick", {
        agentName: "Alpha",
      }),
      subAgent("agent:zeta", "A legacy display", "A legacy nick", {
        agentName: "Zeta",
      }),
    ]
    const topLevelRelationships: AgentRelationship[] = savedAgents.map((agent, index) => ({
      edgeId: `edge:knowbee:${agent.agentId}`,
      parentAgentId: "agent:knowbee",
      childAgentId: agent.agentId,
      relationshipType: "parent_child",
      status: "active",
      sortOrder: index,
    }))

    const beginner = buildBeginnerSubAgentSetupView({
      rootAgent: validationContext.rootAgent,
      savedAgents,
      relationships: topLevelRelationships,
      catalogs: validationContext.catalogs,
      now,
    })
    const advanced = buildAdvancedSubAgentSettingsView({
      rootAgent: validationContext.rootAgent,
      savedAgents,
      relationships: topLevelRelationships,
      catalogs: validationContext.catalogs,
      now,
    })

    expect(beginner.cards.map((card) => card.agentName)).toEqual(["Alpha", "Zeta"])
    expect(advanced.agents.map((agent) => agent.agentName)).toEqual(["Alpha", "Zeta"])
  })

  it("uses canonical agent name validation codes in readiness diagnostics", () => {
    const savedAgents = [
      subAgent("agent:researcher", "Researcher", "Res"),
      subAgent("agent:writer", "Writer", "Res"),
    ]

    const beginner = buildBeginnerSubAgentSetupView({
      rootAgent: validationContext.rootAgent,
      savedAgents,
      relationships,
      catalogs: validationContext.catalogs,
      now,
    })

    expect(beginner.cards[0]?.readiness.reasonCodes).toContain("agent_name_duplicate")
    expect(beginner.cards[1]?.readiness.reasonCodes).toContain("agent_name_duplicate")
    expect(beginner.cards.flatMap((card) => card.readiness.reasonCodes)).not.toContain("nickname_duplicate")
  })

  it("does not keep legacy nickname or display-name issue codes in settings sources", () => {
    const sources = [
      "../packages/core/src/ui/sub-agent-settings.ts",
      "../packages/core/src/ui/unified-settings.ts",
      "../packages/webui/src/lib/beginner-sub-agents.ts",
      "../packages/webui/src/lib/advanced-sub-agent-settings.ts",
    ].map((path) => readFileSync(new URL(path, import.meta.url), "utf-8"))

    for (const source of sources) {
      expect(source).not.toContain("nickname_duplicate")
      expect(source).not.toContain("display_name_required")
    }
  })

  it("validates section commands before they can mutate saved settings", () => {
    expect(validateSubAgentSettingsCommand({
      kind: "create_basic",
      source: "beginner",
      parentAgentId: "agent:knowbee",
      agentName: "Res2",
      role: "Research helper",
      description: "Collect evidence.",
      initialLifecycleState: "draft",
      safeDefaultPolicy: true,
    }, validationContext).ok).toBe(true)

    expect(validateSubAgentSettingsCommand({
      kind: "update_identity",
      source: "advanced",
      agentId: "agent:writer",
      agentName: "Res",
      role: "Writer role",
      description: "Draft responses.",
      attributionLabel: "Res",
    }, validationContext).issues.map((issue) => issue.code)).toContain("agent_name_duplicate")

    expect(validateSubAgentSettingsCommand({
      kind: "update_identity",
      source: "advanced",
      agentId: "agent:writer",
      agentName: "Knowbee",
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

  it("validates command names from agentName only, not legacy displayName or nickname", () => {
    const legacyMissingNamePayload = {
      kind: "create_basic",
      source: "beginner",
      parentAgentId: "agent:knowbee",
      agentName: "",
      displayName: "Display Filled",
      nickname: "Nickname Filled",
      role: "Research helper",
      description: "Collect evidence.",
      initialLifecycleState: "draft",
      safeDefaultPolicy: true,
    } as unknown as Parameters<typeof validateSubAgentSettingsCommand>[0]
    const missing = validateSubAgentSettingsCommand(legacyMissingNamePayload, validationContext)

    const legacyDuplicatePayload = {
      kind: "update_identity",
      source: "advanced",
      agentId: "agent:writer",
      agentName: "Writer Unique",
      displayName: "Researcher",
      nickname: "Res",
      role: "Writer role",
      description: "Draft responses.",
      attributionLabel: "Res",
    } as unknown as Parameters<typeof validateSubAgentSettingsCommand>[0]
    const uniqueAgentNameWithLegacyDuplicate = validateSubAgentSettingsCommand(legacyDuplicatePayload, validationContext)

    expect(missing.ok).toBe(false)
    expect(missing.issues.map((issue) => issue.code)).toContain("agent_name_required")
    expect(uniqueAgentNameWithLegacyDuplicate.ok).toBe(true)
    expect(uniqueAgentNameWithLegacyDuplicate.issues).toEqual([])
    const source = readFileSync("packages/core/src/ui/sub-agent-settings.ts", "utf-8")
    expect(source).not.toContain("command.nickname")
    expect(source).not.toContain("rootAgent.nickname")
  })

  it("reserves only product default names and root agentName, not root legacy displayName or nickname", () => {
    const rootAgent = {
      agentId: "agent:knowbee",
      agentName: "마당쇠",
      displayName: "Legacy Root Display",
      nickname: "Legacy Root Nickname",
    }
    const context: SubAgentSettingsValidationContext = {
      ...validationContext,
      rootAgent,
      agents: [],
      relationships: [],
    }
    const createCommand = (agentName: string) => validateSubAgentSettingsCommand({
      kind: "create_basic",
      source: "beginner",
      parentAgentId: "agent:knowbee",
      agentName,
      role: "Research helper",
      description: "Collect evidence.",
      initialLifecycleState: "draft",
      safeDefaultPolicy: true,
    }, context)

    expect(createCommand("Legacy Root Display").ok).toBe(true)
    expect(createCommand("Legacy Root Nickname").ok).toBe(true)
    expect(createCommand("마당쇠").issues.map((issue) => issue.code)).toContain("reserved_knowbee_name")
    expect(createCommand("Knowbee").issues.map((issue) => issue.code)).toContain("reserved_knowbee_name")
    expect(createCommand("노비").issues.map((issue) => issue.code)).toContain("reserved_knowbee_name")

    const legacyNamedAgent = subAgent("agent:legacy", "Legacy Display", "Legacy Nick", {
      agentName: "Legacy Root Display",
    })
    const rootNamedAgent = subAgent("agent:root-name", "Root Name Display", "Root Name Nick", {
      agentName: "마당쇠",
    })
    const productNamedAgent = subAgent("agent:product-name", "Product Display", "Product Nick", {
      agentName: "노비",
    })
    const topLevelRelationships: AgentRelationship[] = [
      legacyNamedAgent,
      rootNamedAgent,
      productNamedAgent,
    ].map((agent, index) => ({
      edgeId: `edge:knowbee:${agent.agentId}`,
      parentAgentId: "agent:knowbee",
      childAgentId: agent.agentId,
      relationshipType: "parent_child",
      status: "active",
      sortOrder: index,
    }))

    const beginner = buildBeginnerSubAgentSetupView({
      rootAgent,
      savedAgents: [legacyNamedAgent, rootNamedAgent, productNamedAgent],
      relationships: topLevelRelationships,
      catalogs: validationContext.catalogs,
      now,
    })

    const readinessById = new Map(beginner.cards.map((card) => [card.id, card.readiness]))
    expect(readinessById.get("agent:legacy")?.reasonCodes).not.toContain("reserved_knowbee_name")
    expect(readinessById.get("agent:legacy")?.state).toBe("ready")
    expect(readinessById.get("agent:root-name")?.reasonCodes).toContain("reserved_knowbee_name")
    expect(readinessById.get("agent:product-name")?.reasonCodes).toContain("reserved_knowbee_name")
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
    expect(projection.draft?.agentName).toBe("ResDraft")
    expect(projection.saved?.agentName).toBe("Res")
    expect(projection.runtimeActive?.agentName).toBe("Res")
    expect(projection.draft).not.toHaveProperty("displayName")
    expect(projection.saved).not.toHaveProperty("displayName")
    expect(projection.runtimeActive).not.toHaveProperty("displayName")
    expect(projection.stateLabel).toBe("unsaved_changes")
    expect(projection.runtimeActive?.driftFromSaved).toBe(false)
    expect(projection.draft?.displayLabel).toBe("ResDraft")
    expect(projection.runtimeActive?.displayLabel).toBe("Res")
  })

  it("uses agentName, not legacy displayName or nickname, for saved and runtime drift decisions", () => {
    const saved = subAgent("agent:researcher", "Saved legacy display", "Saved legacy nick", {
      agentName: "Researcher",
      role: "Research role",
    })
    const draftWithLegacyOnlyChange = subAgent("agent:researcher", "Draft legacy display", "Draft legacy nick", {
      agentName: "Researcher",
      role: "Research role",
    })
    const runtimeWithLegacyOnlyChange = subAgent("agent:researcher", "Runtime legacy display", "Runtime legacy nick", {
      agentName: "Researcher",
      role: "Research role",
      profileVersion: saved.profileVersion,
    })
    const runtimeWithAgentNameChange = subAgent("agent:researcher", "Saved legacy display", "Saved legacy nick", {
      agentName: "Researcher Runtime",
      role: "Research role",
      profileVersion: saved.profileVersion,
    })

    const legacyOnlyProjection = buildSubAgentStateProjection({
      rootAgent: validationContext.rootAgent,
      draftAgent: draftWithLegacyOnlyChange,
      savedAgent: saved,
      runtimeActiveAgent: runtimeWithLegacyOnlyChange,
      relationships,
      catalogs: validationContext.catalogs,
      runtime: {
        activeAgentIds: ["agent:researcher"],
        activeVersionByAgentId: { "agent:researcher": saved.profileVersion },
      },
      now,
    })
    const agentNameDriftProjection = buildSubAgentStateProjection({
      rootAgent: validationContext.rootAgent,
      savedAgent: saved,
      runtimeActiveAgent: runtimeWithAgentNameChange,
      relationships,
      catalogs: validationContext.catalogs,
      runtime: {
        activeAgentIds: ["agent:researcher"],
        activeVersionByAgentId: { "agent:researcher": saved.profileVersion },
      },
      now,
    })

    expect(legacyOnlyProjection.stateLabel).toBe("running")
    expect(legacyOnlyProjection.runtimeActive?.driftFromSaved).toBe(false)
    expect(agentNameDriftProjection.stateLabel).toBe("runtime_drift")
    expect(agentNameDriftProjection.runtimeActive?.driftFromSaved).toBe(true)
  })
})
