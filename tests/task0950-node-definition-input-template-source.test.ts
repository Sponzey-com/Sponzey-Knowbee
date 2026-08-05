import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  buildNodeDefinitionPromptInput,
  defaultNodeDefinitionFieldLocks,
} from "../packages/core/src/topology/node-definition-suggestion.ts"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"

function request() {
  return {
    workspaceId: "workspace:test",
    topologyId: "topology:test",
    triggerField: "description" as const,
    targetFields: ["name", "description"] as const,
    userPrompt: "백엔드 이슈를 분석하고 작업을 작게 나눠 다음 담당자에게 넘긴다.",
    quickChips: ["분석자", "꼼꼼하게"],
    currentDraft: {
      executorId: "node:test",
      name: "",
      description: "",
      expectedOutput: "",
      successCriteria: [],
      capabilityHints: [],
      toolHints: [],
      understandingSummary: "",
      fieldLocks: defaultNodeDefinitionFieldLocks(),
    },
    fieldLocks: defaultNodeDefinitionFieldLocks(),
    graphContext: {
      incomingExecutors: [{ executorId: "node:prev", name: "접수", description: "요청 접수", direction: "incoming" as const }],
      outgoingExecutors: [{ executorId: "node:next", name: "구현", description: "작업 구현", direction: "outgoing" as const }],
      neighborConnectionMeanings: ["넘김"],
    },
  }
}

describe("task0950 node definition input prompt sources", () => {
  it("registers the input block and guidance fragments as file-backed internal prompt sources", () => {
    const registry = loadPromptSourceRegistry(process.cwd())
    const sourceIds = [
      "node_definition_input_block_user",
      "node_definition_name_guidance_user",
      "node_definition_description_guidance_user",
      "node_definition_description_review_guidance_user",
    ]

    for (const sourceId of sourceIds) {
      const source = registry.find((item) => item.sourceId === sourceId && item.locale === "en")
      expect(source).toMatchObject({ sourceId, usageScope: "internal", enabled: true })
      expect(source?.content).toContain("## Value")
      expect(source?.content).toContain("## Out Of Scope")
    }
  })

  it("renders the runtime input block from Value sections with English labels", () => {
    const input = buildNodeDefinitionPromptInput(request())

    expect(input).toContain("Sub-agent overview: 백엔드 이슈를 분석하고 작업을 작게 나눠 다음 담당자에게 넘긴다.")
    expect(input).toContain("Selected roles: 분석자")
    expect(input).toContain("Selected styles: 꼼꼼하게")
    expect(input).toContain("Previous sub-agents: 접수")
    expect(input).toContain("Next sub-agents: 구현")
    expect(input).toContain("Target fields: name, description")
    expect(input).toContain("Name writing instruction")
    expect(input).toContain("Description writing instruction")
    expect(input).toContain("Final review instruction")
    expect(input).not.toContain("# Node Definition Input Block")
    expect(input).not.toContain("## Value")
  })

  it("does not keep Korean prompt labels or guidance bodies hardcoded in TypeScript", () => {
    const source = readFileSync("packages/core/src/topology/node-definition-suggestion.ts", "utf-8")

    expect(source).toContain("node_definition_input_block_user")
    expect(source).toContain("node_definition_name_guidance_user")
    expect(source).not.toContain("서브 에이전트 개요:")
    expect(source).not.toContain("선택한 역할:")
    expect(source).not.toContain("성격과 하는 일 작성 지침")
    expect(source).not.toContain("최종 검토 지침")
    expect(source).not.toContain("5~8문장")
  })
})
