import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  CONTRACT_SCHEMA_VERSION,
  type KnowbeeAgentConfig,
  type MemoryPolicy,
  type PermissionProfile,
  type RuntimeIdentity,
  type SkillMcpAllowlist,
  type SubAgentConfig,
  validateAgentConfig,
} from "../packages/core/src/index.ts"

const now = Date.UTC(2026, 6, 6, 0, 0, 0)

function owner(
  ownerId = "agent:knowbee",
  ownerType: RuntimeIdentity["owner"]["ownerType"] = "knowbee",
): RuntimeIdentity["owner"] {
  return { ownerType, ownerId }
}

const permissionProfile: PermissionProfile = {
  profileId: "profile:local",
  riskCeiling: "moderate",
  approvalRequiredFrom: "moderate",
  allowExternalNetwork: false,
  allowFilesystemWrite: false,
  allowShellExecution: false,
  allowScreenControl: false,
  allowedPaths: [],
}

const skillMcpAllowlist: SkillMcpAllowlist = {
  enabledSkillIds: [],
  enabledMcpServerIds: [],
  enabledToolNames: [],
  disabledToolNames: [],
  secretScopeId: "agent:knowbee",
}

const memoryPolicy: MemoryPolicy = {
  owner: owner(),
  visibility: "private",
  readScopes: [owner()],
  writeScope: owner(),
  retentionPolicy: "long_term",
  writebackReviewRequired: true,
}

function knowbeeConfig(): KnowbeeAgentConfig {
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    agentType: "knowbee",
    agentId: "agent:knowbee",
    agentName: "Knowbee",
    status: "enabled",
    role: "main coordinator",
    personality: "Direct and useful.",
    specialtyTags: ["coordination"],
    avoidTasks: [],
    memoryPolicy,
    capabilityPolicy: {
      permissionProfile,
      skillMcpAllowlist,
      rateLimit: { maxConcurrentCalls: 2 },
    },
    profileVersion: 1,
    createdAt: now,
    updatedAt: now,
    coordinator: {
      defaultMode: "single_knowbee",
      fallbackMode: "single_knowbee",
      maxDelegatedSubSessions: 2,
    },
  }
}

function subAgentConfig(): SubAgentConfig {
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    agentType: "sub_agent",
    agentId: "agent:researcher",
    agentName: "Researcher",
    status: "enabled",
    role: "research worker",
    personality: "Evidence focused.",
    specialtyTags: ["research"],
    avoidTasks: [],
    memoryPolicy: {
      ...memoryPolicy,
      owner: owner("agent:researcher", "sub_agent"),
      readScopes: [owner("agent:researcher", "sub_agent")],
      writeScope: owner("agent:researcher", "sub_agent"),
    },
    capabilityPolicy: {
      permissionProfile,
      skillMcpAllowlist: {
        ...skillMcpAllowlist,
        secretScopeId: "agent:researcher",
      },
      rateLimit: { maxConcurrentCalls: 1 },
    },
    profileVersion: 1,
    createdAt: now,
    updatedAt: now,
    teamIds: ["team:research"],
    delegation: {
      enabled: true,
      maxParallelSessions: 1,
    },
  }
}

describe("task0560 agent config name validation boundary", () => {
  it("accepts agent configs that use agentName as the only user-facing name", () => {
    expect(validateAgentConfig(knowbeeConfig()).ok).toBe(true)
    expect(validateAgentConfig(subAgentConfig()).ok).toBe(true)
  })

  it("accepts normalizedAgentName when it matches the normalized agentName", () => {
    const validation = validateAgentConfig({
      ...subAgentConfig(),
      agentName: "Researcher One",
      normalizedAgentName: "researcher one",
    })

    expect(validation.ok).toBe(true)
  })

  it("rejects normalizedAgentName when it contradicts agentName", () => {
    const validation = validateAgentConfig({
      ...subAgentConfig(),
      agentName: "Researcher One",
      normalizedAgentName: "writer one",
    })

    expect(validation.ok).toBe(false)
    if (!validation.ok) {
      expect(validation.issues.map((issue) => issue.path)).toContain("$.normalizedAgentName")
    }
  })

  it("rejects agentName when it equals agentId", () => {
    const validation = validateAgentConfig({
      ...subAgentConfig(),
      agentId: "agent:researcher",
      agentName: " agent:researcher ",
    })

    expect(validation.ok).toBe(false)
    if (!validation.ok) {
      expect(validation.issues).toContainEqual({
        path: "$.agentName",
        code: "contract_validation_failed",
        message: "agentName must be a user-facing name, not the internal agentId.",
      })
    }
  })

  it("rejects agentName when it looks like an internal identifier", () => {
    const validation = validateAgentConfig({
      ...subAgentConfig(),
      agentName: "session:researcher",
    })

    expect(validation.ok).toBe(false)
    if (!validation.ok) {
      expect(validation.issues).toContainEqual({
        path: "$.agentName",
        code: "contract_validation_failed",
        message: "agentName must not use internal identifier syntax.",
      })
    }
  })

  it("rejects normalizedAgentName when it looks like an internal identifier", () => {
    const validation = validateAgentConfig({
      ...subAgentConfig(),
      agentName: "agent:researcher",
      normalizedAgentName: "agent:researcher",
    })

    expect(validation.ok).toBe(false)
    if (!validation.ok) {
      expect(validation.issues).toContainEqual({
        path: "$.normalizedAgentName",
        code: "contract_validation_failed",
        message: "normalizedAgentName must not use internal identifier syntax.",
      })
    }
  })

  it.each([
    ["main agent", knowbeeConfig],
    ["sub-agent", subAgentConfig],
  ])("rejects legacy displayName and nickname fields for the %s", (_label, createConfig) => {
    const legacyOnly = {
      ...createConfig(),
      agentName: undefined,
      displayName: "Legacy Display Name",
      display_name: "Legacy Display Name",
      nameForDisplay: "Legacy Display Name",
      nickname: "Legacy Nickname",
      normalizedNickname: "legacy nickname",
    }

    const validation = validateAgentConfig(legacyOnly)

    expect(validation.ok).toBe(false)
    expect(validation.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining([
        "$.agentName",
        "$.displayName",
        "$.display_name",
        "$.nameForDisplay",
        "$.nickname",
        "$.normalizedNickname",
      ]),
    )
  })

  it("keeps validateAgentConfigNameFields from falling back to legacy name fields", () => {
    const source = readFileSync("packages/core/src/contracts/sub-agent-orchestration.ts", "utf8")

    expect(source).toContain('hasNonEmptyAgentName(record, "agentName", path, issues)')
    expect(source).not.toContain('hasNonEmptyString(record, "displayName", path, issues)')
    expect(source).not.toContain('hasNonEmptyNickname(record, "nickname", path, issues)')
    expect(source).not.toContain('hasNonEmptyNickname(record, "normalizedNickname", path, issues)')
  })

  it("documents that user-facing agent names must not use internal identifiers", () => {
    const source = readFileSync("prompts/identity.md", "utf8")

    expect(source).toContain(
      "Agent names must not equal internal IDs or use internal identifier syntax such as `agent:`, `team:`, `session:`, or `sub_session:`.",
    )
  })
})
