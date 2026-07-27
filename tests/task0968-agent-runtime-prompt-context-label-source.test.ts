import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"

describe("task0968 agent runtime prompt context label source", () => {
  it("registers agent runtime prompt context labels as a file-backed internal prompt source", () => {
    const source = loadPromptSourceRegistry(process.cwd())
      .find((item) => item.sourceId === "agent_runtime_prompt_context_labels_user" && item.locale === "en")
    const intakeLabels = loadPromptSourceRegistry(process.cwd())
      .find((item) => item.sourceId === "intake_conversation_context_labels_user" && item.locale === "en")

    expect(source).toMatchObject({
      sourceId: "agent_runtime_prompt_context_labels_user",
      usageScope: "internal",
      enabled: true,
    })
    expect(source?.path.endsWith("prompts/agent_runtime_prompt_context_labels_user.md")).toBe(true)
    expect(source?.content).toContain("runtime_header=[Runtime]")
    expect(source?.content).toContain("instruction_chain_header=[Instruction Chain]")
    expect(source?.content).toContain("tool_failure_header=[tool_failure]")
    expect(source?.content).toContain("details_header=[details]")
    expect(source?.content).toContain("## Out Of Scope")
    expect(intakeLabels?.content).toContain("original_user_request=Original user request:")
  })

  it("does not keep agent runtime prompt context labels hardcoded in TypeScript", () => {
    const agentSource = readFileSync("packages/core/src/agent/index.ts", "utf-8")
    const completionReviewSource = readFileSync("packages/core/src/agent/completion-review.ts", "utf-8")
    const intakeSource = readFileSync("packages/core/src/agent/intake.ts", "utf-8")

    expect(agentSource).toContain('AGENT_RUNTIME_PROMPT_CONTEXT_LABELS_SOURCE_ID = "agent_runtime_prompt_context_labels_user"')
    expect(completionReviewSource).toContain('AGENT_RUNTIME_PROMPT_CONTEXT_LABELS_SOURCE_ID = "agent_runtime_prompt_context_labels_user"')
    expect(intakeSource).toContain('AGENT_RUNTIME_PROMPT_CONTEXT_LABELS_SOURCE_ID = "agent_runtime_prompt_context_labels_user"')
    expect(agentSource).not.toContain("`[Runtime]\\nToday is ${")
    expect(agentSource).not.toContain("`\\n[Instruction Chain]\\n${instructions.mergedText}`")
    expect(agentSource).not.toContain("\"[tool_failure]\"")
    expect(agentSource).not.toContain("`[details]\\n${details}`")
    expect(agentSource).not.toContain("\"(no output)\"")
    expect(completionReviewSource).not.toContain("`\\n[Instruction Chain]\\n${instructions.mergedText}`")
    expect(intakeSource).not.toContain("`Original user request: ${conversationContext}`")
    expect(intakeSource).not.toContain("`\\n[Instruction Chain]\\n${instructions.mergedText}`")
  })
})
