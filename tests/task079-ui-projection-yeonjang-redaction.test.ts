import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { redactUiValue } from "../packages/core/src/ui/redaction.ts"
import { buildRunRuntimeInspectorProjection } from "../packages/core/src/runs/runtime-inspector-projection.ts"
import type { RootRun } from "../packages/core/src/runs/types.ts"
import { createTestDbRuntimeFixture, type TestDbRuntimeFixture } from "./fixtures/runtime-db.ts"

let dbRuntime: TestDbRuntimeFixture

beforeEach(() => {
  dbRuntime = createTestDbRuntimeFixture("knowbee-ui-projection-redaction-")
})

afterEach(() => {
  dbRuntime.dispose()
})

describe("task079 UI projection Yeonjang redaction", () => {
  it("redacts Yeonjang validation refs and side-effect internals through the common UI redaction adapter", () => {
    const value = redactUiValue({
      summary:
        "yeonjang-goal-validation:mouse_click:candidate_not_validated:result_diagnosis_not_sufficient operationId=operation:run-079 receipt payload raw observed state DB row structured diagnosis payload",
    }, { audience: "advanced" })

    const serialized = JSON.stringify(value.value)
    expect(serialized).toContain("[internal-evidence-redacted]")
    expect(serialized).not.toContain("yeonjang-goal-validation")
    expect(serialized).not.toContain("operationId")
    expect(serialized).not.toContain("operation:run-079")
    expect(serialized).not.toContain("receipt payload")
    expect(serialized).not.toContain("raw observed state")
    expect(serialized).not.toContain("DB row")
    expect(serialized).not.toContain("structured diagnosis payload")
    expect(value.redactions.some((item) => item.reason === "internal_llm_data")).toBe(true)
  })

  it("keeps runtime inspector timeline free of Yeonjang internal evidence tokens", () => {
    const run: RootRun = {
      id: "run:task079",
      sessionId: "session:task079",
      source: "webui",
      status: "running",
      summary: "running",
      canCancel: true,
      steps: [],
      recentEvents: [
        {
          id: "event:task079",
          at: 1,
          label:
            "yeonjang-goal-validation:screen_capture:candidate_not_validated:result_diagnosis_not_sufficient operationId=operation:run-079 raw observed state",
        },
      ],
    }

    const projection = buildRunRuntimeInspectorProjection(run, {
      typedTrace: null,
      limit: 20,
    })

    const serialized = JSON.stringify(projection.timeline)
    expect(serialized).toContain("[internal-evidence-redacted]")
    expect(serialized).not.toContain("yeonjang-goal-validation")
    expect(serialized).not.toContain("operationId")
    expect(serialized).not.toContain("operation:run-079")
    expect(serialized).not.toContain("raw observed state")
  })
})
