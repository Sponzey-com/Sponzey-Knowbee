import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { buildToolResultSummary } from "../packages/webui/src/lib/approval-preview.ts"

const toolCallPanelSource = readFileSync(
  join(process.cwd(), "packages", "webui", "src", "components", "ToolCallPanel.tsx"),
  "utf-8",
)

const ko = (koText: string) => koText

describe("task0441 tool call and approval center redaction", () => {
  it("summarizes tool call inputs and results instead of rendering raw payloads", () => {
    expect(toolCallPanelSource).not.toContain("JSON.stringify(call.params")
    expect(toolCallPanelSource).not.toContain("displayText(call.result")
    expect(toolCallPanelSource).not.toContain("{call.name}</span>")
    expect(toolCallPanelSource).toContain("buildApprovalParamSummary(call.params, text)")
    expect(toolCallPanelSource).toContain("buildToolResultSummary(call.result, call.success, text)")
    expect(toolCallPanelSource).toContain("describeApprovalToolName(call.name, text)")
  })

  it("summarizes tool results without leaking long or sensitive content", () => {
    const summary = buildToolResultSummary(
      "Bearer sk-test-secret-token inside /Users/example/private/output.txt".repeat(4),
      false,
      ko,
    ).join(" ")

    expect(summary).toContain("오류 기록 있음")
    expect(summary).toContain("긴 결과 내용은 숨김")
    expect(summary).toContain("민감하거나 긴 값")
    expect(summary).not.toContain("sk-test-secret-token")
    expect(summary).not.toContain("/Users/example")
  })
})
