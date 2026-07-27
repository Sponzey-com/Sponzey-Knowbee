import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import type { OrchestrationTask } from "../packages/core/src/contracts/sub-agent-orchestration.ts"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"
import { buildDelegatedTaskExecutionPrompt } from "../packages/core/src/runs/orchestration-dispatch.ts"

function delegatedTask(): OrchestrationTask {
  return {
    taskId: "task:summary",
    executionKind: "delegated_sub_agent",
    assignedAgentId: "agent:summary",
    scope: {
      goal: "Summarize the evidence.",
      intentType: "task_intake",
      actionType: "run_task",
      constraints: ["Use only provided evidence."],
      expectedOutputs: [{
        outputId: "summary",
        kind: "text",
        description: "Concise evidence summary.",
        required: true,
        acceptance: {
          requiredEvidenceKinds: [],
          artifactRequired: false,
          reasonCodes: [],
        },
      }],
      reasonCodes: ["delegated_scope"],
    },
    requiredCapabilities: [],
    resourceLockIds: [],
    planningTrace: {
      selectedExecutorId: "agent:summary",
      reasonCodes: ["execution_decision_selected_executor"],
    },
  }
}

describe("task0936 delegated task dispatch prompt source", () => {
  it("registers delegated task dispatch handoff as a file-backed internal prompt source", () => {
    const source = loadPromptSourceRegistry(process.cwd())
      .find((item) => item.sourceId === "delegated_task_dispatch_user" && item.locale === "en")

    expect(source).toMatchObject({ sourceId: "delegated_task_dispatch_user", usageScope: "internal", enabled: true })
    expect(source?.path.endsWith("prompts/delegated_task_dispatch_user.md")).toBe(true)
    for (const placeholder of [
      "{{renderedPrompt}}",
      "{{taskId}}",
      "{{goal}}",
      "{{actionType}}",
      "{{originalRequest}}",
      "{{expectedOutputs}}",
      "{{constraints}}",
    ]) {
      expect(source?.content).toContain(placeholder)
    }
  })

  it("renders delegated task handoff evidence from runtime values", () => {
    const prompt = buildDelegatedTaskExecutionPrompt({
      renderedPrompt: ["# system", "# sub_agent_base"].join("\n"),
      task: delegatedTask(),
      originalRequest: "증거를 요약해줘",
    })

    expect(prompt).toContain("# Delegated Task Dispatch")
    expect(prompt).toContain("# sub_agent_base")
    expect(prompt).toContain("# Delegated task")
    expect(prompt).toContain("Task ID: task:summary")
    expect(prompt).toContain("Goal: Summarize the evidence.")
    expect(prompt).toContain("# Original user request\n증거를 요약해줘")
    expect(prompt).toContain("- summary: Concise evidence summary.")
    expect(prompt).toContain("- Use only provided evidence.")
    expect(prompt).not.toContain("in the user's language")
  })

  it("does not keep the delegated task handoff envelope hardcoded in TypeScript", () => {
    const source = readFileSync("packages/core/src/runs/orchestration-dispatch.ts", "utf-8")

    expect(source).toContain('sourceId: "delegated_task_dispatch_user"')
    expect(source).not.toContain("# Delegated task")
    expect(source).not.toContain("# Original user request")
    expect(source).not.toContain("# Expected outputs")
  })
})
