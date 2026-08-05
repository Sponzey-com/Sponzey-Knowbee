import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { buildAgentExecutionContextFromGraphSnapshot } from "../packages/core/src/orchestration/execution-context-builder.ts"
import { buildAgentExecutionDecisionPrompt } from "../packages/core/src/orchestration/execution-harness.ts"
import {
  EXECUTION_GRAPH_ROOT_AGENT_ID,
  type ExecutionGraphSnapshot,
} from "../packages/core/src/orchestration/execution-graph-snapshot.ts"

const now = Date.UTC(2026, 6, 6, 9, 0, 0)
const rootExecutorId = EXECUTION_GRAPH_ROOT_AGENT_ID
const childExecutorId = "workspace:draft:node:finance"

function promptPayload(prompt: string): Record<string, unknown> {
  const line = prompt.split("\n").findLast((item) => item.trim().startsWith("{"))
  expect(line).toBeTruthy()
  return JSON.parse(line as string) as Record<string, unknown>
}

function graph(): ExecutionGraphSnapshot {
  return {
    graphId: "execution-graph:task0486",
    graphSource: "workspace_draft",
    generatedAt: now,
    rootAgentId: rootExecutorId,
    currentExecutorId: rootExecutorId,
    topologyId: "workspace:draft",
    topologyVersion: 1,
    agentsById: {
      [rootExecutorId]: {
        agentId: rootExecutorId,
        agentName: "마당쇠",
        source: "config",
        status: "active",
        delegationEnabled: true,
        executionCandidate: true,
        role: "root",
        specialtyTags: [],
        reasonCodes: [],
      },
      [childExecutorId]: {
        agentId: childExecutorId,
        agentName: "행랑아범",
        source: "topology",
        status: "active",
        delegationEnabled: false,
        executionCandidate: true,
        role: "finance",
        specialtyTags: ["finance"],
        reasonCodes: [],
      },
    },
    directChildAgentIdsByParent: {
      [rootExecutorId]: [childExecutorId],
    },
    edgeIndex: {
      [rootExecutorId]: {
        [childExecutorId]: {
          edgeId: "edge:root-finance",
          parentAgentId: rootExecutorId,
          childAgentId: childExecutorId,
          source: "topology_relation",
          executionCandidate: true,
          reasonCodes: [],
        },
      },
    },
    edges: [{
      edgeId: "edge:root-finance",
      parentAgentId: rootExecutorId,
      childAgentId: childExecutorId,
      source: "topology_relation",
      executionCandidate: true,
      reasonCodes: [],
    }],
    rootDirectChildAgentIds: [childExecutorId],
    allRegisteredExecutorIds: [rootExecutorId, childExecutorId],
    allActiveExecutorIds: [rootExecutorId, childExecutorId],
    availableExecutorIds: [childExecutorId],
    validationIssues: [],
    trace: {
      execution_graph_id: "execution-graph:task0486",
      graph_source: "workspace_draft",
      current_executor_id: rootExecutorId,
      available_executor_ids: [childExecutorId],
    },
  }
}

describe("task0486 execution context agent_name boundary", () => {
  it("projects agent_name into execution decision context and prompt JSON", () => {
    const context = buildAgentExecutionContextFromGraphSnapshot({
      graph: graph(),
      request: {
        kind: "user_message",
        latest_user_message: "재무 질문을 검토해줘",
      },
    })

    expect(context.current_executor).toMatchObject({
      executor_id: rootExecutorId,
      agent_name: "마당쇠",
    })
    expect(context.current_executor).not.toHaveProperty("display_name")
    expect(context.accessible_executors).toEqual([
      expect.objectContaining({
        executor_id: childExecutorId,
        agent_name: "행랑아범",
      }),
    ])
    expect(context.accessible_executors[0]).not.toHaveProperty("display_name")

    const payload = promptPayload(buildAgentExecutionDecisionPrompt(context))
    const promptContextJson = JSON.stringify(payload.context)

    expect(promptContextJson).toContain('"agent_name"')
    expect(promptContextJson).not.toContain('"display_name"')
  })

  it("keeps execution decision context source free of display_name", () => {
    const sourceFiles = [
      "packages/core/src/orchestration/execution-decision-contract.ts",
      "packages/core/src/orchestration/execution-context-builder.ts",
      "packages/core/src/orchestration/execution-harness.ts",
      "packages/core/src/orchestration/decide-execution-route.ts",
    ]

    for (const sourceFile of sourceFiles) {
      const source = readFileSync(sourceFile, "utf8")
      expect(source).not.toContain("display_name")
    }
  })
})
