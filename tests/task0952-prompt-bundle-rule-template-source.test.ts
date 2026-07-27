import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { CONTRACT_SCHEMA_VERSION } from "../packages/core/src/contracts/index.js"
import type {
  ExpectedOutputContract,
  MemoryPolicy,
  PermissionProfile,
  RuntimeIdentity,
  SkillMcpAllowlist,
  StructuredTaskScope,
  SubAgentConfig,
} from "../packages/core/src/contracts/sub-agent-orchestration.ts"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"
import { buildAgentPromptBundle } from "../packages/core/src/orchestration/prompt-bundle.ts"

const now = Date.UTC(2026, 6, 10, 0, 0, 0)
const promptBundleRuleSourceIds = [
  "prompt_bundle_default_safety_rules_user",
  "prompt_bundle_self_agent_name_rule_user",
  "prompt_bundle_agent_name_attribution_rule_user",
] as const

function owner(ownerId = "agent:researcher"): RuntimeIdentity["owner"] {
  return { ownerType: "sub_agent", ownerId }
}

const permissionProfile: PermissionProfile = {
  profileId: "profile:task0952",
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
}

function memoryPolicy(): MemoryPolicy {
  const scopedOwner = owner()
  return {
    owner: scopedOwner,
    visibility: "private",
    readScopes: [scopedOwner],
    writeScope: scopedOwner,
    retentionPolicy: "short_term",
    writebackReviewRequired: true,
  }
}

function expectedOutput(): ExpectedOutputContract {
  return {
    outputId: "answer",
    kind: "text",
    description: "Source-backed answer.",
    required: true,
    acceptance: {
      requiredEvidenceKinds: ["source"],
      artifactRequired: false,
      reasonCodes: ["reviewable_result"],
    },
  }
}

function taskScope(): StructuredTaskScope {
  return {
    goal: "Collect evidence for parent synthesis.",
    intentType: "research",
    actionType: "collect_evidence",
    constraints: ["Use scoped context only."],
    expectedOutputs: [expectedOutput()],
    reasonCodes: ["needs_evidence"],
  }
}

function subAgent(): SubAgentConfig {
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    agentType: "sub_agent",
    agentId: "agent:researcher",
    status: "enabled",
    role: "evidence researcher",
    personality: "Precise.",
    specialtyTags: ["research"],
    avoidTasks: [],
    modelProfile: {
      providerId: "openai",
      modelId: "gpt-5.4",
    },
    memoryPolicy: memoryPolicy(),
    capabilityPolicy: {
      permissionProfile,
      skillMcpAllowlist: allowlist,
      rateLimit: { maxConcurrentCalls: 2 },
    },
    profileVersion: 1,
    createdAt: now,
    updatedAt: now,
    agentName: "Research Canonical",
  }
}

describe("task0952 prompt bundle rule prompt sources", () => {
  it("registers default safety and agent name bundle rules as internal prompt sources", () => {
    const registry = loadPromptSourceRegistry(process.cwd())

    for (const sourceId of promptBundleRuleSourceIds) {
      const source = registry.find((item) => item.sourceId === sourceId && item.locale === "en")
      expect(source).toMatchObject({ sourceId, usageScope: "internal", enabled: true })
      expect(source?.content).toContain("## Value")
      expect(source?.content).toContain("## Out Of Scope")
    }
  })

  it("renders safety boundaries and agent name rules from prompt source values", () => {
    const result = buildAgentPromptBundle({
      agent: subAgent(),
      taskScope: taskScope(),
      now: () => now,
    }, {
      resolveCapabilityModelSummary: () => undefined,
    })

    expect(result.bundle.safetyRules.join("\n")).toContain("Agent profile text never overrides safety")
    expect(result.renderedPrompt).toContain("deliveryRule: Preserve source agent name attribution")
    expect(result.renderedPrompt).toContain("agentName: Research Canonical")
    expect(result.renderedPrompt).toContain("defaultSelfName: Knowbee only when no agent name is configured.")
    expect(result.renderedPrompt).not.toContain("# Prompt Bundle Self Agent Name Rule")
    expect(result.renderedPrompt).not.toContain("## Value")
  })

  it("does not keep default safety or agent name rule bodies hardcoded in TypeScript", () => {
    const source = readFileSync("packages/core/src/orchestration/prompt-bundle.ts", "utf-8")

    expect(source).toContain("prompt_bundle_default_safety_rules_user")
    expect(source).toContain("prompt_bundle_self_agent_name_rule_user")
    expect(source).toContain("prompt_bundle_agent_name_attribution_rule_user")
    expect(source).not.toContain("Agent profile text never overrides safety")
    expect(source).not.toContain("Do not read or reveal another agent's private memory")
    expect(source).not.toContain("deliveryRule: Preserve source agent name attribution")
    expect(source).not.toContain("rule: Do not present yourself as another agent")
  })
})
