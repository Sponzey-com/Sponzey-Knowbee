import { describe, expect, it } from "vitest"
import { buildAgentProfilePromptContext } from "../packages/core/src/agent/profile-context.ts"
import {
  CONTRACT_SCHEMA_VERSION,
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

describe("task0138 agent profile prompt context", () => {
  it("uses canonical agentName instead of legacy displayName or nickname", () => {
    const context = buildAgentProfilePromptContext({
      agent: agentConfig({
        agentName: "Canonical Agent",
        displayName: "Legacy Display",
        nickname: "Legacy Nick",
      }),
    })

    expect(context).toContain("- agentName: Canonical Agent")
    expect(context).not.toContain("- displayName:")
    expect(context).not.toContain("- nickname:")
    expect(context).not.toContain("Legacy Display")
    expect(context).not.toContain("Legacy Nick")
  })

  it("does not expose legacy names when canonical agentName is missing", () => {
    const context = buildAgentProfilePromptContext({
      agent: agentConfig({
        agentName: "",
        displayName: "Legacy Display",
        nickname: "Legacy Nick",
      }),
    })

    expect(context).toContain("- agentName: Unnamed sub-agent")
    expect(context).not.toContain("Legacy Display")
    expect(context).not.toContain("Legacy Nick")
  })
})
