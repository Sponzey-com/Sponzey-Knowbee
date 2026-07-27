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

describe("task0934 structured execution brief prompt sources", () => {
  it("registers root/scheduled execution prompt sources as file-backed internal sources", () => {
    const registry = loadPromptSourceRegistry(process.cwd())
    const structured = registry.find((item) => item.sourceId === "structured_execution_brief_user" && item.locale === "en")
    const scheduled = registry.find((item) => item.sourceId === "scheduled_followup_user" && item.locale === "en")

    expect(structured).toMatchObject({ sourceId: "structured_execution_brief_user", usageScope: "internal", enabled: true })
    expect(scheduled).toMatchObject({ sourceId: "scheduled_followup_user", usageScope: "internal", enabled: true })
    expect(structured?.path.endsWith("prompts/structured_execution_brief_user.md")).toBe(true)
    expect(scheduled?.path.endsWith("prompts/scheduled_followup_user.md")).toBe(true)

    for (const placeholder of [
      "{{header}}",
      "{{introLines}}",
      "{{originalRequestBlock}}",
      "{{target}}",
      "{{destination}}",
      "{{contextBlock}}",
      "{{normalizedEnglishBlock}}",
      "{{completeConditions}}",
      "{{checklist}}",
      "{{extraSections}}",
      "{{closingLines}}",
    ]) {
      expect(structured?.content).toContain(placeholder)
    }
    for (const placeholder of ["{{structuredRequest}}", "{{preferredTargetBlock}}", "{{toolInstruction}}"]){
      expect(scheduled?.content).toContain(placeholder)
    }
  })

  it("renders root structured execution input from the prompt source", () => {
    const prompt = buildStructuredExecutionBrief({
      header: "[Root Task Execution]",
      introLines: ["This request has completed intake."],
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
      closingLines: ["Execute the actual work in checklist order."],
    })

    expect(prompt).toContain("# Structured Execution Brief")
    expect(prompt).toContain("[Root Task Execution]")
    expect(prompt).toContain("Original user request:\n보고서를 요약해줘")
    expect(prompt).toContain("[checklist]")
    expect(prompt).toContain("- [ ] Confirm goal: A concise report summary")
    expect(prompt).toContain("- [ ] Verify completion condition: Return only verified facts.")
    expect(prompt).toContain("Follow the canonical final response policy for answer language.")
  })

  it("renders scheduled follow-up input from the prompt source", () => {
    const prompt = buildScheduledFollowupPrompt({
      task: "안녕",
      goal: "안녕이라고 말하기",
      taskProfile: "general_chat",
      preferredTarget: "auto",
      toolsEnabled: false,
    })

    expect(prompt).toContain("# Scheduled Follow-Up Execution")
    expect(prompt).toContain("[Scheduled Task]")
    expect(prompt).toContain("[Scheduled Structured Request]")
    expect(prompt).toContain("[preferred_target]\nauto")
    expect(prompt).toContain("Use no tools.")
    expect(prompt).not.toContain("Original user request")
    expect(prompt).not.toContain("예약 시각")
    expect(prompt).not.toContain("도구를 사용하지 말고")
  })

  it("does not keep root/scheduled execution prompt envelopes hardcoded in TypeScript", () => {
    const requestPromptSource = readFileSync("packages/core/src/runs/request-prompt.ts", "utf-8")
    const scheduledSource = readFileSync("packages/core/src/runs/scheduled.ts", "utf-8")

    expect(requestPromptSource).toContain('sourceId: "structured_execution_brief_user"')
    expect(scheduledSource).toContain('sourceId: "scheduled_followup_user"')
    expect(requestPromptSource).not.toContain("목표 확인")
    expect(requestPromptSource).not.toContain("원래 사용자 요청")
    expect(scheduledSource).not.toContain("예약 시각이 되었습니다")
    expect(scheduledSource).not.toContain("최종 답변은 원래 사용자 요청")
  })
})
