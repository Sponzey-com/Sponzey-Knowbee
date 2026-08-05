import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import type { RunRuntimeInspectorProjection } from "../packages/webui/src/contracts/runs.ts"
import { buildRuntimeInspectorSummaryCards } from "../packages/webui/src/lib/runtime-inspector.ts"

function projection(typedTrace: NonNullable<RunRuntimeInspectorProjection["typedTrace"]>): RunRuntimeInspectorProjection {
  return {
    schemaVersion: 1,
    runId: "[internal-id]",
    requestGroupId: "[internal-id]",
    requestIdentity: { runId: "[internal-id]", requestGroupId: "[internal-id]", rootRunId: "[internal-id]" },
    generatedAt: 1,
    orchestrationMode: "single_knowbee",
    topologyRouting: {
      mode: "unknown",
      providerFallbackBlocked: false,
      providerFallback: false,
      selectedExecutorIds: [],
      selectedEdgeIds: [],
      assignedTopologyAgentIds: [],
      issues: [],
    },
    plan: {
      directTaskCount: 1,
      delegatedTaskCount: 0,
      approvalRequirementCount: 0,
      resourceLockCount: 0,
      parallelGroupCount: 0,
      taskSummaries: [],
    },
    subSessions: [],
    dataExchanges: [],
    approvals: [],
    timeline: [],
    topologyRuns: [],
    finalizer: { parentOwnedFinalAnswer: true, status: "not_started" },
    typedTrace,
    redaction: { payloadsRedacted: true, rawPayloadVisible: false },
  }
}

describe("task038 WebUI runtime inspector trace", () => {
  it("renders bounded Korean and English stage/verification labels", () => {
    const runtime = projection({
      status: "ready",
      currentStage: "recovery",
      eventCount: 4,
      terminal: false,
      issueCount: 0,
      verification: "evidence_recorded",
      recoveryCount: 1,
      blocker: "policy",
    })
    const ko = buildRuntimeInspectorSummaryCards(runtime, (ko) => ko)
    const en = buildRuntimeInspectorSummaryCards(runtime, (_ko, en) => en)

    expect(ko.find((card) => card.id === "typed-stage")?.value).toBe("다른 방법 실행")
    expect(ko.find((card) => card.id === "typed-verification")?.value).toBe("권한 또는 정책 확인 필요")
    expect(en.find((card) => card.id === "typed-stage")?.value).toBe("Recovery")
    expect(en.find((card) => card.id === "typed-verification")?.value).toBe("Permission or policy review needed")
    expect(JSON.stringify(ko)).not.toContain("policy_blocked")

    const reviewed = buildRuntimeInspectorSummaryCards(projection({
      ...runtime.typedTrace!,
      currentStage: "review",
    }), (ko) => ko)
    expect(reviewed.find((card) => card.id === "typed-stage")?.value).toBe("결과 검증 · 다른 방법 1회")
  })

  it("keeps typed trace interpretation in the view model instead of the component", () => {
    const component = readFileSync("packages/webui/src/components/runs/RunRuntimeInspectorPanel.tsx", "utf8")
    const viewModel = readFileSync("packages/webui/src/lib/runtime-inspector.ts", "utf8")
    const route = readFileSync("packages/core/src/api/routes/runs.ts", "utf8")

    expect(component).not.toContain("typedTrace")
    expect(component).toContain("buildRuntimeInspectorSummaryCards")
    expect(viewModel).toContain("typedTrace.currentStage")
    expect(viewModel).not.toContain("summary.includes")
    expect(route).toContain("buildRuntimeInspectorTypedTrace")
    expect(route).toContain("typedTrace,")
  })

  it("keeps trace summary cards within responsive grid and word-wrap constraints", () => {
    const component = readFileSync("packages/webui/src/components/runs/RunRuntimeInspectorPanel.tsx", "utf8")

    expect(component).toContain("grid grid-cols-2 gap-2 xl:grid-cols-3")
    expect(component).toContain("break-words [overflow-wrap:anywhere]")
  })
})
