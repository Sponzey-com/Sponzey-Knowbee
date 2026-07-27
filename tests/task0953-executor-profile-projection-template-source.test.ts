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
import {
  buildAgentPromptBundle,
  type ExecutorProfilePromptProjection,
} from "../packages/core/src/orchestration/prompt-bundle.ts"

const now = Date.UTC(2026, 6, 10, 0, 0, 0)

function owner(ownerId = "agent:researcher"): RuntimeIdentity["owner"] {
  return { ownerType: "sub_agent", ownerId }
}

const permissionProfile: PermissionProfile = {
  profileId: "profile:task0953",
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
    goal: "Route work to a direct executor.",
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
    agentId: "agent:current",
    status: "enabled",
    role: "current coordinator",
    personality: "Precise.",
    specialtyTags: ["routing"],
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
    agentName: "Current Coordinator",
  }
}

function projection(): ExecutorProfilePromptProjection {
  return {
    currentExecutorId: "agent:current",
    graphSource: "topology:test",
    selectableExecutors: [{
      schemaVersion: 1,
      executorId: "agent:researcher",
      agentName: "Researcher",
      roleName: "Research",
      definition: "Collect evidence.",
      does: ["search"],
      delegationScope: ["direct"],
      expectedOutputs: ["source-backed answer"],
      handoffStyle: "handoff",
      declineCriteria: ["outside scope"],
      riskBoundary: ["no shell"],
      connectedNextExecutorIds: ["agent:reviewer"],
    }],
    diagnosticExecutors: [{
      schemaVersion: 1,
      executorId: "agent:archived",
      agentName: "Archived",
      roleName: "Archive",
      definition: "Reference-only node.",
      does: [],
      delegationScope: [],
      expectedOutputs: [],
      handoffStyle: "reference",
      declineCriteria: [],
      riskBoundary: [],
      connectedNextExecutorIds: [],
    }],
    connections: [{ fromExecutorId: "agent:current", toExecutorId: "agent:researcher", relation: "handoff" }],
  }
}

describe("task0953 executor profile projection prompt source", () => {
  it("registers the executor profile projection template as an internal prompt source", () => {
    const registry = loadPromptSourceRegistry(process.cwd())
    const source = registry.find((item) => item.sourceId === "prompt_bundle_executor_profile_projection_user" && item.locale === "en")

    expect(source).toMatchObject({
      sourceId: "prompt_bundle_executor_profile_projection_user",
      usageScope: "internal",
      enabled: true,
    })
    expect(source?.content).toContain("## Value")
    expect(source?.content).toContain("## Out Of Scope")
  })

  it("renders executor projection policy and dynamic executor data from the source template", () => {
    const result = buildAgentPromptBundle({
      agent: subAgent(),
      taskScope: taskScope(),
      executorProfileProjection: projection(),
      now: () => now,
    }, {
      resolveCapabilityModelSummary: () => undefined,
    })

    expect(result.renderedPrompt).toContain("Runtime code must not route by scanning this text")
    expect(result.renderedPrompt).toContain("[Available direct executors for current agent]")
    expect(result.renderedPrompt).toContain("agentName: Researcher")
    expect(result.renderedPrompt).toContain("[Diagnostic executors - not selectable here]")
    expect(result.renderedPrompt).toContain("agent:current -> agent:researcher (handoff)")
    expect(result.renderedPrompt).not.toContain("# Prompt Bundle Executor Profile Projection")
    expect(result.renderedPrompt).not.toContain("## Value")
  })

  it("does not keep executor projection policy bodies hardcoded in TypeScript", () => {
    const source = readFileSync("packages/core/src/orchestration/prompt-bundle.ts", "utf-8")

    expect(source).toContain("prompt_bundle_executor_profile_projection_user")
    expect(source).not.toContain("Projection policy: this section is structured context for model judgment.")
    expect(source).not.toContain("Do not invent or select executor ids")
    expect(source).not.toContain("[Diagnostic executors - not selectable here]")
  })
})
