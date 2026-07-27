import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"
import { buildStructuredExecutionBrief } from "../packages/core/src/runs/request-prompt.ts"
import { buildScheduledFollowupPrompt } from "../packages/core/src/runs/scheduled.ts"

const executionSemantics = {
  filesystemEffect: "none" as const,
  privilegedOperation: "none" as const,
  artifactDelivery: "none" as const,
  approvalRequired: false,
  approvalTool: "external_action" as const,
}

describe("task0967 structured execution section label source", () => {
  it("registers structured execution section labels as a file-backed internal prompt source", () => {
    const source = loadPromptSourceRegistry(process.cwd())
      .find((item) => item.sourceId === "structured_execution_section_labels_user" && item.locale === "en")

    expect(source).toMatchObject({
      sourceId: "structured_execution_section_labels_user",
      usageScope: "internal",
      enabled: true,
    })
    expect(source?.path.endsWith("prompts/structured_execution_section_labels_user.md")).toBe(true)
    expect(source?.content).toContain("context_header=[context]")
    expect(source?.content).toContain("normalized_english_header=[normalized-english]")
    expect(source?.content).toContain("target_label=Target:")
    expect(source?.content).toContain("preferred_target_header=[preferred_target]")
    expect(source?.content).toContain("## Out Of Scope")
  })

  it("renders root and scheduled execution labels from the prompt source", () => {
    const rootPrompt = buildStructuredExecutionBrief({
      header: "[Root Task Execution]",
      originalRequest: "보고서를 요약해줘",
      structuredRequest: {
        source_language: "ko",
        normalized_english: "Summarize the report.",
        target: "A concise report summary",
        to: "current channel",
        context: ["Report path: /tmp/report.md"],
        complete_condition: ["Return only verified facts."],
      },
      executionSemantics,
    })
    const scheduledPrompt = buildScheduledFollowupPrompt({
      task: "안녕이라고 말하기",
      goal: "Say hello",
      taskProfile: "general_chat",
      preferredTarget: "auto",
      toolsEnabled: false,
      destination: "telegram chat 1, main thread",
    })

    expect(rootPrompt).toContain("[context]\n- Report path: /tmp/report.md")
    expect(rootPrompt).toContain("[normalized-english]\nSummarize the report.")
    expect(scheduledPrompt).toContain("Target: Say hello")
    expect(scheduledPrompt).toContain("To: telegram chat 1, main thread")
    expect(scheduledPrompt).toContain("Context: Scheduled task payload: 안녕이라고 말하기")
    expect(scheduledPrompt).toContain("Complete condition: The scheduled task is executed at the scheduled time.")
    expect(scheduledPrompt).toContain("[preferred_target]\nauto")
  })

  it("does not keep structured execution section labels hardcoded in TypeScript", () => {
    const requestPromptSource = readFileSync("packages/core/src/runs/request-prompt.ts", "utf-8")
    const scheduledSource = readFileSync("packages/core/src/runs/scheduled.ts", "utf-8")

    expect(requestPromptSource).toContain('STRUCTURED_EXECUTION_SECTION_LABELS_SOURCE_ID = "structured_execution_section_labels_user"')
    expect(scheduledSource).toContain('STRUCTURED_EXECUTION_SECTION_LABELS_SOURCE_ID = "structured_execution_section_labels_user"')
    expect(requestPromptSource).not.toContain("\"[context]\"")
    expect(requestPromptSource).not.toContain("\"[normalized-english]\"")
    expect(scheduledSource).not.toContain("`Target: ${target}`")
    expect(scheduledSource).not.toContain("`To: ${destination}`")
    expect(scheduledSource).not.toContain("`Context: ${contextLines.join(\" | \")}`")
    expect(scheduledSource).not.toContain("`Complete condition: ${completeConditionLines.join(\" | \")}`")
    expect(scheduledSource).not.toContain("`[preferred_target]\\n${preferredTarget}`")
  })
})
