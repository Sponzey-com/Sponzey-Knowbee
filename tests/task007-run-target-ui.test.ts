import { createElement } from "../packages/webui/node_modules/react/index.js"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { describe, expect, it } from "vitest"
import { RunStatusCard } from "../packages/webui/src/components/runs/RunStatusCard.tsx"
import { RunSummaryPanel } from "../packages/webui/src/components/runs/RunSummaryPanel.tsx"
import type { RootRun } from "../packages/webui/src/contracts/runs.ts"
import { describeRunTargetSelectionReason } from "../packages/webui/src/lib/run-target.ts"

function run(overrides: Partial<RootRun> = {}): RootRun {
  const now = 1_778_800_000_000
  return {
    id: "run:task007",
    sessionId: "session:task007",
    requestGroupId: "group:task007",
    lineageRootRunId: "group:task007",
    runScope: "root",
    title: "원격 윈도우 화면 확인",
    prompt: "윈도우 오피스 화면을 확인해줘",
    source: "webui",
    status: "running",
    taskProfile: "operations",
    targetId: "yeonjang-windows",
    targetLabel: "윈도우 오피스",
    contextMode: "full",
    delegationTurnCount: 0,
    maxDelegationTurns: 5,
    currentStepKey: "executing",
    currentStepIndex: 3,
    totalSteps: 4,
    summary: "원격 장비 화면을 확인하고 있습니다.",
    canCancel: true,
    createdAt: now - 10_000,
    updatedAt: now,
    steps: [
      { key: "received", title: "received", index: 0, status: "completed", summary: "요청을 받았습니다." },
      { key: "target_selected", title: "target selected", index: 1, status: "completed", summary: "윈도우 오피스 대상을 선택했습니다." },
    ],
    recentEvents: [
      { id: "event:1", at: now - 5_000, label: "실행 시작" },
    ],
    ...overrides,
  }
}

describe("task007 run target ui", () => {
  it("prefers the structured target-selected step summary for user-facing target reasons", () => {
    expect(describeRunTargetSelectionReason(run(), (ko) => ko)).toBe("윈도우 오피스 대상을 선택했습니다.")
  })

  it("falls back to a neutral no-target receipt when no target is selected", () => {
    expect(
      describeRunTargetSelectionReason(
        run({ targetId: undefined, targetLabel: undefined, steps: [], recentEvents: [] }),
        (ko) => ko,
      ),
    ).toContain("아직 확정하지 않았습니다")
  })

  it("renders target badge and reason consistently in run cards and summary panels", () => {
    const statusMarkup = renderToStaticMarkup(createElement(RunStatusCard, { run: run() }))
    const summaryMarkup = renderToStaticMarkup(createElement(RunSummaryPanel, { run: run() }))

    expect(statusMarkup).toContain("윈도우 오피스")
    expect(statusMarkup).toContain("윈도우 오피스 대상을 선택했습니다.")
    expect(summaryMarkup).toContain("윈도우 오피스")
    expect(summaryMarkup).toContain("윈도우 오피스 대상을 선택했습니다.")
  })
})
