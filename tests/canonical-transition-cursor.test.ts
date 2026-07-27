import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import type { CanonicalWorkAggregate } from "../packages/core/src/contracts/canonical-work-aggregate.ts"
import { resolveCanonicalTransitionCursor } from "../packages/core/src/runs/canonical-transition-cursor.ts"

function aggregate(
  state: CanonicalWorkAggregate["state"],
  revision: number,
): CanonicalWorkAggregate {
  return {
    workId: "work:root:run-1",
    rootRunId: "run-1",
    state,
    revision,
    transitions: [],
  }
}

describe("canonical transition cursor", () => {
  it("uses the current aggregate revision instead of a stage constant", () => {
    expect(
      resolveCanonicalTransitionCursor({
        aggregate: aggregate("SOLUTION_ANALYZED", 7),
        expectedState: "SOLUTION_ANALYZED",
      }),
    ).toEqual({
      ok: true,
      expectedRevision: 7,
    })
  })

  it("closes missing aggregate and state mismatch before mutation", () => {
    expect(
      resolveCanonicalTransitionCursor({
        aggregate: undefined,
        expectedState: "REQUEST_RECEIVED",
      }),
    ).toEqual({
      ok: false,
      reasonCode: "canonical_transition_aggregate_not_found",
    })
    expect(
      resolveCanonicalTransitionCursor({
        aggregate: aggregate("EXECUTING", 8),
        expectedState: "POLICY_VALIDATED",
      }),
    ).toEqual({
      ok: false,
      reasonCode: "canonical_transition_state_mismatch",
      currentState: "EXECUTING",
      currentRevision: 8,
    })
  })

  it("removes intake stage revision constants from runtime wiring", () => {
    const source = readFileSync(
      new URL("../packages/core/src/runs/start-driver-dependencies.ts", import.meta.url),
      "utf8",
    )

    expect(source).not.toContain("expectedRevision: 0,")
    expect(source).not.toContain("expectedRevision: 1,")
    expect(source).not.toContain("expectedRevision: 2,")
    expect(source.split("resolveCanonicalTransitionCursor").length - 1).toBeGreaterThanOrEqual(4)
  })
})
