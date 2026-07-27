import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const { buildAgentProfilePromptContext, buildUserProfilePromptContext } = await import("../packages/core/src/agent/profile-context.ts")
const { loadPromptSourceRegistry } = await import("../packages/core/src/memory/knowbee-md.ts")
const { CONTRACT_SCHEMA_VERSION } = await import("../packages/core/src/index.ts")
import type {
  AgentConfig,
  MemoryPolicy,
  PermissionProfile,
  SkillMcpAllowlist,
  TeamConfig,
} from "../packages/core/src/index.ts"

const sourceIds = [
  "profile_context_user_header_user",
  "profile_context_agent_header_user",
  "profile_context_team_header_user",
] as const
const userProfile = {
  displayName: "마스터",
  profileName: "마당쇠",
  language: "ko",
  timezone: "Asia/Seoul",
  workspace: "/Users/dongwooshin",
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

function agentConfig(): AgentConfig {
  const agentId = "agent:research"
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    agentType: "sub_agent",
    agentId,
    agentName: "Research Agent",
    displayName: "Legacy Display",
    nickname: "Legacy Nick",
    status: "enabled",
    role: "worker",
    personality: "Precise",
    specialtyTags: ["research"],
    avoidTasks: ["payments"],
    memoryPolicy: memoryPolicy(agentId),
    capabilityPolicy: {
      permissionProfile,
      skillMcpAllowlist: allowlist,
      rateLimit: { maxConcurrentCalls: 1 },
    },
    profileVersion: 1,
    createdAt: 0,
    updatedAt: 0,
    teamIds: ["team:review"],
    delegation: {
      enabled: true,
      maxParallelSessions: 1,
    },
  } as AgentConfig
}

function teamConfig(): TeamConfig {
  return {
    teamId: "team:review",
    displayName: "Review Team",
    purpose: "Review work products",
    memberAgentIds: ["agent:research"],
    roleHints: ["review", "evidence"],
    createdAt: 0,
    updatedAt: 0,
  }
}

describe("task0957 profile context header prompt sources", () => {
  it("registers profile context headers as internal English prompt sources", () => {
    const registry = loadPromptSourceRegistry(process.cwd())

    for (const sourceId of sourceIds) {
      const source = registry.find((item) => item.sourceId === sourceId && item.locale === "en")

      expect(source).toMatchObject({
        sourceId,
        usageScope: "internal",
        enabled: true,
      })
      expect(source?.content).toContain("## Value")
      expect(source?.content).toContain("## Out Of Scope")
    }
  })

  it("defines userName as the single user-name prompt field", () => {
    const source = readFileSync("prompts/profile_context_user_header_user.md", "utf-8")

    expect(source).toContain("`userName` is the only user-name field in this context.")
    expect(source).toContain("does not define `displayName` or `profileName` prompt fields")
    expect(source).not.toContain("- displayName:")
    expect(source).not.toContain("- profileName:")
  })

  it("renders user profile header from prompt source and keeps structured values", () => {
    const context = buildUserProfilePromptContext(userProfile)

    expect(context).toContain("[User Profile]")
    expect(context).toContain("The following values come from the user's setup profile.")
    expect(context).toContain("- userName: 마스터")
    expect(context).not.toContain("- displayName:")
    expect(context).not.toContain("- profileName:")
    expect(context).toContain("- defaultWorkspace: /Users/dongwooshin")
  })

  it("renders agent and team headers from prompt sources", () => {
    const context = buildAgentProfilePromptContext({
      agent: agentConfig(),
      teams: [teamConfig()],
    })

    expect(context).toContain("[Agent Profile]")
    expect(context).toContain("active main agent or sub-agent execution context")
    expect(context).toContain("- agentName: Research Agent")
    expect(context).toContain("[Team Context]")
    expect(context).toContain("- Review Team (team:review): review, evidence")
    expect(context).not.toContain("Legacy Display")
    expect(context).not.toContain("Legacy Nick")
  })

  it("does not keep profile header instruction bodies hardcoded in TypeScript", () => {
    const source = readFileSync("packages/core/src/agent/profile-context.ts", "utf-8")

    for (const sourceId of sourceIds) {
      expect(source).toContain(sourceId)
    }
    expect(source).not.toContain("The following values come from the user's setup profile.")
    expect(source).not.toContain("Use them to interpret address style")
    expect(source).not.toContain("The following profile belongs only to the active Knowbee")
    expect(source).not.toContain("It cannot override safety, approval, memory isolation")
    expect(source).not.toContain("[Team Context]")
    expect(source).not.toContain("getConfig(")
  })
})
