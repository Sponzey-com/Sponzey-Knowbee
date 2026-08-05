import { describe, expect, it, vi } from "vitest"
import {
  applyCanonicalWorkEvent,
  createCanonicalWorkAggregate,
  type CanonicalWorkAggregate,
} from "../packages/core/src/contracts/canonical-work-aggregate.ts"
import {
  executeCanonicalWorkTransition,
  type CanonicalWorkRepository,
} from "../packages/core/src/runs/canonical-work-transition-use-case.ts"

function aggregate(): CanonicalWorkAggregate {
  return createCanonicalWorkAggregate({ workId: "work:1", rootRunId: "run:1" })
}

describe("canonical work aggregate", () => {
  it("creates REQUEST_RECEIVED revision zero and appends an immutable transition receipt", () => {
    const initial = aggregate()
    const result = applyCanonicalWorkEvent({
      aggregate: initial,
      expectedRevision: 0,
      event: "DIAGNOSIS_ACCEPTED",
      receiptRef: "receipt:diagnosis:1",
    })

    expect(result).toMatchObject({
      applied: true,
      aggregate: {
        state: "SOLUTION_ANALYZED",
        revision: 1,
        transitions: [{ revision: 1, previousState: "REQUEST_RECEIVED", nextState: "SOLUTION_ANALYZED" }],
      },
    })
    expect(initial).toEqual({
      workId: "work:1",
      rootRunId: "run:1",
      state: "REQUEST_RECEIVED",
      revision: 0,
      transitions: [],
    })
  })

  it("rejects stale revisions and invalid transitions without changing the aggregate", () => {
    expect(applyCanonicalWorkEvent({
      aggregate: aggregate(),
      expectedRevision: 1,
      event: "DIAGNOSIS_ACCEPTED",
      receiptRef: "receipt:1",
    })).toEqual({ applied: false, reasonCode: "stale_revision", currentRevision: 0 })

    expect(applyCanonicalWorkEvent({
      aggregate: aggregate(),
      expectedRevision: 0,
      event: "EXECUTION_STARTED",
      receiptRef: "receipt:2",
    })).toMatchObject({ applied: false, reasonCode: "transition_not_allowed" })
  })
})

describe("canonical work transition use case", () => {
  it("loads, transitions, saves with CAS, and returns a one-way RootRun projection", () => {
    const save = vi.fn(() => ({ saved: true as const }))
    const repository: CanonicalWorkRepository = { load: () => aggregate(), save }

    const result = executeCanonicalWorkTransition({
      repository,
      input: {
        workId: "work:1",
        expectedRevision: 0,
        event: "DIAGNOSIS_ACCEPTED",
        receiptRef: "receipt:diagnosis:1",
      },
    })

    expect(result).toMatchObject({
      status: "applied",
      aggregate: { state: "SOLUTION_ANALYZED", revision: 1 },
      runProjection: { canonicalState: "SOLUTION_ANALYZED", runStatus: "running", lossy: true },
    })
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 0 }))
  })

  it("does not save missing, stale, invalid, or projection-incomplete transitions", () => {
    const save = vi.fn(() => ({ saved: true as const }))
    const missing: CanonicalWorkRepository = { load: () => undefined, save }
    expect(executeCanonicalWorkTransition({
      repository: missing,
      input: { workId: "missing", expectedRevision: 0, event: "DIAGNOSIS_ACCEPTED", receiptRef: "receipt:1" },
    })).toEqual({ status: "rejected", reasonCode: "aggregate_not_found" })

    const existing: CanonicalWorkRepository = { load: () => aggregate(), save }
    expect(executeCanonicalWorkTransition({
      repository: existing,
      input: { workId: "work:1", expectedRevision: 1, event: "DIAGNOSIS_ACCEPTED", receiptRef: "receipt:2" },
    })).toMatchObject({ status: "rejected", reasonCode: "stale_revision" })
    expect(executeCanonicalWorkTransition({
      repository: existing,
      input: { workId: "work:1", expectedRevision: 0, event: "INPUT_REQUIRED", receiptRef: "receipt:3" },
    })).toEqual({ status: "rejected", reasonCode: "waiting_kind_required" })
    expect(save).not.toHaveBeenCalled()
  })

  it("returns a persistence conflict instead of overwriting a newer revision", () => {
    const repository: CanonicalWorkRepository = {
      load: () => aggregate(),
      save: () => ({ saved: false, reasonCode: "revision_conflict", currentRevision: 1 }),
    }
    expect(executeCanonicalWorkTransition({
      repository,
      input: { workId: "work:1", expectedRevision: 0, event: "DIAGNOSIS_ACCEPTED", receiptRef: "receipt:1" },
    })).toEqual({ status: "conflict", reasonCode: "revision_conflict", currentRevision: 1 })
  })
})
