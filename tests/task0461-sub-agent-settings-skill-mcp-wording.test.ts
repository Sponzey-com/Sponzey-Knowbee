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
import { buildBeginnerSubAgentSetupView } from "../packages/core/src/ui/sub-agent-settings.ts"

const now = Date.UTC(2026, 6, 6, 0, 0, 0)

const rootAgent = {
  agentId: "agent:knowbee",
  agentName: "마당쇠",
}

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

function owner(agentId: string): RuntimeIdentity["owner"] {
  return { ownerType: "sub_agent", ownerId: agentId }
}

function memoryPolicy(agentId: string): MemoryPolicy {
  return {
    owner: owner(agentId),
    visibility: "private",
    readScopes: [owner(agentId)],
    writeScope: owner(agentId),
    retentionPolicy: "short_term",
    writebackReviewRequired: true,
  }
}

function allowlist(): SkillMcpAllowlist {
  return {
    enabledSkillIds: ["skill:research", "skill:write"],
    enabledMcpServerIds: ["mcp:browser"],
    enabledToolNames: [],
    disabledToolNames: [],
  }
}

function subAgent(): SubAgentConfig {
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    agentType: "sub_agent",
    agentId: "agent:research",
    agentName: "조사 담당",
    displayName: "조사 담당",
    nickname: "조사 담당",
    status: "enabled",
    role: "조사와 정리",
    personality: "Concise",
    specialtyTags: [],
    avoidTasks: [],
    memoryPolicy: memoryPolicy("agent:research"),
    capabilityPolicy: {
      permissionProfile,
      skillMcpAllowlist: allowlist(),
      rateLimit: { maxConcurrentCalls: 1 },
    },
    delegationPolicy: {
      enabled: false,
      maxParallelSessions: 1,
    },
    teamIds: [],
    delegation: {
      enabled: false,
      maxParallelSessions: 1,
    },
    profileVersion: 1,
    createdAt: now,
    updatedAt: now,
  }
}

const relationships: AgentRelationship[] = [
  {
    edgeId: "edge:knowbee:research",
    parentAgentId: "agent:knowbee",
    childAgentId: "agent:research",
    relationshipType: "parent_child",
    status: "active",
    sortOrder: 0,
  },
]

describe("task0461 sub-agent settings skill/MCP wording", () => {
  it("uses work ability and external feature wording in beginner readiness and summary", () => {
    const view = buildBeginnerSubAgentSetupView({
      rootAgent,
      savedAgents: [subAgent()],
      relationships,
      catalogs: {
        skillIds: ["skill:research", "skill:write"],
        mcpServerIds: ["mcp:browser"],
      },
      now,
    })

    const card = view.cards[0]
    const skillMcpReadiness = card?.readiness.items.find((item) => item.dimension === "skill_mcp")

    expect(skillMcpReadiness?.label).toBe("작업 능력/외부 기능")
    expect(card?.skillMcpSummary).toBe("작업 능력 2개, 외부 기능 1개")
  })

  it("does not keep old Skill/MCP beginner-facing strings in the core projection source", () => {
    const source = readFileSync("packages/core/src/ui/sub-agent-settings.ts", "utf8")

    expect(source).not.toContain('"Skill and MCP"')
    expect(source).not.toContain("MCP servers")
    expect(source).not.toContain(" skills, ")
  })
})
