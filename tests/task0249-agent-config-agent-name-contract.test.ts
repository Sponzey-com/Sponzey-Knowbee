import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  CONTRACT_SCHEMA_VERSION,
  validateAgentConfig,
  type MemoryPolicy,
  type PermissionProfile,
  type SkillMcpAllowlist,
  type SubAgentConfig,
} from "../packages/core/src/index.ts"

const now = Date.UTC(2026, 6, 5, 0, 0, 0)

const permissionProfile: PermissionProfile = {
  profileId: "profile:task0249",
  riskCeiling: "moderate",
  approvalRequiredFrom: "moderate",
  allowExternalNetwork: false,
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
  const owner = { ownerType: "sub_agent" as const, ownerId: agentId }
  return {
    owner,
    visibility: "private",
    readScopes: [owner],
    writeScope: owner,
    retentionPolicy: "long_term",
    writebackReviewRequired: true,
  }
}

function agentNameOnlySubAgent(overrides: Partial<SubAgentConfig> = {}): SubAgentConfig {
  const agentId = overrides.agentId ?? "agent:task0249"
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    agentType: "sub_agent",
    agentId,
    agentName: "현장 정리 담당",
    status: "enabled",
    role: "summarizer",
    personality: "Brief and precise.",
    specialtyTags: ["summary"],
    avoidTasks: [],
    memoryPolicy: memoryPolicy(agentId),
    capabilityPolicy: {
      permissionProfile,
      skillMcpAllowlist: allowlist,
      rateLimit: { maxConcurrentCalls: 1 },
    },
    profileVersion: 1,
    createdAt: now,
    updatedAt: now,
    teamIds: [],
    delegation: {
      enabled: true,
      maxParallelSessions: 1,
    },
    ...overrides,
  }
}

describe("task0249 agent config canonical name contract", () => {
  it("accepts new sub-agent configs that use agentName without legacy displayName or nickname", () => {
    const config = agentNameOnlySubAgent()

    expect(config).not.toHaveProperty("displayName")
    expect(config).not.toHaveProperty("nickname")
    expect(validateAgentConfig(config)).toMatchObject({ ok: true })
  })

  it("rejects deprecated displayName or nickname fields even when agentName is present", () => {
    const validation = validateAgentConfig({
      ...agentNameOnlySubAgent({ agentName: "품질 검토자" }),
      displayName: "",
      nickname: "",
    })

    expect(validation.ok).toBe(false)
    if (!validation.ok) {
      expect(validation.issues.map((issue) => issue.path)).toEqual(
        expect.arrayContaining(["$.displayName", "$.nickname"]),
      )
    }
  })

  it("rejects legacy configs without agentName at the canonical validation boundary", () => {
    const validation = validateAgentConfig({
      ...agentNameOnlySubAgent({ agentName: undefined }),
      displayName: "Legacy Researcher",
      nickname: "Legacy Researcher",
    })

    expect(validation.ok).toBe(false)
    if (!validation.ok) {
      expect(validation.issues.map((issue) => issue.path)).toEqual(
        expect.arrayContaining(["$.agentName", "$.displayName", "$.nickname"]),
      )
    }
  })

  it("rejects configs that have neither agentName nor valid legacy name fields", () => {
    const validation = validateAgentConfig({
      ...agentNameOnlySubAgent({ agentName: undefined }),
      displayName: "",
      nickname: "",
    })

    expect(validation.ok).toBe(false)
    if (!validation.ok) {
      expect(validation.issues.map((issue) => issue.path)).toEqual(
        expect.arrayContaining(["$.agentName", "$.displayName", "$.nickname"]),
      )
    }
  })

  it("keeps legacy agent name fields out of the BaseAgentConfig type", () => {
    const source = readFileSync("packages/core/src/contracts/sub-agent-orchestration.ts", "utf8")
    const baseAgentConfig = source.slice(
      source.indexOf("export interface BaseAgentConfig"),
      source.indexOf("export interface KnowbeeConfig"),
    )

    expect(baseAgentConfig).toContain("agentName: string")
    expect(baseAgentConfig).toContain("normalizedAgentName?: string")
    expect(baseAgentConfig).not.toContain("displayName?: string")
    expect(baseAgentConfig).not.toContain("nickname?: string")
    expect(baseAgentConfig).not.toContain("normalizedNickname?: string")
  })
})
