import { describe, expect, it } from "vitest"

import { resolveRunTimelineAudience } from "../packages/core/src/api/routes/runs.ts"
import { projectWebUiBroadcastPayload } from "../packages/core/src/api/ws/stream.ts"
import { INTERNAL_LLM_DATA_MASK } from "../packages/core/src/security/internal-llm-data.ts"
import { redactUiValue } from "../packages/core/src/ui/redaction.ts"

describe("task018 internal LLM transport boundary", () => {
  it("redacts nested and stringified internal LLM data from every WebSocket broadcast", () => {
    const payload = projectWebUiBroadcastPayload({
      type: "agent.stream",
      status: "running",
      nested: {
        request_diagnosis: { goal: "private goal" },
      },
      serialized: JSON.stringify({
        solution_plan: { steps: ["private step"] },
      }),
    })
    const serialized = JSON.stringify(payload)

    expect(payload).toMatchObject({ type: "agent.stream", status: "running" })
    expect(serialized).not.toContain("private goal")
    expect(serialized).not.toContain("private step")
    expect(serialized).toContain(INTERNAL_LLM_DATA_MASK)
  })

  it("redacts Yeonjang validation evidence from every WebSocket broadcast", () => {
    const payload = projectWebUiBroadcastPayload({
      type: "agent.artifact",
      sessionId: "session-task081",
      runId: "run-task081",
      caption:
        "yeonjang-goal-validation:screen_capture:candidate_not_validated:result_diagnosis_not_sufficient operationId=operation:task081 receipt payload raw observed state",
      nested: {
        message:
          "yeonjang-goal-validation:mouse_click:candidate_not_validated:result_diagnosis_not_sufficient operation:task081",
      },
    })
    const serialized = JSON.stringify(payload)

    expect(serialized).toContain("[internal-evidence-redacted]")
    expect(serialized).not.toContain("yeonjang-goal-validation")
    expect(serialized).not.toContain("operationId")
    expect(serialized).not.toContain("operation:task081")
    expect(serialized).not.toContain("receipt payload")
    expect(serialized).not.toContain("raw observed state")
  })

  it("redacts stringified internal LLM data from the shared public export projection", () => {
    const projected = redactUiValue(
      {
        status: "completed",
        detail: JSON.stringify({ result_diagnosis: { reason: "private reasoning" } }),
      },
      { audience: "export" },
    )

    expect(projected.value).toEqual({
      status: "completed",
      detail: INTERNAL_LLM_DATA_MASK,
    })
    expect(projected.redactions).toEqual([
      { path: "detail", reason: "internal_llm_data" },
    ])
  })

  it("does not let a public run timeline query promote export visibility", () => {
    expect(resolveRunTimelineAudience("developer", "public")).toBe("user")
    expect(resolveRunTimelineAudience("developer", "audit")).toBe("developer")
    expect(resolveRunTimelineAudience("user", "audit")).toBe("user")
  })
})
