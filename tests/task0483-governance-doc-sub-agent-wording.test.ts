import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const agents = readFileSync(new URL("../AGENTS.md", import.meta.url), "utf-8")
const runbook = readFileSync(new URL("../docs/release-runbook.md", import.meta.url), "utf-8")
const topologySource = readFileSync(
  new URL("../packages/webui/src/components/topology/source.md", import.meta.url),
  "utf-8",
)

describe("task0483 governance docs sub-agent wording", () => {
  it("keeps AGENTS.md development guidance aligned with sub-agent terminology", () => {
    for (const blocked of [
      "자동화 실행자",
      "연결되지 않은 실행자",
      "diagnostic-only 실행자",
      "암묵적 첫 노드 선택",
      "어떤 실행자가 적합",
      "대상 실행자",
      "노드를 그리고",
      "선택한 노드를 정의",
      "노드 이름",
      "드래그 중인 노드",
      "실행 중인 노드",
      "자연어 의미 기반 실행자 선택",
      "ExecutorGraph 중심",
      "WorkOrder/manual run/compile preview",
    ]) {
      expect(agents).not.toContain(blocked)
    }

    expect(agents).toContain("Keep agent relationships explicit.")
    expect(agents).toContain("The main agent delegates only to direct children")
    expect(agents).toContain("A parent validates child evidence before final")
    expect(agents).toContain("bypassed parent-child topology")
  })

  it("keeps release rollback checks on the current user-facing topology terms", () => {
    for (const blocked of ["Resources, Compile Preview", "Run Target", "WorkOrder Template"]) {
      expect(runbook).not.toContain(blocked)
    }

    expect(runbook).toContain("runtime resources, execution preview, import/export data")
    expect(runbook).toContain("internal work template, run context")
    expect(runbook).toContain("start sub-agent picker")
  })

  it("keeps topology component source notes aligned with the hidden advanced surface names", () => {
    expect(topologySource).not.toContain("WorkOrder Template")
    expect(topologySource).not.toContain("compile preview")
    expect(topologySource).toContain("내부 작업 템플릿")
    expect(topologySource).toContain("실행 구조 미리보기")
  })
})
