import { createElement } from "../packages/webui/node_modules/react/index.js"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { describe, expect, it } from "vitest"
import type { RootRun } from "../packages/webui/src/contracts/runs.ts"
import { RunSummaryPanel } from "../packages/webui/src/components/runs/RunSummaryPanel.tsx"

function run(): RootRun {
  const now = 1_778_800_000_000
  return {
    id: "run:task0372",
    sessionId: "session:task0372",
    requestGroupId: "group:task0372",
    lineageRootRunId: "group:task0372",
    runScope: "root",
    title: "작업 세션 표시 확인",
    prompt: "세션 표시 확인",
    source: "webui",
    status: "running",
    taskProfile: "operations",
    contextMode: "full",
    delegationTurnCount: 0,
    maxDelegationTurns: 5,
    currentStepKey: "executing",
    currentStepIndex: 1,
    totalSteps: 2,
    summary: "작업이 진행 중입니다.",
    workerSessionId: "worker-session-secret-task0372",
    canCancel: true,
    createdAt: now - 1_000,
    updatedAt: now,
    steps: [],
    recentEvents: [],
  }
}

describe("task0372 run summary worker session redaction", () => {
  it("renders worker session state without exposing the internal worker session id", () => {
    const html = renderToStaticMarkup(
      createElement(RunSummaryPanel, {
        run: run(),
        diagnosticMode: true,
      }),
    )

    expect(html).toContain("작업 세션")
    expect(html).toContain("작업 세션 연결됨")
    expect(html).not.toContain("worker-session-secret-task0372")
    expect(html).not.toContain("세션 ID")
  })
})
