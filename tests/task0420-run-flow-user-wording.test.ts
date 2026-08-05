import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const relationToolbarSource = readFileSync(join(process.cwd(), "packages", "webui", "src", "components", "topology", "RelationModeToolbar.tsx"), "utf-8")
const traceOverlaySource = readFileSync(join(process.cwd(), "packages", "webui", "src", "components", "topology", "TopologyRunTraceOverlay.tsx"), "utf-8")
const runStripSource = readFileSync(join(process.cwd(), "packages", "webui", "src", "components", "topology", "TopologyRunStrip.tsx"), "utf-8")

describe("task0420 run flow user wording", () => {
  it("uses Korean relation mode labels in Korean mode", () => {
    expect(relationToolbarSource).not.toContain('labelKo: "Next"')
    expect(relationToolbarSource).not.toContain('labelKo: "Delegate"')
    expect(relationToolbarSource).not.toContain('labelKo: "Approve"')
    expect(relationToolbarSource).not.toContain('labelKo: "Use"')
    expect(relationToolbarSource).not.toContain('labelKo: "Report"')
    expect(relationToolbarSource).not.toContain("Next와 Delegate")
    expect(relationToolbarSource).not.toContain("실행 path")

    expect(relationToolbarSource).toContain('labelKo: "다음 단계"')
    expect(relationToolbarSource).toContain('labelKo: "위임"')
    expect(relationToolbarSource).toContain('labelKo: "승인"')
    expect(relationToolbarSource).toContain('labelKo: "사용"')
    expect(relationToolbarSource).toContain('labelKo: "보고"')
    expect(relationToolbarSource).toContain('text("추천 연결", "Smart Connect")')
    expect(relationToolbarSource).toContain("다음 단계와 위임은 실행 경로 후보로 저장")
  })

  it("uses run trace labels that match the sub-agent workflow vocabulary", () => {
    expect(traceOverlaySource).not.toContain('text("Run Trace", "Run Trace")')
    expect(traceOverlaySource).not.toContain('text("Delegation path", "Delegation path")')
    expect(traceOverlaySource).not.toContain('text("Failed candidate", "Failed candidate")')
    expect(traceOverlaySource).not.toContain('text("Observed edges", "Observed edges")')
    expect(traceOverlaySource).not.toContain("canvas에 표시")
    expect(traceOverlaySource).not.toContain("trace가 표시")

    expect(traceOverlaySource).toContain('text("실행 기록", "Run trace")')
    expect(traceOverlaySource).toContain('text("위임 경로", "Delegation path")')
    expect(traceOverlaySource).toContain('text("실패한 후보", "Failed candidate")')
    expect(traceOverlaySource).toContain('text("확인된 연결", "Observed connections")')
    expect(traceOverlaySource).toContain("작업 화면에 표시")
    expect(traceOverlaySource).toContain("실행 기록이 표시")
  })

  it("uses run strip labels instead of manual run and work order terms", () => {
    expect(runStripSource).not.toContain('text("Manual Run", "Manual Run")')
    expect(runStripSource).not.toContain('text("Target", "Target")')
    expect(runStripSource).not.toContain('text("WorkOrder Template", "WorkOrder Template")')
    expect(runStripSource).not.toContain('text("Context", "Context")')
    expect(runStripSource).not.toContain("entry 자동 선택")
    expect(runStripSource).not.toContain("workspace 실행")

    expect(runStripSource).toContain('text("수동 실행", "Manual run")')
    expect(runStripSource).toContain('text("실행 대상", "Run target")')
    expect(runStripSource).toContain('text("작업 요청 유형", "Work order template")')
    expect(runStripSource).toContain('text("실행 조건", "Run context")')
    expect(runStripSource).toContain("시작점 자동 선택")
    expect(runStripSource).toContain("작업 화면 실행")
  })
})
