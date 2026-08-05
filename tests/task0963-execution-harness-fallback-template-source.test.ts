import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  AGENT_EXECUTION_DECISION_CONTRACT_VERSION,
  type AgentExecutionContext,
} from "../packages/core/src/orchestration/execution-decision-contract.ts"
import { runAgentExecutionHarness } from "../packages/core/src/orchestration/execution-harness.ts"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"

function context(): AgentExecutionContext {
  return {
    contract_version: AGENT_EXECUTION_DECISION_CONTRACT_VERSION,
    request: {
      kind: "user_message",
    },
    current_executor: {
      executor_id: "agent:knowbee",
      agent_name: "노비",
      can_delegate: false,
      available: true,
    },
    accessible_executors: [],
    diagnostic_executors: [],
    accessible_connections: [],
    available_tools: [],
    permission_policy: { allowed_tool_ids: [] },
    risk_policy: { approval_required_for: [] },
    execution_graph: {
      graph_id: "execution-graph:fallback",
      graph_source: "runtime",
      root_executor_id: "agent:knowbee",
      current_executor_id: "agent:knowbee",
      available_executor_ids: [],
      diagnostic_executor_ids: [],
      all_active_executor_ids: ["agent:knowbee"],
      all_registered_executor_ids: ["agent:knowbee"],
      allowed_connections: [],
      validation_issue_codes: [],
    },
  }
}

describe("task0963 execution harness fallback prompt source", () => {
  it("registers execution harness fallback text as an internal English source", () => {
    const registry = loadPromptSourceRegistry(process.cwd())
    const source = registry.find((item) =>
      item.sourceId === "execution_harness_fallback_text_user" && item.locale === "en"
    )

    expect(source).toMatchObject({
      sourceId: "execution_harness_fallback_text_user",
      usageScope: "internal",
      enabled: true,
    })
    expect(source?.content).toContain("## Value")
    expect(source?.content).toContain("task_profile.title=Execution decision")
    expect(source?.content).toContain("fallback_output.label=Safe next action")
    expect(source?.content).toContain("## Out Of Scope")
  })

  it("renders fallback decision task profile and output text from source values", async () => {
    const result = await runAgentExecutionHarness({
      context: context(),
      callModel: async () => "not json",
    })

    expect(result.ok).toBe(false)
    expect(result.decision.task_profile).toMatchObject({
      title: "Fallback execution decision",
      goals: ["Recover from an unavailable or structurally invalid execution decision"],
      success_criteria: ["A safe next action is selected"],
    })
    expect(result.decision.required_outputs).toEqual([{
      id: "fallback:next-action",
      label: "Safe next action",
      acceptance_criteria: ["Fallback reason and next executor are explicit"],
    }])
  })

  it("does not keep execution harness fallback text bodies hardcoded in TypeScript", () => {
    const source = readFileSync("packages/core/src/orchestration/execution-harness.ts", "utf-8")

    expect(source).toContain("execution_harness_fallback_text_user")
    expect(source).not.toContain("Route the current request.")
    expect(source).not.toContain("Select a viable executor path.")
    expect(source).not.toContain("The selected route is valid for the current executor graph.")
    expect(source).not.toContain("Handle the delegated work.")
    expect(source).not.toContain("Return the result needed by the parent executor.")
    expect(source).not.toContain("Fallback execution decision")
    expect(source).not.toContain("Recover from an unavailable or structurally invalid execution decision")
    expect(source).not.toContain("A safe next action is selected")
    expect(source).not.toContain("Safe next action")
    expect(source).not.toContain("Fallback reason and next executor are explicit")
  })
})
