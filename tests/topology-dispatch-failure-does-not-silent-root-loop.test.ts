import { describe, expect, it } from "vitest"
import { CONTRACT_SCHEMA_VERSION } from "../packages/core/src/contracts/index.js"
import type { OrchestrationPlan } from "../packages/core/src/contracts/sub-agent-orchestration.js"
import type { AgentRegistryEntry } from "../packages/core/src/orchestration/registry.js"
import {
  type DelegatedTaskDispatchResult,
  validateDispatchToChildExecutorInput,
} from "../packages/core/src/runs/orchestration-dispatch.ts"
import {
  buildTopologyDispatchFollowupDirective,
  resolveTopologyDispatchFollowupDecision,
} from "../packages/core/src/runs/topology-dispatch-fallback.ts"

function orchestrationPlan(agentIds = ["workspace:draft:node:finance"]): OrchestrationPlan {
  return {
    identity: {
      schemaVersion: CONTRACT_SCHEMA_VERSION,
      entityType: "session",
      entityId: "session:test",
      owner: { ownerType: "knowbee", ownerId: "agent:knowbee" },
      idempotencyKey: "plan:test",
    },
    planId: "plan:test",
    parentRunId: "run:test",
    parentRequestId: "request:test",
    directKnowbeeTasks: [],
    delegatedTasks: agentIds.map((agentId, index) => ({
      taskId: `task:${index + 1}`,
      executionKind: "delegated_sub_agent",
      assignedAgentId: agentId,
      scope: {
        goal: "Handle delegated request.",
        intentType: "task_intake",
        actionType: "run_task",
        constraints: [],
        expectedOutputs: [{
          outputId: "answer",
          kind: "text",
          description: "Final answer.",
          required: true,
          acceptance: {
            requiredEvidenceKinds: [],
            artifactRequired: false,
            reasonCodes: [],
          },
        }],
        reasonCodes: [],
      },
      requiredCapabilities: [],
      resourceLockIds: [],
      planningTrace: {
        selectedExecutorId: agentId,
        reasonCodes: ["execution_decision_selected_executor"],
      },
    })),
    dependencyEdges: [],
    resourceLocks: [],
    parallelGroups: [],
    approvalRequirements: [],
    fallbackStrategy: {
      mode: "self_solve",
      reasonCode: "fallback_self_solve",
      currentExecutorId: "agent:knowbee",
    },
    createdAt: 1,
  } as OrchestrationPlan
}

function failedDispatch(agentId = "workspace:draft:node:finance"): DelegatedTaskDispatchResult {
  return {
    attempted: 1,
    completed: 0,
    failed: 1,
    skipped: 0,
    outcomes: [{
      taskId: "task:1",
      subSessionId: "sub-session:1",
      agentId,
      agentName: "현장 금융 담당",
      agentSource: "topology",
      topologyId: "workspace:draft",
      topologyExecutorId: "node:finance",
      status: "failed",
      reasonCode: "prompt_bundle_preflight_failed",
      summary: "Prompt bundle preflight failed.",
    }],
  }
}

function topologyAgent(agentId = "workspace:draft:node:finance"): AgentRegistryEntry {
  return {
    agentId,
    displayName: "행랑아범",
    status: "enabled",
    role: "finance worker",
    specialtyTags: [],
    avoidTasks: [],
    teamIds: [],
    delegationEnabled: true,
    source: "topology",
  } as AgentRegistryEntry
}

describe("topology dispatch failure follow-up", () => {
  it("blocks topology child dispatch unless a validated executor decision selected the target", () => {
    const task = orchestrationPlan().delegatedTasks[0]
    const agent = topologyAgent()
    const taskWithoutDecision = { ...task }
    delete taskWithoutDecision.planningTrace

    const withoutDecision = validateDispatchToChildExecutorInput({
      task: taskWithoutDecision,
      agent,
    })
    expect(withoutDecision).toMatchObject({
      ok: false,
      reasonCode: "validated_execution_decision_required",
    })

    const mismatchedDecision = validateDispatchToChildExecutorInput({
      task: {
        ...task,
        planningTrace: {
          selectedExecutorId: "workspace:draft:node:research",
          reasonCodes: ["execution_decision_selected_executor"],
        },
      },
      agent,
    })
    expect(mismatchedDecision).toMatchObject({
      ok: false,
      reasonCode: "validated_execution_decision_executor_mismatch",
    })

    const validated = validateDispatchToChildExecutorInput({ task, agent })
    expect(validated).toMatchObject({
      ok: true,
      selectedExecutorId: "workspace:draft:node:finance",
    })
  })

  it("turns a failed topology dispatch into explicit self solve instead of silent root-loop fallback", () => {
    const decision = resolveTopologyDispatchFollowupDecision({
      dispatchResult: failedDispatch(),
      plan: orchestrationPlan(),
      currentExecutorId: "agent:knowbee",
      availableDirectChildExecutorIds: ["workspace:draft:node:finance"],
    })

    expect(decision).toMatchObject({
      action: "self_solve",
      reasonCode: "self_solve_after_delegation_failure",
      blockedByPreflight: true,
      rootLoopContinuation: "allowed_with_trace",
    })
    expect(decision?.summary).toContain("현재 에이전트")
    expect(decision?.summary).not.toContain("현재 실행자")
    expect(decision?.failedExecutorIds).toEqual(["workspace:draft:node:finance"])
    expect(decision?.failedExecutorNames).toEqual(["현장 금융 담당"])
    expect(decision ? buildTopologyDispatchFollowupDirective(decision) : null).toBeNull()
  })

  it("blocks root-loop fallback when a direct child alternative can be evaluated for redelegation", () => {
    const decision = resolveTopologyDispatchFollowupDecision({
      dispatchResult: failedDispatch("workspace:draft:node:finance"),
      plan: orchestrationPlan(["workspace:draft:node:finance"]),
      currentExecutorId: "agent:knowbee",
      availableDirectChildExecutorIds: [
        "workspace:draft:node:finance",
        "workspace:draft:node:research",
      ],
    })

    expect(decision).toMatchObject({
      action: "redelegate",
      reasonCode: "redelegate_after_delegation_failure",
      rootLoopContinuation: "blocked",
      alternativeExecutorIds: ["workspace:draft:node:research"],
    })
    expect(decision?.summary).toContain("직속 하위 서브 에이전트")
    expect(decision?.summary).not.toContain("direct child 실행자")
    expect(decision ? buildTopologyDispatchFollowupDirective(decision) : null).toEqual({
      kind: "awaiting_user",
      preview: "",
      summary: "서브 에이전트 위임 실패 후 대체 가능한 직속 하위 서브 에이전트 후보가 있어 재위임 판단이 필요합니다.",
      userMessage: "서브 에이전트 위임 실패 후 대체 가능한 직속 하위 서브 에이전트 후보가 있어 재위임 판단이 필요합니다.",
      userMessageSource: "runtime_deterministic",
      reason: "서브 에이전트 위임 실패 후 대체 직속 하위 서브 에이전트 후보 검토가 필요합니다.",
      eventLabel: "topology dispatch follow-up terminal directive:redelegate",
    })
  })

  it("turns exhausted topology dispatch failure into a stop directive", () => {
    const decision = resolveTopologyDispatchFollowupDecision({
      dispatchResult: failedDispatch("workspace:draft:node:finance"),
      plan: orchestrationPlan(["workspace:draft:node:finance"]),
      availableDirectChildExecutorIds: ["workspace:draft:node:finance"],
    })

    expect(decision).toMatchObject({
      action: "fail_with_reason",
      reasonCode: "final_failure_after_exhaustion",
      rootLoopContinuation: "blocked",
    })
    expect(decision ? buildTopologyDispatchFollowupDirective(decision) : null).toEqual({
      kind: "stop",
      preview: "",
      summary: "서브 에이전트 위임이 실패했고 대체 위임이나 자체 처리 경로가 없습니다.",
      userMessage: "서브 에이전트 위임이 실패했고 대체 위임이나 자체 처리 경로가 없습니다.",
      userMessageSource: "runtime_deterministic",
      reason: "서브 에이전트 위임 실패 후 대체 위임이나 자체 처리 경로가 없습니다.",
      eventLabel: "topology dispatch follow-up terminal directive:fail_with_reason",
    })
  })
})
