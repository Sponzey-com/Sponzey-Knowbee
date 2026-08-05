import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"
import { buildStructuredExecutionBrief } from "../packages/core/src/runs/request-prompt.ts"

function executionSemantics(input: {
  filesystemEffect?: "none" | "read" | "mutate"
  artifactDelivery?: "none" | "direct" | "reference"
} = {}) {
  return {
    filesystemEffect: input.filesystemEffect ?? "none",
    privilegedOperation: "none" as const,
    artifactDelivery: input.artifactDelivery ?? "none",
    approvalRequired: false,
    approvalTool: "external_action" as const,
  }
}

function buildPrompt(input: {
  target?: string
  destination?: string
  completeConditions?: string[]
  filesystemEffect?: "none" | "read" | "mutate"
  artifactDelivery?: "none" | "direct" | "reference"
} = {}): string {
  return buildStructuredExecutionBrief({
    header: "[Root Task Execution]",
    originalRequest: "보고서를 요약해줘",
    structuredRequest: {
      source_language: "ko",
      normalized_english: "Summarize the report.",
      target: input.target ?? "A concise report summary",
      to: input.destination ?? "current channel",
      context: [],
      complete_condition: input.completeConditions ?? ["Return only verified facts."],
    },
    executionSemantics: executionSemantics({
      filesystemEffect: input.filesystemEffect,
      artifactDelivery: input.artifactDelivery,
    }),
  })
}

describe("task0945 structured execution checklist fragment prompt sources", () => {
  it("registers default value and checklist fragment sources as file-backed internal sources", () => {
    const registry = loadPromptSourceRegistry(process.cwd())
    const sourceIds = [
      "execution_default_target_user",
      "execution_default_destination_user",
      "execution_default_complete_condition_user",
      "structured_execution_checklist_confirm_goal_user",
      "structured_execution_checklist_filesystem_work_user",
      "structured_execution_checklist_general_work_user",
      "structured_execution_checklist_complete_condition_user",
      "structured_execution_checklist_direct_artifact_user",
      "structured_execution_checklist_final_result_user",
      "structured_execution_checklist_stop_condition_user",
    ]

    for (const sourceId of sourceIds) {
      const source = registry.find((item) => item.sourceId === sourceId && item.locale === "en")
      expect(source).toMatchObject({ sourceId, usageScope: "internal", enabled: true })
      expect(source?.content).toContain("## Value")
      expect(source?.content).toContain("## Out Of Scope")
    }
  })

  it("renders the checklist from Value sections for ordinary work", () => {
    const prompt = buildPrompt()

    expect(prompt).toContain("- [ ] Confirm goal: A concise report summary")
    expect(prompt).toContain("- [ ] Perform the requested real work.")
    expect(prompt).toContain("- [ ] Verify completion condition: Return only verified facts.")
    expect(prompt).toContain("- [ ] Deliver the final result to current channel.")
    expect(prompt).toContain("- [ ] Confirm completed items internally with [x] and stop only when no items remain.")
    expect(prompt).not.toContain("# Structured Execution Checklist")
  })

  it("renders filesystem and direct artifact checklist variants from Value sections", () => {
    const prompt = buildPrompt({
      filesystemEffect: "mutate",
      artifactDelivery: "direct",
      destination: "current channel",
    })

    expect(prompt).toContain("- [ ] Create or modify the actual file or folder result.")
    expect(prompt).toContain("- [ ] Deliver the artifact itself to current channel.")
    expect(prompt).not.toContain("- [ ] Perform the requested real work.")
    expect(prompt).not.toContain("- [ ] Deliver the final result to current channel.")
  })

  it("renders default target, destination, and completion condition from Value sections", () => {
    const prompt = buildPrompt({
      target: "",
      destination: "",
      completeConditions: [],
    })

    expect(prompt).toContain("[target]\nExecute the requested work.")
    expect(prompt).toContain("[to]\nthe current channel")
    expect(prompt).toContain("[complete-condition]\n- Produce the requested result in the current execution.")
    expect(prompt).toContain("- [ ] Verify completion condition: Produce the requested result in the current execution.")
  })

  it("does not keep checklist and default fallback bodies hardcoded in request-prompt TypeScript", () => {
    const source = readFileSync("packages/core/src/runs/request-prompt.ts", "utf-8")

    expect(source).toContain("structured_execution_checklist_confirm_goal_user")
    expect(source).toContain("execution_default_target_user")
    expect(source).not.toContain("Confirm goal:")
    expect(source).not.toContain("Create or modify the actual file or folder result.")
    expect(source).not.toContain("Perform the requested real work.")
    expect(source).not.toContain("Produce the requested result in the current execution.")
    expect(source).not.toContain("the current channel")
  })
})
