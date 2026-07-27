import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  type YeonjangLiveEvidenceRejectionCode,
  produceYeonjangLiveAcceptanceEvidence,
} from "../packages/core/src/release/yeonjang-live-acceptance-evidence.ts"
import {
  type YeonjangLiveCommandReceipt,
  type YeonjangLiveInstanceReceipt,
  type YeonjangLiveObservedResultReceipt,
  type YeonjangLiveResultDiagnosisReceipt,
  type YeonjangLiveSmokeResult,
  type YeonjangLiveSmokeSummary,
  type YeonjangLiveSmokeTrace,
  transitionYeonjangLiveSmokeState,
} from "../packages/core/src/runs/yeonjang-live-smoke.ts"

const NOW = Date.parse("2026-07-17T06:00:00.000Z")
const EVIDENCE_REF = `tool-result:yeonjang:${"b".repeat(64)}`

function instance(
  overrides: Partial<YeonjangLiveInstanceReceipt> = {},
): YeonjangLiveInstanceReceipt {
  return {
    instanceId: "instance:office-mac",
    publicName: "Office Mac",
    sessionId: "session:office-mac:1",
    status: "connected",
    observedAt: NOW - 1_000,
    duplicateActiveIdentityCount: 0,
    trustState: "trusted",
    runnableTarget: true,
    ...overrides,
  }
}

function command(overrides: Partial<YeonjangLiveCommandReceipt> = {}): YeonjangLiveCommandReceipt {
  return {
    runId: "yeonjang-run:155",
    requestGroupId: "yeonjang-run:155",
    commandId: "command:155",
    instanceId: "instance:office-mac",
    sessionId: "session:office-mac:1",
    method: "system.info",
    readOnly: true,
    deliveryStatus: "acked",
    ...overrides,
  }
}

function observed(
  overrides: Partial<YeonjangLiveObservedResultReceipt> = {},
): YeonjangLiveObservedResultReceipt {
  return {
    runId: "yeonjang-run:155",
    commandId: "command:155",
    instanceId: "instance:office-mac",
    sessionId: "session:office-mac:1",
    status: "observed",
    evidenceRef: EVIDENCE_REF,
    ...overrides,
  }
}

function diagnosis(
  overrides: Partial<YeonjangLiveResultDiagnosisReceipt> = {},
): YeonjangLiveResultDiagnosisReceipt {
  return {
    diagnosedBy: "llm",
    status: "complete",
    contextFingerprint: `sha256:${"a".repeat(64)}`,
    criterionKeys: ["existence", "accuracy", "target_match", "constraint_compliance"],
    evidenceRefs: [EVIDENCE_REF],
    ...overrides,
  }
}

function trace(overrides: Partial<YeonjangLiveSmokeTrace> = {}): YeonjangLiveSmokeTrace {
  return {
    requestGroupId: "yeonjang-run:155",
    instance: instance(),
    command: command(),
    observedResult: observed(),
    resultDiagnosis: diagnosis(),
    auditEventId: "audit:yeonjang:155",
    redactionStatus: "verified",
    ...overrides,
  }
}

function result(overrides: Partial<YeonjangLiveSmokeResult> = {}): YeonjangLiveSmokeResult {
  return {
    scenario: {
      id: "office-mac-status",
      expectedInstanceId: "instance:office-mac",
      expectedSessionId: "session:office-mac:1",
      expectedMethod: "system.info",
      readOnly: true,
    },
    state: "verified",
    status: "passed",
    trace: trace(),
    startedAt: NOW - 2_000,
    finishedAt: NOW,
    ...overrides,
  }
}

function run(results = [result()]): YeonjangLiveSmokeSummary {
  return {
    kind: "yeonjang.live_smoke",
    mode: "live-run",
    runId: "yeonjang-run:155",
    status: "passed",
    startedAt: NOW - 3_000,
    finishedAt: NOW,
    results,
  }
}

function rejected(reasonCode: YeonjangLiveEvidenceRejectionCode, value: YeonjangLiveSmokeSummary) {
  expect(
    produceYeonjangLiveAcceptanceEvidence({ run: value, now: NOW, maxSessionAgeMs: 5_000 }),
  ).toEqual({ accepted: [], rejected: [{ scenarioId: "office-mac-status", reasonCode }] })
}

describe("Task 155 Yeonjang live evidence", () => {
  it("requires observation between ACK and verification", () => {
    expect(transitionYeonjangLiveSmokeState("prepared", "DISPATCH")).toEqual({
      ok: true,
      state: "dispatched",
    })
    expect(transitionYeonjangLiveSmokeState("dispatched", "ACK")).toEqual({
      ok: true,
      state: "acknowledged",
    })
    expect(transitionYeonjangLiveSmokeState("acknowledged", "VERIFY")).toEqual({
      ok: false,
      state: "acknowledged",
      reasonCode: "yeonjang_smoke_transition_invalid",
    })
    expect(transitionYeonjangLiveSmokeState("acknowledged", "OBSERVE")).toEqual({
      ok: true,
      state: "observed",
    })
  })

  it("produces bounded evidence only after exact observed verification", () => {
    expect(
      produceYeonjangLiveAcceptanceEvidence({ run: run(), now: NOW, maxSessionAgeMs: 5_000 }),
    ).toEqual({
      accepted: [
        {
          evidenceRef: "yeonjang-smoke:yeonjang-run:155:office-mac-status",
          capability: "yeonjang",
          scenarioId: "office-mac-status",
          terminalStatus: "passed",
          auditEventId: "audit:yeonjang:155",
          executedAt: NOW,
          redactionStatus: "verified",
        },
      ],
      rejected: [],
    })
  })

  it.each([
    ["yeonjang_smoke_not_live", { mode: "dry-run" }],
    ["yeonjang_smoke_run_not_passed", { status: "failed" }],
  ] as const)("rejects %s at run level", (reasonCode, overrides) => {
    rejected(reasonCode, { ...run(), ...overrides })
  })

  it.each([
    ["yeonjang_smoke_result_not_verified", { state: "acknowledged" }],
    ["yeonjang_smoke_trace_missing", { trace: null }],
    [
      "yeonjang_smoke_instance_duplicate",
      { trace: trace({ instance: instance({ duplicateActiveIdentityCount: 1 }) }) },
    ],
    [
      "yeonjang_smoke_instance_not_connected",
      { trace: trace({ instance: instance({ status: "disconnected" }) }) },
    ],
    [
      "yeonjang_smoke_instance_untrusted",
      { trace: trace({ instance: instance({ trustState: "pending" }) }) },
    ],
    [
      "yeonjang_smoke_instance_not_runnable",
      { trace: trace({ instance: instance({ runnableTarget: false }) }) },
    ],
    [
      "yeonjang_smoke_session_stale",
      { trace: trace({ instance: instance({ observedAt: NOW - 10_000 }) }) },
    ],
    [
      "yeonjang_smoke_target_mismatch",
      { trace: trace({ instance: instance({ instanceId: "instance:other" }) }) },
    ],
    ["yeonjang_smoke_run_correlation_invalid", { trace: trace({ requestGroupId: "other-run" }) }],
    ["yeonjang_smoke_command_missing", { trace: trace({ command: null }) }],
    [
      "yeonjang_smoke_command_mismatch",
      { trace: trace({ command: command({ instanceId: "instance:other" }) }) },
    ],
    [
      "yeonjang_smoke_command_not_acked",
      { trace: trace({ command: command({ deliveryStatus: "failed" }) }) },
    ],
    ["yeonjang_smoke_observed_result_missing", { trace: trace({ observedResult: null }) }],
    [
      "yeonjang_smoke_observed_result_mismatch",
      { trace: trace({ observedResult: observed({ commandId: "command:other" }) }) },
    ],
    ["yeonjang_smoke_llm_diagnosis_missing", { trace: trace({ resultDiagnosis: null }) }],
    [
      "yeonjang_smoke_llm_diagnosis_invalid",
      { trace: trace({ resultDiagnosis: diagnosis({ status: "followup" }) }) },
    ],
    [
      "yeonjang_smoke_evidence_binding_invalid",
      { trace: trace({ resultDiagnosis: diagnosis({ evidenceRefs: ["foreign"] }) }) },
    ],
    ["yeonjang_smoke_audit_missing", { trace: trace({ auditEventId: "" }) }],
    ["yeonjang_smoke_unredacted", { trace: trace({ redactionStatus: "unverified" }) }],
  ] as const)("rejects %s", (reasonCode, overrides) => {
    rejected(reasonCode, run([result(overrides as Partial<YeonjangLiveSmokeResult>)]))
  })

  it("rejects a local status alias as remote live evidence", () => {
    const valid = run()
    const first = valid.results[0]
    if (!first) throw new Error("expected one Yeonjang smoke fixture")
    const invalid = {
      ...valid,
      results: [
        {
          ...first,
          scenario: {
            ...first.scenario,
            expectedMethod: "yeonjang_status" as "system.info",
          },
        },
      ],
    }
    rejected("yeonjang_smoke_read_only_method_required", invalid)
  })

  it("rejects duplicate scenarios", () => {
    expect(
      produceYeonjangLiveAcceptanceEvidence({
        run: run([result(), result()]),
        now: NOW,
        maxSessionAgeMs: 5_000,
      }).rejected,
    ).toContainEqual({
      scenarioId: "office-mac-status",
      reasonCode: "yeonjang_smoke_scenario_duplicate",
    })
  })

  it("has no MQTT, registry, provider, filesystem, network, or environment access", () => {
    const source = readFileSync(
      "packages/core/src/release/yeonjang-live-acceptance-evidence.ts",
      "utf8",
    )
    expect(source).not.toMatch(/process\.env|node:fs|db\/|mqtt|registry|provider|fetch\(/u)
  })
})
