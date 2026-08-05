import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const canvasSource = readFileSync(
  join(process.cwd(), "packages", "webui", "src", "components", "topology", "TopologyWorkspaceCanvas.tsx"),
  "utf-8",
)
const pageSource = readFileSync(join(process.cwd(), "packages", "webui", "src", "pages", "TopologyPage.tsx"), "utf-8")

describe("task0449 topology model redaction", () => {
  it("does not include provider/model ID combinations in topology canvas summaries", () => {
    expect(canvasSource).not.toContain("[inspector.model.providerId, inspector.model.modelId].filter(Boolean).join")
    expect(canvasSource).not.toContain("`${model} (${availability})`")
    expect(canvasSource).toContain("`AI 모델 설정됨 (${availability})`")
  })

  it("does not render provider, model, or fallback IDs in the topology page model card", () => {
    expect(pageSource).not.toContain("{agent.model.providerId ?? \"-\"} / {agent.model.modelId ?? \"-\"}")
    expect(pageSource).not.toContain("{agent.model.fallbackModelId ?? \"-\"}")
    expect(pageSource).toContain("agentModelSummary(agent, text)")
    expect(pageSource).toContain('agent.model.fallbackModelId ? text("준비됨", "Ready") : text("없음", "None")')
  })

  it("does not fall back to raw availability or runtime status values", () => {
    expect(canvasSource).not.toContain("return status")
    expect(canvasSource).not.toContain("return availability")
    expect(canvasSource).toContain('return "상태 확인 필요"')
    expect(canvasSource).toContain('return "기능 확인 필요"')
    expect(canvasSource).toContain('return "모델 확인 필요"')
  })
})
