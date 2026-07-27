import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"
import { buildSubSessionFeedbackCycleDirective } from "../packages/core/src/runs/review-cycle-pass.ts"
import type { FeedbackRequest } from "../packages/core/src/contracts/sub-agent-orchestration.ts"

function feedbackRequest(): FeedbackRequest {
  return {
    identity: {
      agentId: "agent:child",
      agentName: "Reviewer",
      entityType: "sub_agent",
    },
    feedbackRequestId: "feedback:0951",
    parentRunId: "run:parent",
    subSessionId: "sub:review",
    sourceResultReportIds: ["result:review"],
    previousSubSessionIds: [],
    targetAgentPolicy: "same_agent",
    carryForwardOutputs: [],
    missingItems: ["missing_evidence:answer:source"],
    conflictItems: [],
    requiredChanges: ["Add source evidence."],
    additionalConstraints: [],
    additionalContextRefs: ["context:source-check"],
    expectedRevisionOutputs: [],
    reasonCode: "required_evidence_missing",
  }
}

describe("task0951 review cycle follow-up instruction prompt source", () => {
  it("registers the instruction as a file-backed internal prompt source", () => {
    const registry = loadPromptSourceRegistry(process.cwd())
    const source = registry.find((item) => item.sourceId === "review_cycle_followup_result_report_instruction_user" && item.locale === "en")

    expect(source).toMatchObject({
      sourceId: "review_cycle_followup_result_report_instruction_user",
      usageScope: "internal",
      enabled: true,
    })
    expect(source?.path.endsWith("prompts/review_cycle_followup_result_report_instruction_user.md")).toBe(true)
    expect(source?.content).toContain("## Value")
    expect(source?.content).toContain("## Out Of Scope")
  })

  it("renders the retry directive instruction from the Value section", () => {
    const directive = buildSubSessionFeedbackCycleDirective(feedbackRequest())

    expect(directive.followupPrompt).toContain("Return a new ResultReport. Do not deliver directly to the user.")
    expect(directive.followupPrompt).toContain("Missing items:\n- missing_evidence:answer:source")
    expect(directive.followupPrompt).toContain("Required changes:\n- Add source evidence.")
    expect(directive.followupPrompt).not.toContain("# Review Cycle Follow-Up Result Report Instruction")
    expect(directive.followupPrompt).not.toContain("## Value")
  })

  it("does not keep the follow-up result report instruction hardcoded in TypeScript", () => {
    const source = readFileSync("packages/core/src/runs/review-cycle-pass.ts", "utf-8")

    expect(source).toContain("review_cycle_followup_result_report_instruction_user")
    expect(source).not.toContain("Return a new ResultReport. Do not deliver directly to the user.")
  })
})
