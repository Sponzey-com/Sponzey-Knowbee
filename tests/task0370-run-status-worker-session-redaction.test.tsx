import { createElement } from "../packages/webui/node_modules/react/index.js"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { describe, expect, it } from "vitest"
import { RunStatusCard } from "../packages/webui/src/components/runs/RunStatusCard.tsx"
import type { RootRun } from "../packages/webui/src/contracts/runs.ts"

function run(): RootRun {
  const now = 1_778_910_000_000
  return {
    id: "run:task0370",
    sessionId: "session:task0370",
    requestGroupId: "group:task0370",
    lineageRootRunId: "group:task0370",
    runScope: "root",
    title: "작업 세션 확인",
    prompt: "상태 확인",
    source: "webui",
    status: "running",
    taskProfile: "operations",
    targetLabel: "로컬 연장",
    contextMode: "full",
    delegationTurnCount: 0,
    maxDelegationTurns: 5,
    currentStepKey: "executing",
    currentStepIndex: 1,
    totalSteps: 2,
    summary: "작업을 처리하고 있습니다.",
    canCancel: true,
    workerSessionId: "worker-session-secret-12345678",
    createdAt: now - 1_000,
    updatedAt: now,
    steps: [],
    recentEvents: [],
  }
}

describe("task0370 run status worker session redaction", () => {
  it("renders worker session state without exposing the internal worker session id", () => {
    const markup = renderToStaticMarkup(createElement(RunStatusCard, { run: run() }))

    expect(markup).not.toContain("worker-session-secret")
    expect(markup).not.toContain("worker-session-secret-12345678")
    expect(markup).toContain("작업 세션 연결됨")
  })
})
