import { describe, expect, it } from "vitest"
import { delegationCandidatesFromRegistry } from "../packages/core/src/topology/executor-delegation-resolution.ts"
import {
  CONTRACT_SCHEMA_VERSION,
  type AgentRegistryEntry,
  type MemoryPolicy,
  type PermissionProfile,
  type SkillMcpAllowlist,
  type SubAgentConfig,
  type TeamRegistryEntry,
} from "../packages/core/src/index.ts"

const permissionProfile: PermissionProfile = {
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
  enabledSkillIds: [],
  enabledMcpServerIds: [],
  enabledToolNames: [],
  disabledToolNames: [],
}

function memoryPolicy(agentId: string): MemoryPolicy {
  return {
    owner: { ownerType: "sub_agent", ownerId: agentId },
    visibility: "private",
    readScopes: [{ ownerType: "sub_agent", ownerId: agentId }],
    writeScope: { ownerType: "sub_agent", ownerId: agentId },
    retentionPolicy: "short_term",
    writebackReviewRequired: true,
  }
}

function subAgent(input: {
  agentId: string
  agentName?: string
  displayName: string
  nickname: string
}): SubAgentConfig {
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    agentType: "sub_agent",
    agentId: input.agentId,
    ...(input.agentName !== undefined ? { agentName: input.agentName } : {}),
    displayName: input.displayName,
    nickname: input.nickname,
    status: "enabled",
    role: "worker",
    personality: "Precise",
    specialtyTags: [],
    avoidTasks: [],
    memoryPolicy: memoryPolicy(input.agentId),
    capabilityPolicy: {
      permissionProfile,
      skillMcpAllowlist: allowlist,
      rateLimit: { maxConcurrentCalls: 1 },
    },
    teamIds: [],
    delegation: {
      enabled: true,
      maxParallelSessions: 1,
    },
    profileVersion: 1,
    createdAt: 0,
    updatedAt: 0,
  }
}

function registryAgent(config: SubAgentConfig): AgentRegistryEntry {
  return {
    agentId: config.agentId,
    agentName: config.agentName ?? "",
    status: config.status,
    role: config.role,
    specialtyTags: config.specialtyTags,
    avoidTasks: config.avoidTasks,
    teamIds: config.teamIds,
    delegationEnabled: config.delegation.enabled,
    source: "config",
    config,
    permissionProfile,
    capabilityPolicy: config.capabilityPolicy,
    skillMcpSummary: {
      enabledSkillIds: [],
      enabledMcpServerIds: [],
      enabledToolNames: [],
      disabledToolNames: [],
    },
    capabilitySummary: {
      available: true,
      status: "ready",
      reasonCodes: [],
      capabilityIds: [],
      unavailableCapabilityIds: [],
    },
    modelSummary: {
      available: true,
      status: "ready",
      reasonCodes: [],
    },
    degradedReasonCodes: [],
    currentLoad: {
      activeSubSessions: 0,
      queuedSubSessions: 0,
      failedSubSessions: 0,
      completedSubSessions: 0,
      maxParallelSessions: 1,
      utilization: 0,
    },
    failureRate: {
      windowMs: 1,
      consideredSubSessions: 0,
      failedSubSessions: 0,
      value: 0,
    },
  }
}

function registryTeam(overrides: Partial<TeamRegistryEntry> = {}): TeamRegistryEntry {
  return {
    teamId: "team:legacy",
    displayName: "정식 팀 이름",
    status: "enabled",
    purpose: "Legacy team nickname must not be used for target labels.",
    roleHints: [],
    activeMemberAgentIds: [],
    source: "config",
    config: {
      schemaVersion: CONTRACT_SCHEMA_VERSION,
      teamId: "team:legacy",
      displayName: "정식 팀 이름",
      status: "enabled",
      purpose: "Legacy team nickname must not be used for target labels.",
      ownerAgentId: "agent:knowbee",
      leadAgentId: "agent:named",
      memberCountMin: 0,
      memberCountMax: 1,
      requiredTeamRoles: [],
      requiredCapabilityTags: [],
      resultPolicy: "lead_synthesis",
      conflictPolicy: "lead_decides",
      memberships: [],
      memberAgentIds: [],
      roleHints: [],
      profileVersion: 1,
      createdAt: 0,
      updatedAt: 0,
    },
    activeMemberIds: [],
    activeMemberCount: 0,
    inactiveMemberCount: 0,
    coverage: undefined,
    health: undefined,
    ...overrides,
  }
}

describe("task0141 delegation candidate labels", () => {
  it("uses canonical agentName for agent target labels", () => {
    const entry = registryAgent(subAgent({
      agentId: "agent:named",
      agentName: "현장 담당",
      displayName: "Legacy Display",
      nickname: "Legacy Nick",
    }))
    const candidates = delegationCandidatesFromRegistry({
      registry: {
        agents: [entry],
        teams: [],
      },
    })

    expect(entry).not.toHaveProperty("displayName")
    expect(entry).not.toHaveProperty("nickname")
    expect(candidates[0]?.targetLabel).toBe("현장 담당")
    expect(candidates[0]?.targetLabel).not.toBe("Legacy Display")
    expect(candidates[0]?.targetLabel).not.toBe("Legacy Nick")
  })

  it("does not expose legacy target labels when agentName is missing", () => {
    const entry = registryAgent(subAgent({
      agentId: "agent:legacy",
      agentName: "",
      displayName: "Legacy Display",
      nickname: "Legacy Nick",
    }))
    const candidates = delegationCandidatesFromRegistry({
      registry: {
        agents: [entry],
        teams: [],
      },
    })

    expect(entry).not.toHaveProperty("displayName")
    expect(entry).not.toHaveProperty("nickname")
    expect(candidates[0]?.targetLabel).toBe("Unnamed sub-agent")
    expect(candidates[0]?.targetLabel).not.toBe("Legacy Display")
    expect(candidates[0]?.targetLabel).not.toBe("Legacy Nick")
  })

  it("uses displayName instead of legacy team nickname for team target labels", () => {
    const candidates = delegationCandidatesFromRegistry({
      registry: {
        agents: [],
        teams: [registryTeam()],
      },
    })

    expect(candidates[0]?.targetLabel).toBe("정식 팀 이름")
    expect(candidates[0]?.targetLabel).not.toBe("Legacy Team Nick")
  })
})
