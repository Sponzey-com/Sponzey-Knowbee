import { describe, expect, it } from "vitest"
import { buildSafeProductParameterDefaults } from "../packages/core/src/contracts/product-parameters.ts"
import { buildAgentExecutionContextFromGraphSnapshot } from "../packages/core/src/orchestration/execution-context-builder.ts"
import {
  buildDefaultAgentExecutionPermissionPolicy,
  buildDefaultAgentExecutionRiskPolicy,
  executionRiskKindsForYeonjangOperation,
  productParameterYeonjangOperationRequiresApproval,
} from "../packages/core/src/orchestration/product-parameter-policy.ts"
import {
  EXECUTION_GRAPH_ROOT_AGENT_ID,
  type ExecutionGraphSnapshot,
} from "../packages/core/src/orchestration/execution-graph-snapshot.ts"

const now = Date.UTC(2026, 6, 8, 13, 20, 0)

function graph(): ExecutionGraphSnapshot {
  return {
    graphId: "execution-graph:task0778",
    graphSource: "workspace_draft",
    generatedAt: now,
    rootAgentId: EXECUTION_GRAPH_ROOT_AGENT_ID,
    currentExecutorId: EXECUTION_GRAPH_ROOT_AGENT_ID,
    agentsById: {
      [EXECUTION_GRAPH_ROOT_AGENT_ID]: {
        agentId: EXECUTION_GRAPH_ROOT_AGENT_ID,
        agentName: "노비",
        source: "config",
        status: "active",
        delegationEnabled: true,
        executionCandidate: true,
        role: "root",
        specialtyTags: [],
        reasonCodes: [],
      },
    },
    directChildAgentIdsByParent: {
      [EXECUTION_GRAPH_ROOT_AGENT_ID]: [],
    },
    edgeIndex: {},
    edges: [],
    rootDirectChildAgentIds: [],
    allRegisteredExecutorIds: [EXECUTION_GRAPH_ROOT_AGENT_ID],
    allActiveExecutorIds: [EXECUTION_GRAPH_ROOT_AGENT_ID],
    availableExecutorIds: [],
    validationIssues: [],
    trace: {
      execution_graph_id: "execution-graph:task0778",
      graph_source: "workspace_draft",
      current_executor_id: EXECUTION_GRAPH_ROOT_AGENT_ID,
      available_executor_ids: [],
    },
  }
}

describe("task0778 product parameter execution policy", () => {
  it("projects Yeonjang product defaults into execution risk policy", () => {
    const policy = buildDefaultAgentExecutionRiskPolicy()

    expect(policy.approval_required_for).toEqual([
      "delete",
      "external_transfer",
      "local_system_control",
      "payment",
      "permission",
      "privacy",
    ])
    expect(policy.blocked_without_approval).toEqual(["external_transfer", "local_system_control"])
    expect(policy.notes).toEqual(expect.arrayContaining([
      "product_parameter_defaults=undecided_safe_default",
      "yeonjang_approval_required_operations=file_change,app_execution,terminal_command,screen_control,keyboard_input,mouse_input,external_network_call",
    ]))
  })

  it("answers exact Yeonjang operation approval and risk-kind questions from product defaults", () => {
    const defaults = buildSafeProductParameterDefaults()

    expect(productParameterYeonjangOperationRequiresApproval("file_change", defaults)).toBe(true)
    expect(productParameterYeonjangOperationRequiresApproval("external_network_call", defaults)).toBe(true)
    expect(executionRiskKindsForYeonjangOperation("screen_control")).toEqual(["privacy", "local_system_control"])
    expect(executionRiskKindsForYeonjangOperation("external_network_call")).toEqual(["external_transfer"])
  })

  it("uses product parameter execution policies when no explicit context policy is provided", () => {
    const context = buildAgentExecutionContextFromGraphSnapshot({
      graph: graph(),
      request: {
        kind: "user_message",
        latest_user_message: "화면을 조작해줘",
        structured_goal: "연장 컴퓨터 제어 권한 경계를 판단한다.",
      },
    })

    expect(context.permission_policy).toEqual(buildDefaultAgentExecutionPermissionPolicy())
    expect(context.risk_policy).toEqual(buildDefaultAgentExecutionRiskPolicy())
  })

  it("does not override explicit execution policies", () => {
    const context = buildAgentExecutionContextFromGraphSnapshot({
      graph: graph(),
      request: {
        kind: "user_message",
        latest_user_message: "검토만 해줘",
        structured_goal: "명시 정책 우선순위를 확인한다.",
      },
      permissionPolicy: {
        allowed_tool_ids: ["tool:read"],
      },
      riskPolicy: {
        approval_required_for: ["privacy"],
      },
    })

    expect(context.permission_policy).toEqual({ allowed_tool_ids: ["tool:read"] })
    expect(context.risk_policy).toEqual({ approval_required_for: ["privacy"] })
  })
})
