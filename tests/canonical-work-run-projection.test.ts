import { describe, expect, it } from "vitest"
import { projectCanonicalWorkStateToRunStatus } from "../packages/core/src/runs/canonical-work-run-projection.ts"

describe("canonical work to legacy run projection", () => {
  it("projects active canonical states without reverse inference", () => {
    expect(projectCanonicalWorkStateToRunStatus({ state: "REQUEST_RECEIVED" })).toEqual({
      ok: true,
      projection: { canonicalState: "REQUEST_RECEIVED", runStatus: "queued", lossy: true },
    })
    expect(projectCanonicalWorkStateToRunStatus({ state: "RESULT_REVIEW" })).toEqual({
      ok: true,
      projection: { canonicalState: "RESULT_REVIEW", runStatus: "running", lossy: true },
    })
  })

  it("requires the explicit waiting kind for user input states", () => {
    expect(projectCanonicalWorkStateToRunStatus({ state: "USER_INPUT_REQUIRED" })).toEqual({
      ok: false,
      canonicalState: "USER_INPUT_REQUIRED",
      reasonCode: "waiting_kind_required",
    })
    expect(projectCanonicalWorkStateToRunStatus({
      state: "USER_INPUT_REQUIRED",
      waitingKind: "approval",
    })).toMatchObject({ ok: true, projection: { runStatus: "awaiting_approval" } })
    expect(projectCanonicalWorkStateToRunStatus({
      state: "USER_INPUT_REQUIRED",
      waitingKind: "user_input",
    })).toMatchObject({ ok: true, projection: { runStatus: "awaiting_user" } })
  })

  it("requires an explicit final outcome before projecting USER_REPORT", () => {
    expect(projectCanonicalWorkStateToRunStatus({ state: "USER_REPORT" })).toEqual({
      ok: false,
      canonicalState: "USER_REPORT",
      reasonCode: "final_report_outcome_required",
    })
    expect(projectCanonicalWorkStateToRunStatus({
      state: "USER_REPORT",
      finalOutcome: "succeeded",
    })).toMatchObject({ ok: true, projection: { runStatus: "completed" } })
    expect(projectCanonicalWorkStateToRunStatus({
      state: "USER_REPORT",
      finalOutcome: "exhausted",
    })).toMatchObject({ ok: true, projection: { runStatus: "failed" } })
    expect(projectCanonicalWorkStateToRunStatus({
      state: "USER_REPORT",
      finalOutcome: "cancelled",
    })).toMatchObject({ ok: true, projection: { runStatus: "cancelled" } })
  })
})
