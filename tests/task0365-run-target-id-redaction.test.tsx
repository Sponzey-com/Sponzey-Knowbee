import { createElement } from "../packages/webui/node_modules/react/index.js"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { describe, expect, it } from "vitest"
import { RunSummaryPanel } from "../packages/webui/src/components/runs/RunSummaryPanel.tsx"
import { RunTargetBadge } from "../packages/webui/src/components/runs/RunTargetBadge.tsx"
import type { RootRun } from "../packages/webui/src/contracts/runs.ts"

function run(): RootRun {
  const now = 1_778_800_000_000
  return {
    id: "run:task0365",
    sessionId: "session:task0365",
    requestGroupId: "group:task0365",
    lineageRootRunId: "group:task0365",
    runScope: "root",
    title: "내부 대상 확인",
    prompt: "대상 확인",
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

describe("task0365 run target id redaction", () => {
  it("does not render raw internal target ids when no user-facing target label exists", () => {
    const summaryMarkup = renderToStaticMarkup(createElement(RunSummaryPanel, { run: run() }))
    const badgeMarkup = renderToStaticMarkup(createElement(RunTargetBadge, { targetId: "agent:internal-secret-target-id" }))

    expect(summaryMarkup).not.toContain("agent:internal-secret-target-id")
    expect(badgeMarkup).not.toContain("agent:internal-secret-target-id")
    expect(summaryMarkup).toContain("실행 대상 미선정")
    expect(badgeMarkup).toContain("실행 대상 미선정")
  })
})
