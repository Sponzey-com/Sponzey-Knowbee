import { describe, expect, it } from "vitest"

import {
  type InstallerTransactionEvent,
  type InstallerTransactionState,
  parseInstallerTransactionSnapshot,
  recoverInstallerTransaction,
  reduceInstallerTransaction,
  startInstallerTransaction,
} from "../packages/core/src/release/installer-transaction.js"

const identity = {
  operationId: "install:9.8.7:device-a",
  idempotencyKey: "installer:device-a:9.8.7",
  targetFingerprint: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  desiredVersion: "9.8.7",
}

function apply(
  state: InstallerTransactionState,
  type: InstallerTransactionEvent["type"],
  values: Record<string, unknown> = {},
) {
  return reduceInstallerTransaction(state, {
    type,
    eventId: `event:${state.revision + 1}:${type}`,
    operationId: state.operationId,
    targetFingerprint: state.targetFingerprint,
    expectedRevision: state.revision,
    ...values,
  } as InstallerTransactionEvent)
}

function expectApplied(
  result: ReturnType<typeof reduceInstallerTransaction>,
): InstallerTransactionState {
  expect(result.status).toBe("applied")
  if (result.status !== "applied") throw new Error("transition was not applied")
  return result.state
}

function activatedState(): InstallerTransactionState {
  let state = startInstallerTransaction(identity)
  state = expectApplied(apply(state, "preflight_passed", { receiptRef: "receipt:preflight" }))
  state = expectApplied(apply(state, "bundle_downloaded", { receiptRef: "receipt:download" }))
  state = expectApplied(apply(state, "bundle_verified", { receiptRef: "receipt:verify" }))
  state = expectApplied(apply(state, "stage_prepared", { receiptRef: "receipt:stage" }))
  return expectApplied(
    apply(state, "activation_completed", {
      receiptRef: "receipt:activate",
      previousReleaseId: "release:9.8.6",
    }),
  )
}

describe("task008 installer transaction", () => {
  it("owns the complete successful install lifecycle with monotonic revision", () => {
    let state = startInstallerTransaction(identity)
    const steps: readonly [InstallerTransactionEvent["type"], Record<string, unknown>][] = [
      ["preflight_passed", { receiptRef: "receipt:preflight" }],
      ["bundle_downloaded", { receiptRef: "receipt:download" }],
      ["bundle_verified", { receiptRef: "receipt:verify" }],
      ["stage_prepared", { receiptRef: "receipt:stage" }],
      ["activation_completed", { receiptRef: "receipt:activate", previousReleaseId: null }],
      ["service_registered", { receiptRef: "receipt:service" }],
      ["health_verified", { receiptRef: "receipt:health" }],
      ["commit_completed", { receiptRef: "receipt:commit" }],
    ]
    for (const [type, values] of steps) state = expectApplied(apply(state, type, values))

    expect(state).toMatchObject({ phase: "committed", revision: 8, previousReleaseId: null })
    expect(state.appliedEventIds).toHaveLength(8)
    expect(state.evidence.map((item) => item.kind)).toEqual([
      "preflight",
      "download",
      "verification",
      "stage",
      "activation",
      "service",
      "health",
      "commit",
    ])
    expect(recoverInstallerTransaction(state)).toEqual({ action: "none", reasonCode: "terminal" })
  })

  it.each([
    ["wrong operation", { operationId: "install:other" }, "installer_event_operation_mismatch"],
    [
      "wrong target",
      { targetFingerprint: `sha256:${"b".repeat(64)}` },
      "installer_event_target_mismatch",
    ],
    ["stale revision", { expectedRevision: 99 }, "installer_event_revision_mismatch"],
  ])("rejects a $0 event", (_name, override, reasonCode) => {
    const state = startInstallerTransaction(identity)
    const event = {
      type: "preflight_passed",
      eventId: "event:preflight",
      operationId: state.operationId,
      targetFingerprint: state.targetFingerprint,
      expectedRevision: state.revision,
      receiptRef: "receipt:preflight",
      ...override,
    } as InstallerTransactionEvent
    expect(reduceInstallerTransaction(state, event)).toEqual({ status: "rejected", reasonCode })
  })

  it("rejects duplicate and invalid terminal transitions", () => {
    const initial = startInstallerTransaction(identity)
    const event = {
      type: "preflight_passed",
      eventId: "event:preflight",
      operationId: initial.operationId,
      targetFingerprint: initial.targetFingerprint,
      expectedRevision: 0,
      receiptRef: "receipt:preflight",
    } as const
    const applied = expectApplied(reduceInstallerTransaction(initial, event))
    expect(reduceInstallerTransaction(applied, { ...event, expectedRevision: 1 })).toEqual({
      status: "rejected",
      reasonCode: "installer_event_duplicate",
    })
    expect(apply(applied, "commit_completed", { receiptRef: "receipt:early-commit" })).toEqual({
      status: "rejected",
      reasonCode: "installer_transition_invalid:preflight_passed:commit_completed",
    })
  })

  it("requires rollback after activation failure and recovers durably after restart", () => {
    let state = activatedState()
    state = expectApplied(
      apply(state, "failure_recorded", {
        reasonCode: "service_registration_failed",
      }),
    )
    expect(state).toMatchObject({
      phase: "failed",
      failure: { reasonCode: "service_registration_failed", recovery: "rollback" },
    })
    const parsed = parseInstallerTransactionSnapshot(JSON.parse(JSON.stringify(state)))
    expect(parsed).toEqual({ status: "accepted", state })
    if (parsed.status !== "accepted") return
    expect(recoverInstallerTransaction(parsed.state)).toEqual({
      action: "rollback",
      previousReleaseId: "release:9.8.6",
    })

    state = expectApplied(apply(parsed.state, "rollback_started"))
    state = expectApplied(apply(state, "rollback_completed", { receiptRef: "receipt:rollback" }))
    expect(state.phase).toBe("rolled_back")
    expect(recoverInstallerTransaction(state)).toEqual({ action: "none", reasonCode: "terminal" })
  })

  it("cleans a pre-activation failure and resumes commit after durable health evidence", () => {
    const initial = startInstallerTransaction(identity)
    const failed = expectApplied(
      apply(initial, "failure_recorded", { reasonCode: "preflight_failed" }),
    )
    expect(recoverInstallerTransaction(failed)).toEqual({ action: "cleanup" })

    let healthy = activatedState()
    healthy = expectApplied(apply(healthy, "service_registered", { receiptRef: "receipt:service" }))
    healthy = expectApplied(apply(healthy, "health_verified", { receiptRef: "receipt:health" }))
    expect(recoverInstallerTransaction(healthy)).toEqual({ action: "resume_commit" })
  })

  it("commits explicit no-service and no-start policies without claiming runtime health", () => {
    let withoutService = activatedState()
    withoutService = expectApplied(
      apply(withoutService, "service_skipped", { receiptRef: "policy:no-service" }),
    )
    withoutService = expectApplied(
      apply(withoutService, "health_skipped", { receiptRef: "policy:no-service" }),
    )
    withoutService = expectApplied(
      apply(withoutService, "commit_completed", { receiptRef: "receipt:commit" }),
    )
    expect(withoutService).toMatchObject({ phase: "committed", revision: 8 })
    expect(withoutService.evidence.slice(-3).map((item) => item.kind)).toEqual([
      "service_policy",
      "health_policy",
      "commit",
    ])

    let withoutStart = activatedState()
    withoutStart = expectApplied(
      apply(withoutStart, "service_registered", { receiptRef: "receipt:registered-inactive" }),
    )
    withoutStart = expectApplied(
      apply(withoutStart, "health_skipped", { receiptRef: "policy:no-start" }),
    )
    expect(withoutStart.phase).toBe("health_skipped")
    expect(recoverInstallerTransaction(withoutStart)).toEqual({ action: "resume_commit" })
  })

  it("rejects malformed or injected durable snapshots", () => {
    const state = startInstallerTransaction(identity)
    expect(parseInstallerTransactionSnapshot({ ...state, injected: true })).toEqual({
      status: "rejected",
      reasonCode: "installer_snapshot_invalid",
    })
    expect(
      parseInstallerTransactionSnapshot({ ...state, targetFingerprint: "sha256:short" }),
    ).toEqual({ status: "rejected", reasonCode: "installer_snapshot_invalid" })
    expect(parseInstallerTransactionSnapshot({ ...state, phase: "committed" })).toEqual({
      status: "rejected",
      reasonCode: "installer_snapshot_invalid",
    })
  })
})
