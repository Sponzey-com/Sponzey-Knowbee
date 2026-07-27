import { describe, expect, it } from "vitest"
import {
  AGENT_EXECUTION_DECISION_CONTRACT_VERSION,
  type AgentExecutionDecision,
} from "../packages/core/src/orchestration/execution-decision-contract.ts"
import { authorWorkflowFromExecutionDecision } from "../packages/core/src/orchestration/workflow-authoring.ts"
import { orderDelegatedTasksForDispatch } from "../packages/core/src/runs/orchestration-dispatch.ts"
import type { OrchestrationPlan, OrchestrationTask } from "../packages/core/src/index.ts"

function decision(): AgentExecutionDecision {
  return {
    contract_version: AGENT_EXECUTION_DECISION_CONTRACT_VERSION,
    current_executor_id: "agent:knowbee",
    domain: "report_workflow",
    behavior_pattern: "delegate",
    execution_route: "delegate_to_child",
    selected_executor_id: "agent:worker",
    selected_connection_path: ["agent:knowbee", "agent:worker"],
    task_profile: {
      title: "Prepare report",
      summary: "Collect evidence and write the report.",
      goals: ["Produce a verified report."],
      task_units: [
        {
          id: "collect",
          title: "collect_evidence",
          goal: "Collect source evidence.",
          required_outputs: [{ id: "evidence", label: "Source evidence" }],
        },
        {
          id: "write",
          title: "write_report",
          goal: "Write the report from evidence.",
          depends_on_unit_ids: ["collect"],
          required_outputs: [{ id: "report", label: "Verified report" }],
        },
      ],
      success_criteria: ["The report cites the collected evidence."],
      constraints: ["Do not invent sources."],
    },
    required_outputs: [{ id: "report", label: "Verified report" }],
    risk_boundary: { requires_user_approval: false, reason: "Read-only workflow." },
    confidence: 0.98,
    fallback_if_unavailable: "direct_current_agent",
    reason: "The request needs two ordered work units.",
  }
}

function task(taskId: string): OrchestrationTask {
  return {
    taskId,
    executionKind: "delegated_sub_agent",
    assignedAgentId: "agent:worker",
    scope: {
      goal: taskId,
      intentType: "workflow",
      actionType: "execute",
      constraints: [],
      expectedOutputs: [],
      reasonCodes: [],
    },
    requiredCapabilities: [],
    resourceLockIds: [],
  }
}

function dispatchPlan(): Pick<OrchestrationPlan, "directKnowbeeTasks" | "delegatedTasks" | "dependencyEdges"> {
  return {
    directKnowbeeTasks: [],
    delegatedTasks: [task("report"), task("collect")],
    dependencyEdges: [{
      fromTaskId: "collect",
      toTaskId: "report",
      reasonCode: "workflow_unit_dependency",
    }],
  }
}

describe("task1194 workflow authoring", () => {
  it("does not create a workflow for a single work unit", () => {
    const value = decision()
    value.task_profile.task_units = [value.task_profile.task_units[0]!]
    expect(authorWorkflowFromExecutionDecision(value)).toBeUndefined()
  })

  it("authors ordered task scopes from the LLM execution decision", () => {
    const result = authorWorkflowFromExecutionDecision(decision())
    expect(result).toMatchObject({
      state: "ready",
      reasonCodes: ["llm_workflow_authored", "workflow_contract_valid"],
      dependencies: [{ fromScopeIndex: 0, toScopeIndex: 1, reasonCode: "workflow_unit_dependency" }],
    })
    expect(result?.taskScopes).toHaveLength(2)
    expect(result?.taskScopes[1]?.expectedOutputs[0]?.acceptance.reasonCodes).toEqual([
      "The report cites the collected evidence.",
    ])
  })

  it("rejects a missing dependency before planning", () => {
    const value = decision()
    value.task_profile.task_units[1]!.depends_on_unit_ids = ["missing"]
    expect(authorWorkflowFromExecutionDecision(value)).toEqual({
      state: "rejected",
      taskScopes: [],
      dependencies: [],
      reasonCodes: ["dependency_missing"],
    })
  })

  it("rejects cyclic dependencies before planning", () => {
    const value = decision()
    value.task_profile.task_units[0]!.depends_on_unit_ids = ["write"]
    expect(authorWorkflowFromExecutionDecision(value)).toEqual({
      state: "rejected",
      taskScopes: [],
      dependencies: [],
      reasonCodes: ["dependency_cycle"],
    })
  })

  it("orders dependency producers before consumers regardless of LLM array order", () => {
    const value = decision()
    value.task_profile.task_units.reverse()
    const result = authorWorkflowFromExecutionDecision(value)
    expect(result?.taskScopes.map((scope) => scope.goal)).toEqual([
      "Collect source evidence.",
      "Write the report from evidence.",
    ])
    expect(result?.dependencies).toEqual([{
      fromScopeIndex: 0,
      toScopeIndex: 1,
      reasonCode: "workflow_unit_dependency",
    }])
  })

  it("rejects a workflow without completion criteria", () => {
    const value = decision()
    value.task_profile.success_criteria = []
    expect(authorWorkflowFromExecutionDecision(value)).toMatchObject({
      state: "rejected",
      reasonCodes: ["completion_contract_missing", "workflow_verification_missing"],
    })
  })

  it("rejects invalid, duplicate, or unverifiable step outputs", () => {
    const invalid = decision()
    invalid.task_profile.success_criteria = []
    invalid.task_profile.task_units[0]!.required_outputs = [
      { id: "", label: "" },
      { id: "evidence", label: "Evidence", acceptance_criteria: [] },
      { id: "evidence", label: "Duplicate", acceptance_criteria: [] },
    ]
    invalid.task_profile.task_units[1]!.required_outputs = [
      { id: "report", label: "Report", acceptance_criteria: [] },
    ]

    expect(authorWorkflowFromExecutionDecision(invalid)).toMatchObject({
      state: "rejected",
      reasonCodes: expect.arrayContaining([
        "completion_contract_missing",
        "workflow_output_invalid",
        "workflow_output_id_duplicate",
        "workflow_verification_missing",
      ]),
    })
  })

  it("dispatches workflow tasks in dependency order instead of input array order", () => {
    const result = orderDelegatedTasksForDispatch(dispatchPlan())
    expect(result).toMatchObject({ ok: true })
    if (result.ok) expect(result.tasks.map((item) => item.taskId)).toEqual(["collect", "report"])
  })

  it("blocks the entire dispatch graph when a dependency is missing or cyclic", () => {
    const missing = dispatchPlan()
    missing.dependencyEdges[0]!.fromTaskId = "missing"
    expect(orderDelegatedTasksForDispatch(missing)).toEqual({
      ok: false,
      reasonCode: "dependency_missing",
    })

    const cyclic = dispatchPlan()
    cyclic.dependencyEdges.push({
      fromTaskId: "report",
      toTaskId: "collect",
      reasonCode: "workflow_unit_dependency",
    })
    expect(orderDelegatedTasksForDispatch(cyclic)).toEqual({
      ok: false,
      reasonCode: "dependency_cycle",
    })
  })
})
