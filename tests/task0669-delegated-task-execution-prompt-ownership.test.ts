import { describe, expect, it } from "vitest"
import type { OrchestrationTask } from "../packages/core/src/contracts/sub-agent-orchestration.ts"
import { buildDelegatedTaskExecutionPrompt } from "../packages/core/src/runs/orchestration-dispatch.ts"

function task(): OrchestrationTask {
  return {
    taskId: "task:research",
    executionKind: "delegated_sub_agent",
    assignedAgentId: "agent:research",
    scope: {
      goal: "Find the requested evidence.",
      intentType: "task_intake",
      actionType: "run_task",
      constraints: ["Use only the delegated scope."],
      expectedOutputs: [{
        outputId: "answer",
        kind: "text",
        description: "Evidence summary.",
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
      selectedExecutorId: "agent:research",
      reasonCodes: ["execution_decision_selected_executor"],
    },
  }
}

describe("task0669 delegated task execution prompt ownership", () => {
  it("keeps execution prompt focused on handoff payload instead of duplicating sub-agent policy", () => {
    const prompt = buildDelegatedTaskExecutionPrompt({
      renderedPrompt: [
        "# system",
        "# sub_agent_base",
        "# sub_agent_delegation",
      ].join("\n"),
      task: task(),
      originalRequest: "증거를 찾아줘",
    })

    expect(prompt).toContain("# sub_agent_base")
    expect(prompt).toContain("# Delegated task")
    expect(prompt).toContain("Task ID: task:research")
    expect(prompt).toContain("Goal: Find the requested evidence.")
    expect(prompt).toContain("# Original user request\n증거를 찾아줘")
    expect(prompt).toContain("- answer: Evidence summary.")
    expect(prompt).toContain("- Use only the delegated scope.")
    expect(prompt).not.toContain("Work as the assigned sub-agent.")
    expect(prompt).not.toContain("Keep the response concise")
    expect(prompt).not.toContain("in the user's language")
  })
})
