import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  closeDb,
  upsertMcpServerCatalogEntry,
  upsertSkillCatalogEntry,
} from "../packages/core/src/db/index.js"
import {
  CONTRACT_SCHEMA_VERSION,
  type MemoryPolicy,
  type PermissionProfile,
  type RuntimeIdentity,
  type SkillMcpAllowlist,
  type StructuredTaskScope,
  type SubAgentConfig,
} from "../packages/core/src/index.ts"
import { buildAgentPromptBundle } from "../packages/core/src/orchestration/prompt-bundle.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const tempDirs: string[] = []
const now = Date.UTC(2026, 6, 6, 0, 0, 0)

function owner(ownerId = "agent:researcher"): RuntimeIdentity["owner"] {
  return { ownerType: ownerId === "agent:knowbee" ? "knowbee" : "sub_agent", ownerId }
}

const allowlist: SkillMcpAllowlist = {
  enabledSkillIds: ["skill:research"],
  enabledMcpServerIds: ["mcp:browser"],
  enabledToolNames: ["web_search"],
  disabledToolNames: ["shell_exec"],
  secretScopeId: "scope:knowbee",
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

function memoryPolicy(ownerId = "agent:researcher"): MemoryPolicy {
  const scopedOwner = owner(ownerId)
  return {
    owner: scopedOwner,
    visibility: "private",
    readScopes: [scopedOwner],
    writeScope: scopedOwner,
    retentionPolicy: "long_term",
    writebackReviewRequired: true,
  }
}

function subAgent(): SubAgentConfig {
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    agentType: "sub_agent",
    agentId: "agent:researcher",
    agentName: "Researcher",
    displayName: "Researcher",
    nickname: "Researcher",
    status: "enabled",
    role: "Research worker",
    personality: "Precise.",
    specialtyTags: ["research"],
    avoidTasks: [],
    memoryPolicy: memoryPolicy("agent:researcher"),
    capabilityPolicy: {
      permissionProfile,
      skillMcpAllowlist: allowlist,
      rateLimit: { maxConcurrentCalls: 2 },
    },
    teamIds: [],
    delegation: {
      enabled: true,
      maxParallelSessions: 1,
    },
    profileVersion: 1,
    createdAt: now,
    updatedAt: now,
  }
}

const taskScope: StructuredTaskScope = {
  goal: "Answer with configured capabilities.",
  intentType: "diagnostic",
  actionType: "capability_prompt_wording",
  constraints: ["Use structured context."],
  reasonCodes: ["capability_context_required"],
  expectedOutputs: [{
    outputId: "answer",
    kind: "text",
    description: "Capability wording summary.",
    required: true,
    acceptance: {
      requiredEvidenceKinds: [],
      artifactRequired: false,
      reasonCodes: ["wording_checked"],
    },
  }],
}

function useTempConfig(): void {
  closeDb()
  const stateDir = mkdtempSync(join(tmpdir(), "knowbee-task0469-prompt-wording-"))
  tempDirs.push(stateDir)
  initializeTestDbRuntime(stateDir)
}

beforeEach(() => {
  useTempConfig()
})

afterEach(() => {
  closeDb()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task0469 prompt bundle capability wording", () => {
  it("renders work ability and external feature connection wording in capability fragments", () => {
    upsertSkillCatalogEntry(
      {
        skillId: "skill:research",
        displayName: "Research",
        status: "enabled",
        risk: "safe",
        toolNames: ["web_search"],
      },
      { now },
    )
    upsertMcpServerCatalogEntry(
      {
        mcpServerId: "mcp:browser",
        displayName: "Browser",
        status: "enabled",
        risk: "external",
        toolNames: ["mcp__browser__search"],
      },
      { now },
    )

    const result = buildAgentPromptBundle({
      agent: subAgent(),
      taskScope,
      promptSources: [],
      now: () => now,
    })
    const renderedPrompt = result.bundle.renderedPrompt

    expect(renderedPrompt).toContain("Common work ability and external feature connection catalog references")
    expect(renderedPrompt).toContain("Agent-specific work ability and external feature connection binding summary")
    expect(renderedPrompt).toContain("availableWorkAbilityIds: skill:research")
    expect(renderedPrompt).toContain("availableExternalFeatureConnectionIds: mcp:browser")
    expect(renderedPrompt).not.toContain("Skill/MCP")
    expect(renderedPrompt).not.toContain("Skill, MCP")
    expect(renderedPrompt).not.toContain("enabledSkills:")
    expect(renderedPrompt).not.toContain("enabledMcpServers:")
    expect(renderedPrompt).not.toContain("availableSkillIds:")
    expect(renderedPrompt).not.toContain("availableMcpServerIds:")
  })

  it("does not keep old capability prompt wording in prompt bundle sources", () => {
    const sourceFiles = [
      "packages/core/src/orchestration/prompt-bundle.ts",
      "packages/core/src/orchestration/prompt-bundle.js",
    ]
    const combined = sourceFiles
      .map((filePath) => readFileSync(join(process.cwd(), filePath), "utf8"))
      .join("\n")

    expect(combined).not.toContain("Common Skill/MCP catalog references")
    expect(combined).not.toContain("Agent-specific Skill/MCP binding summary")
    expect(combined).not.toContain("Skill, MCP")
    expect(combined).not.toContain("enabledSkills:")
    expect(combined).not.toContain("enabledMcpServers:")
    expect(combined).not.toContain("availableSkillIds:")
    expect(combined).not.toContain("availableMcpServerIds:")
  })
})
