import { describe, expect, it, vi } from "vitest"
import { buildRunExecutionOutcomes } from "../packages/core/src/api/routes/runs.ts"

describe("run route public execution outcome projection", () => {
  it("indexes only closed public outcome codes by run ID", () => {
    const readOutcome = vi.fn((runId: string) =>
      runId === "run:current"
        ? {
            executionStatus: "exhausted" as const,
            deliveryStatus: "delivered" as const,
          }
        : undefined,
    )

    expect(buildRunExecutionOutcomes(
      [{ id: "run:current" }, { id: "run:legacy" }],
      readOutcome,
    )).toEqual({
      "run:current": {
        executionStatus: "exhausted",
        deliveryStatus: "delivered",
      },
    })
    expect(readOutcome).toHaveBeenCalledTimes(2)
  })
})
