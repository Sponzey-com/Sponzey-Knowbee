import { describe, expect, it } from "vitest"
import {
  CONTRACT_SCHEMA_VERSION,
  validateAgentConfig,
  type KnowbeeAgentConfig,
  type MemoryPolicy,
  type PermissionProfile,
  type RuntimeIdentity,
  type SkillMcpAllowlist,
} from "../packages/core/src/index.ts"

const now = Date.UTC(2026, 6, 8, 0, 0, 0)

function owner(ownerId = "agent:knowbee", ownerType: RuntimeIdentity["owner"]["ownerType"] = "knowbee"): RuntimeIdentity["owner"] {
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

function memoryPolicy(overrides: Partial<MemoryPolicy> = {}): MemoryPolicy {
  const scopedOwner = owner()
  return {
    owner: scopedOwner,
    visibility: "private",
    readScopes: [scopedOwner],
    writeScope: scopedOwner,
    retentionPolicy: "long_term",
    writebackReviewRequired: true,
    ...overrides,
  }
}

function knowbeeConfig(memoryOverrides: Partial<MemoryPolicy> = {}): KnowbeeAgentConfig {
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
    memoryPolicy: memoryPolicy(memoryOverrides),
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

describe("task0788 memory policy compaction validation", () => {
  it("accepts valid optional compaction fields", () => {
    const result = validateAgentConfig(knowbeeConfig({
      rawWindowSize: 12_000,
      compactThreshold: 18_000,
      capsuleMode: "session_compaction",
      archiveReferenceMode: "summary_reference",
      handoffCapsuleAllowed: true,
      lastCompactedAt: now,
      capsuleCount: 3,
    }))

    expect(result.ok).toBe(true)
  })

  it("rejects invalid compaction numbers, enums, and booleans", () => {
    const result = validateAgentConfig(knowbeeConfig({
      rawWindowSize: -1,
      compactThreshold: 18_000.5,
      capsuleMode: "prompt_merge" as never,
      archiveReferenceMode: "raw_archive" as never,
      handoffCapsuleAllowed: "yes" as never,
      lastCompactedAt: -10,
      capsuleCount: 1.5,
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "$.memoryPolicy.rawWindowSize" }),
      expect.objectContaining({ path: "$.memoryPolicy.compactThreshold" }),
      expect.objectContaining({ path: "$.memoryPolicy.capsuleMode" }),
      expect.objectContaining({ path: "$.memoryPolicy.archiveReferenceMode" }),
      expect.objectContaining({ path: "$.memoryPolicy.handoffCapsuleAllowed" }),
      expect.objectContaining({ path: "$.memoryPolicy.lastCompactedAt" }),
      expect.objectContaining({ path: "$.memoryPolicy.capsuleCount" }),
    ]))
  })

  it("rejects a compact threshold smaller than the raw window size", () => {
    const result = validateAgentConfig(knowbeeConfig({
      rawWindowSize: 20_000,
      compactThreshold: 12_000,
    }))

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.memoryPolicy.compactThreshold",
      code: "contract_validation_failed",
      message: "compactThreshold must be greater than or equal to rawWindowSize.",
    })
  })
})

