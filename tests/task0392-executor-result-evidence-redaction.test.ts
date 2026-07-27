import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(
  join(process.cwd(), "packages", "webui", "src", "components", "topology", "ExecutorRunResultPanel.tsx"),
  "utf-8",
)

describe("task0392 executor result evidence redaction", () => {
  it("does not render raw evidence identifiers in the advanced run evidence list", () => {
    expect(source).not.toContain("{item.source}: {item.evidenceId}")
    expect(source).not.toContain("` / ${item.inferenceEvidenceRef}`")
    expect(source).toContain("function evidenceSourceLabel(")
    expect(source).toContain('text("전체 실행", "Full run")')
    expect(source).toContain('text("실행 단계", "Run step")')
    expect(source).toContain('text("실패 진단", "Failure diagnosis")')
    expect(source).toContain('text("근거 연결됨", "Evidence linked")')
    expect(source).toContain('text(" / 추론 근거 연결됨", " / Inference evidence linked")')
  })

  it("does not render raw tool ids in user-facing tried-action labels", () => {
    expect(source).not.toContain("`${toolCall.toolId} 실행`")
    expect(source).not.toContain("`Tool ${toolCall.toolId}`")
    expect(source).not.toContain('"Checked runtime state"')
    expect(source).toContain('add("외부 도구 실행", "External tool execution")')
    expect(source).toContain('"Checked run state"')
  })
})
