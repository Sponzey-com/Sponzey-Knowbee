import { describe, expect, it } from "vitest"
import type {
  AgentRegistryEntry,
} from "../packages/core/src/orchestration/registry.ts"
import { evaluateDelegationEligibility } from "../packages/core/src/orchestration/delegation-eligibility.ts"
import { validateDispatchToChildExecutorInput } from "../packages/core/src/runs/orchestration-dispatch.ts"
import type { OrchestrationTask, SubAgentConfig } from "../packages/core/src/index.ts"

function config(): SubAgentConfig {
  return {
    schemaVersion: 1,
    agentType: "sub_agent",
    agentId: "agent:worker",
    agentName: "Worker",
    status: "enabled",
    role: "researcher",
    personality: "Precise",
    specialtyTags: ["research"],
    avoidTasks: [],
    memoryPolicy: {
      owner: { ownerType: "sub_agent", ownerId: "agent:worker" },
      visibility: "private",
      readScopes: [{ ownerType: "sub_agent", ownerId: "agent:worker" }],
      writeScope: { ownerType: "sub_agent", ownerId: "agent:worker" },
      retentionPolicy: "short_term",
      writebackReviewRequired: true,
    },
    capabilityPolicy: {
      permissionProfile: {
        profileId: "permission:worker",
        riskCeiling: "moderate",
        approvalRequiredFrom: "dangerous",
        allowExternalNetwork: true,
        allowFilesystemWrite: false,
        allowShellExecution: false,
        allowScreenControl: false,
        allowedPaths: [],
      },
      skillMcpAllowlist: {
        enabledSkillIds: ["skill:research"],
        enabledMcpServerIds: [],
        enabledToolNames: ["web_search"],
        disabledToolNames: [],
      },
      rateLimit: { maxConcurrentCalls: 1 },
    },
    profileVersion: 1,
    createdAt: 1,
    updatedAt: 1,
    teamIds: [],
    delegation: { enabled: true, maxParallelSessions: 1 },
  }
}

function entry(overrides: Partial<SubAgentConfig> = {}): AgentRegistryEntry {
  const agentConfig = { ...config(), ...overrides }
  return {
    agentId: agentConfig.agentId,
    agentName: agentConfig.agentName,
    status: agentConfig.status,
    role: agentConfig.role,
    specialtyTags: [...agentConfig.specialtyTags],
    avoidTasks: [...agentConfig.avoidTasks],
    teamIds: [],
    delegationEnabled: agentConfig.delegation.enabled,
    source: "config",
    config: agentConfig,
    permissionProfile: agentConfig.capabilityPolicy.permissionProfile,
    capabilityPolicy: agentConfig.capabilityPolicy,
    skillMcpSummary: {
      enabledSkillIds: ["skill:research"],
      enabledMcpServerIds: [],
      enabledToolNames: ["web_search"],
      disabledToolNames: [],
    },
    capabilitySummary: {
      agentId: agentConfig.agentId,
      available: true,
      availability: "available",
      enabledSkillIds: ["skill:research"],
      disabledSkillIds: [],
      enabledMcpServerIds: [],
      disabledMcpServerIds: [],
      enabledToolNames: ["web_search"],
      disabledToolNames: [],
      bindings: [],
      diagnostics: [],
      diagnosticReasonCodes: [],
    },
    modelSummary: {
      agentId: agentConfig.agentId,
      configured: true,
      available: true,
      availability: "available",
      diagnostics: [],
      diagnosticReasonCodes: [],
    },
    degradedReasonCodes: [],
    currentLoad: {
      activeSubSessions: 0,
      queuedSubSessions: 0,
      failedSubSessions: 0,
      completedSubSessions: 0,
      maxParallelSessions: 1,
      utilization: 0,
    },
    failureRate: { windowMs: 1, consideredSubSessions: 0, failedSubSessions: 0, value: 0 },
  }
}

function task(requiredCapabilities: string[] = ["skill:research"]): OrchestrationTask {
  return {
    taskId: "task:delegate",
    executionKind: "delegated_sub_agent",
    assignedAgentId: "agent:worker",
    scope: {
      goal: "Collect evidence",
      intentType: "research",
      actionType: "collect",
      constraints: [],
      expectedOutputs: [],
      reasonCodes: [],
    },
    requiredCapabilities,
    resourceLockIds: [],
  }
}

describe("task1193 delegation eligibility", () => {
  it("accepts an active isolated agent with the required capability", () => {
    expect(evaluateDelegationEligibility({ task: task(), agent: entry() })).toEqual({
      state: "eligible",
      stateTrace: ["candidate_loaded", "policy_evaluated", "eligible"],
      reasonCodes: ["delegation_policy_satisfied"],
    })
  })

  it("rejects a disabled agent", () => {
    expect(evaluateDelegationEligibility({
      task: task(),
      agent: entry({ status: "disabled" }),
    }).reasonCodes).toContain("agent_disabled")
  })

  it("rejects a capability absent from the active policy", () => {
    expect(evaluateDelegationEligibility({
      task: task(["skill:code-review"]),
      agent: entry(),
    }).reasonCodes).toContain("capability_denied")
  })

  it("rejects cross-agent memory access", () => {
    const base = config()
    expect(evaluateDelegationEligibility({
      task: task(),
      agent: entry({
        memoryPolicy: {
          ...base.memoryPolicy,
          readScopes: [{ ownerType: "sub_agent", ownerId: "agent:other" }],
        },
      }),
    }).reasonCodes).toContain("memory_scope_violation")
  })

  it("rejects permission escalation requested by a stale plan", () => {
    const agent = entry()
    expect(evaluateDelegationEligibility({
      task: task(["shell_execution"]),
      agent,
    }).reasonCodes).toContain("permission_required")
    expect(validateDispatchToChildExecutorInput({
      task: task(["shell_execution"]),
      agent,
    })).toMatchObject({ ok: false, reasonCode: "permission_required" })
  })
})
