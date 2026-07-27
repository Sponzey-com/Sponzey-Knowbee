import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  AGENT_EXECUTION_DECISION_CONTRACT_VERSION,
  type AgentExecutionContext,
} from "../packages/core/src/orchestration/execution-decision-contract.ts"
import {
  buildAgentExecutionDecisionPrompt,
  executionHarnessPolicyContextLabel,
} from "../packages/core/src/orchestration/execution-harness.ts"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"

const SOURCE_ID = "execution_harness_policy_context_labels_user"
const repoRoot = process.cwd()

function context(): AgentExecutionContext {
  return {
    contract_version: AGENT_EXECUTION_DECISION_CONTRACT_VERSION,
    request: {
      kind: "user_message",
      latest_user_message: "route this",
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
      graph_id: "execution-graph:policy-context",
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

describe("task0978 execution harness policy context labels", () => {
  it("registers execution harness policy context labels as an internal prompt source", () => {
    const source = loadPromptSourceRegistry(repoRoot)
      .find((item) => item.sourceId === SOURCE_ID && item.locale === "en")

    expect(source).toMatchObject({
      sourceId: SOURCE_ID,
      required: false,
      usageScope: "internal",
      enabled: true,
    })
    expect(source?.content).toContain("policy_sources_title=[Execution Harness Runtime Policy Sources]")
    expect(source?.content).toContain("provided_in_user_prompt=provided in the user prompt")
    expect(source?.content).toContain("context_json_in_user_prompt=The requested JSON decision context is provided in the user prompt.")
  })

  it("renders execution decision prompt policy title from source values", () => {
    expect(executionHarnessPolicyContextLabel("policy_sources_title"))
      .toBe("[Execution Harness Runtime Policy Sources]")

    const prompt = buildAgentExecutionDecisionPrompt(context(), { promptSources: [] })

    expect(prompt).toContain("[Execution Harness Runtime Policy Sources]")
    expect(prompt).toContain("allowed_actions")
    expect(prompt).toContain("delegate")
    expect(prompt).toContain("self_solve")
  })

  it("removes execution harness policy context labels from TypeScript", () => {
    const harnessSource = readFileSync(join(repoRoot, "packages/core/src/orchestration/execution-harness.ts"), "utf8")
    const bridgeSource = readFileSync(join(repoRoot, "packages/core/src/runs/intake-bridge-pass.ts"), "utf8")

    expect(harnessSource).toContain(SOURCE_ID)
    expect(bridgeSource).toContain("executionHarnessPolicyContextLabel")
    expect(harnessSource).not.toContain("\"[Execution Harness Runtime Policy Sources]\"")
    expect(bridgeSource).not.toContain("\"[Execution Harness Runtime Policy Sources]")
    expect(bridgeSource).not.toContain("\"provided in the user prompt\"")
    expect(bridgeSource).not.toContain("\"The requested JSON decision context is provided in the user prompt.\"")
  })
})
