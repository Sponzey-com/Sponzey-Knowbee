import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const plannerTs = readFileSync(new URL("../packages/core/src/orchestration/planner.ts", import.meta.url), "utf-8")
const plannerJs = readFileSync(new URL("../packages/core/src/orchestration/planner.js", import.meta.url), "utf-8")
const executorGraphTs = readFileSync(
  new URL("../packages/core/src/topology/executor-graph.ts", import.meta.url),
  "utf-8",
)
const executorGraphJs = readFileSync(
  new URL("../packages/core/src/topology/executor-graph.js", import.meta.url),
  "utf-8",
)

describe("task0482 core user message sub-agent wording", () => {
  it("uses sub-agent wording in planner explanations and user messages", () => {
    const combined = `${plannerTs}\n${plannerJs}`

    expect(combined).toContain("구조화된 서브 에이전트 후보 평가")
    expect(combined).toContain("임의 서브 에이전트 선택 없이 현재 에이전트가 직접 처리")
    expect(combined).not.toContain("구조화된 실행자 후보 평가")
    expect(combined).not.toContain("임의 실행자 선택 없이 현재 에이전트가 직접 처리")
  })

  it("uses sub-agent wording for team section fallback descriptions", () => {
    const combined = `${executorGraphTs}\n${executorGraphJs}`

    expect(combined).toContain("서브 에이전트 영역")
    expect(combined).not.toContain("실행자 영역")
  })
})
