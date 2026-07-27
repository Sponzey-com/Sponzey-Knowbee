import { describe, expect, it } from "vitest"
import { buildSafeProductParameterDefaults } from "../packages/core/src/contracts/product-parameters.ts"
import {
  AGENT_EXECUTION_DECISION_CONTRACT_VERSION,
  type AgentExecutionDecision,
  type AgentExecutionTaskProfile,
} from "../packages/core/src/orchestration/execution-decision-contract.ts"
import {
  EXECUTION_GRAPH_ROOT_AGENT_ID,
  type ExecutionGraphSnapshot,
} from "../packages/core/src/orchestration/execution-graph-snapshot.ts"
import { buildAgentExecutionContextFromGraphSnapshot } from "../packages/core/src/orchestration/execution-context-builder.ts"
import { validateAgentExecutionDecisionAgainstContext } from "../packages/core/src/orchestration/execution-harness.ts"
import {
  buildDefaultAgentExecutionPermissionPolicy,
  buildDefaultAgentExecutionRiskPolicy,
  buildDefaultSubAgentDelegationPolicy,
  decideProductSubAgentDelegationPolicy,
  productParameterRuntimeChildSubAgentCreationAllowed,
} from "../packages/core/src/orchestration/product-parameter-policy.ts"

const now = Date.UTC(2026, 6, 8, 14, 10, 0)
const childAgentId = "agent:child"

const taskProfile: AgentExecutionTaskProfile = {
  title: "서브 에이전트 위임",
  summary: "현재 실행자가 미리 설정된 직접 하위 실행자에게만 일을 위임한다.",
  goals: ["직접 하위 실행자 검증", "런타임 하위 생성 금지"],
  task_units: [],
  success_criteria: ["선택된 실행자는 그래프에 존재하는 직접 하위 실행자이다."],
}

function graph(): ExecutionGraphSnapshot {
  return {
    graphId: "execution-graph:task0780",
    graphSource: "workspace_draft",
    generatedAt: now,
    rootAgentId: EXECUTION_GRAPH_ROOT_AGENT_ID,
    currentExecutorId: EXECUTION_GRAPH_ROOT_AGENT_ID,
    agentsById: {
      [EXECUTION_GRAPH_ROOT_AGENT_ID]: {
        agentId: EXECUTION_GRAPH_ROOT_AGENT_ID,
        agentName: "마당쇠",
        source: "config",
        status: "active",
        delegationEnabled: true,
        executionCandidate: true,
        role: "root",
        specialtyTags: [],
        reasonCodes: [],
      },
      [childAgentId]: {
        agentId: childAgentId,
        agentName: "자료조사",
        source: "topology",
        status: "active",
        delegationEnabled: false,
        executionCandidate: true,
        role: "research",
        specialtyTags: ["research"],
        reasonCodes: [],
      },
    },
    directChildAgentIdsByParent: {
      [EXECUTION_GRAPH_ROOT_AGENT_ID]: [childAgentId],
    },
    edgeIndex: {
      [EXECUTION_GRAPH_ROOT_AGENT_ID]: {
        [childAgentId]: {
          edgeId: "edge:root-child",
          parentAgentId: EXECUTION_GRAPH_ROOT_AGENT_ID,
          childAgentId,
          source: "topology_relation",
          executionCandidate: true,
          reasonCodes: [],
        },
      },
    },
    edges: [{
      edgeId: "edge:root-child",
      parentAgentId: EXECUTION_GRAPH_ROOT_AGENT_ID,
      childAgentId,
      source: "topology_relation",
      executionCandidate: true,
      reasonCodes: [],
    }],
    rootDirectChildAgentIds: [childAgentId],
    allRegisteredExecutorIds: [EXECUTION_GRAPH_ROOT_AGENT_ID, childAgentId],
    allActiveExecutorIds: [EXECUTION_GRAPH_ROOT_AGENT_ID, childAgentId],
    availableExecutorIds: [childAgentId],
    validationIssues: [],
    trace: {
      execution_graph_id: "execution-graph:task0780",
      graph_source: "workspace_draft",
      current_executor_id: EXECUTION_GRAPH_ROOT_AGENT_ID,
      available_executor_ids: [childAgentId],
    },
  }
}

function decision(overrides: Partial<AgentExecutionDecision> = {}): AgentExecutionDecision {
  return {
    contract_version: AGENT_EXECUTION_DECISION_CONTRACT_VERSION,
    current_executor_id: EXECUTION_GRAPH_ROOT_AGENT_ID,
    domain: "research",
    behavior_pattern: "delegate",
    execution_route: "delegate_to_child",
    selected_executor_id: childAgentId,
    selected_connection_path: [childAgentId],
    task_profile: taskProfile,
    required_outputs: [{ id: "answer", label: "처리 결과" }],
    risk_boundary: {
      requires_user_approval: false,
      reason: "미리 설정된 직접 하위 실행자에게 위임한다.",
    },
    confidence: 0.84,
    fallback_if_unavailable: "self_solve",
    reason: "자료조사 실행자가 직접 하위 실행자이다.",
    ...overrides,
  }
}

describe("task0780 product sub-agent delegation policy", () => {
  it("keeps runtime child sub-agent creation disabled by product defaults", () => {
    const policy = buildDefaultSubAgentDelegationPolicy()

    expect(productParameterRuntimeChildSubAgentCreationAllowed()).toBe(false)
    expect(policy).toEqual({
      childSubAgentPolicy: "preconfigured_direct_children_only",
      canCreateChildSubAgentsAtRuntime: false,
      notes: expect.arrayContaining([
        "product_parameter_defaults=undecided_safe_default",
        "sub_agent_child_policy=preconfigured_direct_children_only",
        "sub_agent_runtime_child_creation_allowed=false",
      ]),
    })
    expect(decideProductSubAgentDelegationPolicy({
      action: "create_runtime_child_sub_agent",
    })).toEqual(expect.objectContaining({
      ok: false,
      status: "runtime_child_creation_disallowed",
    }))
    expect(decideProductSubAgentDelegationPolicy({
      action: "use_preconfigured_direct_child",
      selectedExecutorIsPreconfiguredDirectChild: true,
    })).toEqual(expect.objectContaining({
      ok: true,
      status: "allowed",
    }))
  })

  it("falls back to safe delegation defaults when product parameters are invalid", () => {
    const invalidDefaults = buildSafeProductParameterDefaults({
      subAgentDelegation: {
        childSubAgentPolicy: "preconfigured_direct_children_only",
        canCreateChildSubAgentsAtRuntime: true as false,
      },
    })
    const policy = buildDefaultSubAgentDelegationPolicy(invalidDefaults)

    expect(productParameterRuntimeChildSubAgentCreationAllowed(invalidDefaults)).toBe(false)
    expect(policy.canCreateChildSubAgentsAtRuntime).toBe(false)
    expect(policy.notes).toEqual(expect.arrayContaining([
      "product_parameter_defaults_recovered_from_invalid=sub_agent_runtime_child_creation_allowed",
    ]))
  })

  it("projects the sub-agent delegation default into execution context policies", () => {
    const context = buildAgentExecutionContextFromGraphSnapshot({
      graph: graph(),
      request: {
        kind: "user_message",
        latest_user_message: "조사를 맡겨줘",
        structured_goal: "직접 하위 실행자에게만 위임한다.",
      },
    })

    expect(context.permission_policy).toEqual(buildDefaultAgentExecutionPermissionPolicy())
    expect(context.risk_policy).toEqual(buildDefaultAgentExecutionRiskPolicy())
    expect(context.permission_policy.notes).toEqual(expect.arrayContaining([
      "sub_agent_child_policy=preconfigured_direct_children_only",
      "sub_agent_runtime_child_creation_allowed=false",
    ]))
    expect(context.risk_policy.notes).toEqual(expect.arrayContaining([
      "sub_agent_child_policy=preconfigured_direct_children_only",
      "sub_agent_runtime_child_creation_allowed=false",
    ]))
  })

  it("rejects unregistered child executor delegation as a runtime child creation attempt", () => {
    const context = buildAgentExecutionContextFromGraphSnapshot({
      graph: graph(),
      request: {
        kind: "user_message",
        latest_user_message: "새 실행자에게 맡겨줘",
        structured_goal: "임의 하위 실행자는 만들지 않는다.",
      },
    })
    const validation = validateAgentExecutionDecisionAgainstContext({
      context,
      decision: decision({
        selected_executor_id: "agent:runtime-child",
        selected_connection_path: ["agent:runtime-child"],
      }),
    })

    expect(validation.ok).toBe(false)
    expect(validation.status).toBe("selected_executor_not_in_graph")
    expect(validation.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "selected_executor_not_in_graph",
        executor_id: "agent:runtime-child",
      }),
      expect.objectContaining({
        code: "permission_denied",
        executor_id: "agent:runtime-child",
        message: "Runtime child sub-agent creation is disabled; delegation must use a preconfigured direct child.",
      }),
    ]))
  })
})
