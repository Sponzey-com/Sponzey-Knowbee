import { describe, expect, it } from "vitest"
import { buildCanonicalCancellationDescriptor } from "../packages/core/src/runs/canonical-finalization-lifecycle.ts"
import { parseRequestContinuationDecision } from "../packages/core/src/runs/entry-comparison.ts"

describe("Task 102 active-goal relation and terminal admission", () => {
  it("represents merge, separate-run, and selected-run cancellation as explicit decisions", () => {
    expect(
      parseRequestContinuationDecision('{"decision":"same_run","request_group_id":"group:active"}'),
    ).toMatchObject({ decision: "same_run", request_group_id: "group:active" })
    expect(parseRequestContinuationDecision('{"decision":"new_run"}')).toMatchObject({
      decision: "new_run",
    })
    expect(
      parseRequestContinuationDecision('{"decision":"cancel_target","run_id":"run:active"}'),
    ).toMatchObject({ decision: "cancel_target", run_id: "run:active" })
  })

  it("rejects an unknown goal-relation decision instead of implicitly reusing active work", () => {
    expect(parseRequestContinuationDecision('{"decision":"continue_somehow"}')).toBeNull()
  })

  it("admits user cancellation only for the exact root-run token", () => {
    expect(
      buildCanonicalCancellationDescriptor({
        runId: "run:active",
        cancellationKind: "user_requested",
        cancellationTokenId: "root-run:run:active",
        signalAborted: true,
      }),
    ).toMatchObject({ ok: true, descriptor: { event: "USER_CANCELLED" } })
    expect(
      buildCanonicalCancellationDescriptor({
        runId: "run:active",
        cancellationKind: "user_requested",
        cancellationTokenId: "root-run:run:other",
        signalAborted: true,
      }),
    ).toEqual({ ok: false, reasonCode: "canonical_cancellation_scope_mismatch" })
  })
})
