import { describe, expect, it } from "vitest"
import {
  buildAgentNameSnapshotFromAgentConfig,
  CONTRACT_SCHEMA_VERSION,
  resolveAgentConfigAgentName,
  type AgentConfig,
  type MemoryPolicy,
  type PermissionProfile,
  type SkillMcpAllowlist,
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
    retentionPolicy: "long_term",
    writebackReviewRequired: true,
  }
}

function agentConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  const agentId = typeof overrides.agentId === "string" ? overrides.agentId : "agent:research"
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    agentType: "sub_agent",
    agentId,
    agentName: "Research Canonical",
    displayName: "Research Display",
    nickname: "Research Legacy",
    status: "enabled",
    role: "worker",
    personality: "Precise",
    specialtyTags: ["general"],
    avoidTasks: [],
    memoryPolicy: memoryPolicy(agentId),
    capabilityPolicy: {
      permissionProfile,
      skillMcpAllowlist: allowlist,
      rateLimit: { maxConcurrentCalls: 1 },
    },
    profileVersion: 1,
    createdAt: 0,
    updatedAt: 0,
    teamIds: [],
    delegation: {
      enabled: true,
      maxParallelSessions: 1,
    },
    ...overrides,
  } as AgentConfig
}

describe("task0071 AgentConfig agent_name projection", () => {
  it("prefers canonical agentName over legacy displayName and nickname", () => {
    const config = agentConfig({
      agentName: "Canonical Name",
      displayName: "Display Name",
      nickname: "Legacy Name",
    })

    expect(resolveAgentConfigAgentName(config)).toBe("Canonical Name")
  })

  it("does not fall back to legacy displayName or nickname when canonical agentName is absent", () => {
    const config = agentConfig({
      agentName: "",
      displayName: "Display Name",
      nickname: "Legacy Name",
    })

    expect(resolveAgentConfigAgentName(config)).toBe("Unnamed sub-agent")
  })

  it("uses the Knowbee default only for the main agent when canonical agentName is absent", () => {
    const config = agentConfig({
      agentType: "knowbee",
      agentId: "agent:knowbee",
      agentName: "",
      displayName: "Legacy Knowbee Display",
      nickname: "Legacy Knowbee Nick",
    })

    expect(resolveAgentConfigAgentName(config)).toBe("Knowbee")
    expect(resolveAgentConfigAgentName(config)).not.toContain(" / ")
  })

  it("builds canonical agent_name snapshots from AgentConfig", () => {
    const snapshot = buildAgentNameSnapshotFromAgentConfig(agentConfig({
      agentId: "agent:writer",
      agentName: "Writer",
    }))

    expect(snapshot).toEqual({
      entityType: "sub_agent",
      entityId: "agent:writer",
      agentName: "Writer",
      agentNameSnapshot: "Writer",
    })
    expect(snapshot).not.toHaveProperty("displayName")
    expect(snapshot).not.toHaveProperty("nickname")
  })
})
