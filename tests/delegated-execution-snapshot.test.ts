import { describe, expect, it } from "vitest"
import { CONTRACT_SCHEMA_VERSION } from "../packages/core/src/contracts/index.ts"
import {
  buildDelegatedExecutionSnapshot,
  validateDelegatedExecutionSnapshot,
} from "../packages/core/src/contracts/delegated-execution-snapshot.ts"
import type {
  AgentPromptBundle,
  CapabilityPolicy,
  CommandRequest,
} from "../packages/core/src/contracts/sub-agent-orchestration.ts"
import {
  validateWorkHandoffPackage,
  type WorkHandoffPackage,
} from "../packages/core/src/contracts/work-record.ts"

function capabilityPolicy(): CapabilityPolicy {
  return {
    permissionProfile: {
    profileId: "permission:research",
    riskCeiling: "moderate",
    approvalRequiredFrom: "sensitive",
    allowExternalNetwork: true,
    allowFilesystemWrite: false,
    allowShellExecution: false,
    allowScreenControl: false,
    allowedPaths: [],
    },
    skillMcpAllowlist: {
    enabledSkillIds: ["skill:web-research"],
    enabledMcpServerIds: ["mcp:market"],
    enabledToolNames: ["web_search"],
    disabledToolNames: ["shell"],
    },
    rateLimit: { maxConcurrentCalls: 2 },
  }
}

const command = {
  commandRequestId: "command:finance",
  subSessionId: "sub:finance",
  targetAgentId: "agent:finance",
  targetAgentNameSnapshot: "행랑아범",
  taskScope: {
    goal: "시장 가격 확인",
    actionType: "research",
    constraints: [],
    expectedOutputs: [],
    reasonCodes: [],
  },
  contextPackageIds: [],
} as CommandRequest

const handoff = {
  schemaVersion: 1,
  handoff_id: "handoff:command:finance",
  work_id: "work:sub:finance",
  parent_work_id: "work:run-parent",
  parent_step_id: "step:research",
  parent_agent_name: "마당쇠",
  target_agent_name: "행랑아범",
  task_goal: "시장 가격 확인",
  user_request_summary: "현재 가격을 확인해줘",
  request_diagnosis: {
    diagnosis_summary: "시장 가격 확인을 직접 하위 실행자에게 위임합니다.",
    intent: "delegated_work",
    goal: "시장 가격 확인",
    constraints: [],
    missing_information: [],
    risk: "low",
    confidence: "high",
    recommended_action: "delegate",
    reason: "웹 조사 capability가 필요합니다.",
  },
  step_plan: [{
    step_id: "step:research:delegate",
    owner_agent_name: "행랑아범",
    action_type: "delegate",
    input_refs: ["work:run-parent"],
    expected_output: "출처가 있는 현재 가격",
    completion_criteria: "현재 가격에 출처 포함",
    status: "pending",
  }],
  current_step: {
    step_id: "step:research:delegate",
    owner_agent_name: "행랑아범",
    action_type: "delegate",
    input_refs: ["work:run-parent"],
    expected_output: "출처가 있는 현재 가격",
    completion_criteria: "현재 가격에 출처 포함",
    status: "pending",
  },
  context: [],
  constraints: [],
  allowed_tools: ["web_search"],
  disallowed_actions: ["shell"],
  expected_output: "출처가 있는 현재 가격",
  quality_criteria: ["현재 가격에 출처 포함"],
  validation_method: "출처와 값 확인",
  retry_limit: 2,
  stop_condition: "검증 성공 또는 해결 경로 소진",
  failure_recovery_policy: "Change the strategy and source before retrying.",
  deadline_or_budget: "2 attempts",
  memory_visibility: "explicit_handoff_only",
  return_format: "ChildWorkResult",
} as WorkHandoffPackage

function promptBundle(policy = capabilityPolicy()): AgentPromptBundle {
  return {
    identity: {
      schemaVersion: CONTRACT_SCHEMA_VERSION,
      entityType: "sub_agent",
      entityId: "agent:finance",
      owner: { ownerType: "sub_agent", ownerId: "agent:finance" },
      idempotencyKey: "prompt:finance",
    },
    bundleId: "bundle:finance",
    agentId: "agent:finance",
    agentType: "sub_agent",
    role: "시장 조사",
    agentNameSnapshot: "행랑아범",
    memoryPolicy: {
      owner: { ownerType: "sub_agent", ownerId: "agent:finance" },
      visibility: "private",
      readScopes: [],
      writeScope: { ownerType: "sub_agent", ownerId: "agent:finance" },
      retentionPolicy: "short_term",
      writebackReviewRequired: true,
    },
    capabilityPolicy: policy,
    modelProfileSnapshot: { providerId: "openai", modelId: "gpt-test" },
    taskScope: command.taskScope,
    safetyRules: [],
    sourceProvenance: [],
    promptChecksum: "sha256:prompt",
    createdAt: 1,
  }
}

describe("delegated execution snapshot", () => {
  it("deep snapshots handoff, model and capability bindings", () => {
    const validation = validateWorkHandoffPackage(handoff)
    expect(validation.ok, JSON.stringify(validation.issues, null, 2)).toBe(true)
    const policy = capabilityPolicy()
    const bundle = promptBundle(policy)
    const built = buildDelegatedExecutionSnapshot({
      command,
      handoff,
      agent: { agentId: "agent:finance", agentName: "행랑아범" },
      promptBundle: bundle,
    })
    expect(built.ok).toBe(true)
    if (!built.ok) return

    policy.skillMcpAllowlist.enabledSkillIds.push("skill:mutated")
    bundle.modelProfileSnapshot!.modelId = "mutated-model"

    expect(built.snapshot.capabilityPolicy.skillMcpAllowlist.enabledSkillIds).toEqual(["skill:web-research"])
    expect(built.snapshot.modelProfile?.modelId).toBe("gpt-test")
    expect(Object.isFrozen(built.snapshot)).toBe(true)
    expect(validateDelegatedExecutionSnapshot(built.snapshot)).toEqual({
      valid: true,
      reasonCode: "delegated_execution_snapshot_valid",
    })
  })

  it("rejects a handoff for another target before child queueing", () => {
    expect(buildDelegatedExecutionSnapshot({
      command,
      handoff: { ...handoff, target_agent_name: "다른 실행자" },
      agent: { agentId: "agent:finance", agentName: "행랑아범" },
      promptBundle: promptBundle(),
    })).toEqual({ ok: false, reasonCode: "handoff_target_mismatch" })
  })

  it("detects post-build snapshot tampering by fingerprint", () => {
    const built = buildDelegatedExecutionSnapshot({
      command,
      handoff,
      agent: { agentId: "agent:finance", agentName: "행랑아범" },
      promptBundle: promptBundle(),
    })
    if (!built.ok) throw new Error("snapshot expected")
    const tampered = structuredClone(built.snapshot)
    tampered.agent.agentId = "agent:other"
    expect(validateDelegatedExecutionSnapshot(tampered)).toEqual({
      valid: false,
      reasonCode: "delegated_execution_snapshot_fingerprint_mismatch",
    })
  })

  it("rejects a valid snapshot used with another runtime command", () => {
    const built = buildDelegatedExecutionSnapshot({
      command,
      handoff,
      agent: { agentId: "agent:finance", agentName: "행랑아범" },
      promptBundle: promptBundle(),
    })
    if (!built.ok) throw new Error("snapshot expected")

    expect(validateDelegatedExecutionSnapshot(built.snapshot, {
      commandRequestId: "command:other",
      subSessionId: "sub:finance",
      agentId: "agent:finance",
      promptBundleId: "bundle:finance",
    })).toEqual({
      valid: false,
      reasonCode: "delegated_execution_snapshot_runtime_mismatch",
    })
  })
})
