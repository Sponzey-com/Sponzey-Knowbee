import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import type { AIChunk, AIProvider, ChatParams } from "../packages/core/src/ai/types.ts"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"
import {
  createFileBackedSolutionPlanProvider,
  selectSolutionPlanPromptSources,
} from "../packages/core/src/orchestration/prompt-policy-adapter.ts"

const roots: string[] = []

class FakeProvider implements AIProvider {
  readonly id = "fake"
  readonly supportedModels = ["fake-model"]
  readonly calls: ChatParams[] = []
  maxContextTokens(): number {
    return 16_000
  }
  async *chat(params: ChatParams): AsyncGenerator<AIChunk> {
    this.calls.push(params)
    yield {
      type: "text_delta",
      delta: JSON.stringify({
        ownerAgentName: "마당쇠",
        steps: [
          {
            step_id: "one",
            owner_agent_name: "마당쇠",
            action_type: "direct_answer",
            input_refs: ["request:1"],
            expected_output: "Answer.",
            completion_criteria: "Answer exists.",
            status: "pending",
          },
        ],
      }),
    }
  }
}

function root(files: Record<string, string>): string {
  const value = mkdtempSync(join(tmpdir(), "knowbee-plan-prompts-"))
  roots.push(value)
  mkdirSync(join(value, "prompts"))
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(value, "prompts", name), content)
  }
  return value
}

afterEach(() => {
  while (roots.length) rmSync(roots.pop() ?? "", { recursive: true, force: true })
})

describe("task014 file-backed solution-plan provider", () => {
  it("selects and renders only work-record and workflow sources", async () => {
    const workDir = root({
      "work_record.md": "# Work Record\nWORK_RECORD_PLAN_MARKER\n",
      "workflow.md": "# Workflow\nWORKFLOW_PLAN_MARKER\n",
      "solution_plan_json_instruction_user.md":
        "# Instruction\n\n## Value\nReturn LlmSolutionPlanPayload JSON.\n",
    })
    expect(
      selectSolutionPlanPromptSources({
        sources: loadPromptSourceRegistry(workDir),
        locale: "en",
      }).map((source) => source.sourceId),
    ).toEqual(["work_record", "workflow"])

    const provider = new FakeProvider()
    const adapter = createFileBackedSolutionPlanProvider({ provider, model: "fake-model", workDir })
    await adapter.planSolution({
      workId: "work:1",
      runId: "run:1",
      ownerAgentName: "마당쇠",
      requestDiagnosisReceiptId: "receipt:diagnosis:1",
      goal: "Answer.",
      constraints: [],
      capabilityRefs: [],
      completionCriteria: ["Answer exists."],
    })
    expect(provider.calls[0]?.system).toContain("WORK_RECORD_PLAN_MARKER")
    expect(provider.calls[0]?.system).toContain("WORKFLOW_PLAN_MARKER")
  })

  it("fails closed when either required planning source is missing", () => {
    const workDir = root({ "workflow.md": "# Workflow\n" })
    expect(() =>
      createFileBackedSolutionPlanProvider({
        provider: new FakeProvider(),
        model: "fake-model",
        workDir,
      }),
    ).toThrow(/solution plan prompt sources missing: work_record/i)
  })
})
