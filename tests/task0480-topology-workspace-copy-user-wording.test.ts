import { describe, expect, it } from "vitest"
import {
  TOPOLOGY_WORKSPACE_ADVANCED_ONLY_LABELS,
  TOPOLOGY_WORKSPACE_SECTION_POLICIES,
  containsInternalTopologyTerm,
} from "../packages/webui/src/lib/topology-workspace-copy.ts"

describe("task0480 topology workspace copy user wording", () => {
  it("uses user-facing labels for advanced-only topology workspace concepts", () => {
    expect(TOPOLOGY_WORKSPACE_ADVANCED_ONLY_LABELS).toEqual([
      "Internal work template",
      "Run context",
      "Execution preview",
      "Runtime resources",
      "Import/export data",
      "Sub-agent/team resources",
    ])

    const copy = JSON.stringify({
      labels: TOPOLOGY_WORKSPACE_ADVANCED_ONLY_LABELS,
      sections: TOPOLOGY_WORKSPACE_SECTION_POLICIES,
    })
    for (const hiddenTerm of [
      "WorkOrder Template",
      "AgentConfig",
      "SubSession",
      "NodeContract",
      "Runtime Resource Topology",
      "CompiledSnapshot",
    ]) {
      expect(copy).not.toContain(hiddenTerm)
    }
  })

  it("keeps work template and context controls described as inferred by the main agent", () => {
    const runTemplate = TOPOLOGY_WORKSPACE_SECTION_POLICIES.find(
      (item) => item.section === "runTemplatePicker",
    )
    const contextPicker = TOPOLOGY_WORKSPACE_SECTION_POLICIES.find((item) => item.section === "contextPicker")
    const runTarget = TOPOLOGY_WORKSPACE_SECTION_POLICIES.find((item) => item.section === "runTargetPanel")

    expect(runTemplate).toMatchObject({
      labelKo: "내부 작업 템플릿",
      labelEn: "Internal work template",
    })
    expect(runTemplate?.descriptionKo).toContain("메인 에이전트가 추론")
    expect(runTemplate?.descriptionEn).toContain("main agent infers")
    expect(contextPicker).toMatchObject({
      labelKo: "실행 맥락",
      labelEn: "Run context",
    })
    expect(runTarget).toMatchObject({
      labelKo: "시작 서브 에이전트",
      labelEn: "Start sub-agent",
    })
  })

  it("still detects blocked raw topology terms when generated text contains them", () => {
    expect(containsInternalTopologyTerm("Debug panel exposed WorkOrder Template")).toBe(true)
    expect(containsInternalTopologyTerm("AgentConfig was printed in a visible label")).toBe(true)
    expect(containsInternalTopologyTerm("사용자 화면의 내부 작업 템플릿")).toBe(false)
    expect(containsInternalTopologyTerm("서브 에이전트 실행 맥락")).toBe(false)
  })
})
