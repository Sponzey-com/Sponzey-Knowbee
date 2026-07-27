import { createElement } from "../packages/webui/node_modules/react/index.js"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { describe, expect, it } from "vitest"
import { RunTargetSummary } from "../packages/webui/src/components/runs/RunTargetSummary.tsx"
import type { RootRun } from "../packages/webui/src/contracts/runs.ts"

function run(): RootRun {
  const now = 1_778_900_000_000
  return {
    id: "run:task0366",
    sessionId: "session:task0366",
    requestGroupId: "group:task0366",
    lineageRootRunId: "group:task0366",
    runScope: "root",
    title: "내부 대상 사유 확인",
    prompt: "대상 사유 확인",
    source: "webui",
    status: "running",
    taskProfile: "operations",
    targetId: "agent:internal-secret-target-id",
    contextMode: "full",
    delegationTurnCount: 0,
    maxDelegationTurns: 5,
    currentStepKey: "executing",
    currentStepIndex: 1,
    totalSteps: 2,
    summary: "실행 중입니다.",
    canCancel: true,
    createdAt: now - 1_000,
    updatedAt: now,
    steps: [],
    recentEvents: [],
  }
}

describe("task0366 run target reason redaction", () => {
  it("does not describe an internal target id as a selected user-facing target", () => {
    const markup = renderToStaticMarkup(createElement(RunTargetSummary, { run: run() }))

    expect(markup).not.toContain("agent:internal-secret-target-id")
    expect(markup).not.toContain("선택한 실행 대상")
    expect(markup).toContain("실행 대상 미선정")
    expect(markup).toContain("실행 대상을 아직 확정하지 않았습니다.")
  })
})
