import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import type { ExecutorConnectionDraft, ExecutorDraft } from "../packages/core/src/topology/executor-graph.ts"
import { buildNodeTaskAnalysis } from "../packages/core/src/topology/executor-task-analysis.ts"

function executor(): ExecutorDraft {
  return {
    id: "agent:reviewer",
    name: "검토 담당",
    description: "결과를 검토합니다.",
    position: { x: 0, y: 0 },
    status: "active",
    sourceNodeId: "node:reviewer",
    inferredRuntimeMode: "manual_review",
    inferredCapabilities: ["review"],
    inferredTools: [],
    inferredOutputs: ["검토 결과"],
    inferredSuccessCriteria: ["검토 결과가 남는다."],
    confidence: 0.9,
  }
}

function incomingConnection(): ExecutorConnectionDraft {
  return {
    id: "edge:intake-reviewer",
    fromExecutorId: "agent:intake",
    toExecutorId: "agent:reviewer",
    inferredRelation: "delegates_to",
    label: "넘김",
    confidence: 0.8,
    userConfirmed: true,
  }
}

describe("task0472 executor task analysis wording", () => {
  it("uses sub-agent wording for incoming connection input needs", () => {
    const analysis = buildNodeTaskAnalysis({
      executor: executor(),
      incomingConnections: [incomingConnection()],
      now: "2026-07-06T00:00:00.000Z",
    })

    expect(analysis.inputNeeds).toEqual(["이전 서브 에이전트 agent:intake의 넘김"])
    expect(analysis.inputNeeds.join("\n")).not.toContain("이전 실행자")
  })

  it("does not keep old previous-executor wording in task analysis sources", () => {
    const sourceFiles = [
      "packages/core/src/topology/executor-task-analysis.ts",
      "packages/core/src/topology/executor-task-analysis.js",
    ]
    const combined = sourceFiles
      .map((filePath) => readFileSync(join(process.cwd(), filePath), "utf8"))
      .join("\n")

    expect(combined).not.toContain("이전 실행자")
    expect(combined).toContain("이전 서브 에이전트")
  })
})
