import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  type WebLiveEvidenceRejectionCode,
  produceWebLiveAcceptanceEvidence,
} from "../packages/core/src/release/web-live-acceptance-evidence.ts"
import type {
  WebRetrievalLiveAcceptanceReceipt,
  WebRetrievalLiveDiagnosisReceipt,
  WebRetrievalLiveSmokeResult,
  WebRetrievalLiveSmokeSummary,
  WebRetrievalLiveSmokeTrace,
  WebRetrievalLiveSourceEvidenceReceipt,
  WebRetrievalLiveTargetBindingReceipt,
} from "../packages/core/src/runs/web-retrieval-smoke.ts"

const NOW = Date.parse("2026-07-17T04:00:00.000Z")
const SOURCE_TIME = "2026-07-17T03:59:00.000Z"
const TARGET_FINGERPRINT = `sha256:${"a".repeat(64)}` as const
const CONTEXT_FINGERPRINT = `sha256:${"b".repeat(64)}` as const
const EVIDENCE_REF = `tool-result:web:${"c".repeat(64)}`

function diagnosis(
  overrides: Partial<WebRetrievalLiveDiagnosisReceipt> = {},
): WebRetrievalLiveDiagnosisReceipt {
  return {
    diagnosedBy: "llm",
    status: "complete",
    contextFingerprint: CONTEXT_FINGERPRINT,
    criterionKeys: ["existence", "accuracy", "freshness", "target_match"],
    conditionCount: 1,
    evidenceRefs: [EVIDENCE_REF],
    ...overrides,
  }
}

function sourceEvidence(
  overrides: Partial<WebRetrievalLiveSourceEvidenceReceipt> = {},
): WebRetrievalLiveSourceEvidenceReceipt {
  return {
    evidenceRef: EVIDENCE_REF,
    sourceDomain: "quote.example",
    sourceTimestamp: SOURCE_TIME,
    fetchedAt: "2026-07-17T03:59:05.000Z",
    ...overrides,
  }
}

function targetBinding(
  overrides: Partial<WebRetrievalLiveTargetBindingReceipt> = {},
): WebRetrievalLiveTargetBindingReceipt {
  return {
    status: "verified",
    requestedTargetFingerprint: TARGET_FINGERPRINT,
    evidenceTargetFingerprint: TARGET_FINGERPRINT,
    ...overrides,
  }
}

function liveAcceptance(
  overrides: Partial<WebRetrievalLiveAcceptanceReceipt> = {},
): WebRetrievalLiveAcceptanceReceipt {
  return {
    auditEventId: "audit:web:153",
    redactionStatus: "verified",
    targetBinding: targetBinding(),
    sourceEvidence: [sourceEvidence()],
    ...overrides,
  }
}

function trace(overrides: Partial<WebRetrievalLiveSmokeTrace> = {}): WebRetrievalLiveSmokeTrace {
  return {
    attemptedMethods: ["fast_text_search", "direct_fetch"],
    sourceDomains: ["quote.example"],
    answerProduced: true,
    resultDiagnosis: diagnosis(),
    liveAcceptance: liveAcceptance(),
    finalText: "private answer",
    ...overrides,
  }
}

function result(overrides: Partial<WebRetrievalLiveSmokeResult> = {}): WebRetrievalLiveSmokeResult {
  return {
    scenario: {
      id: "sk-hynix-current-price",
      title: "SK hynix current price",
      request: "private request",
      target: { kind: "equity", canonicalName: "SK hynix", symbols: ["000660"] },
      freshnessPolicy: "latest_approximate",
      minimumMethods: ["fast_text_search", "direct_fetch"],
      completionConditions: ["current value and basis time verified"],
    },
    status: "passed",
    failures: [],
    trace: trace(),
    startedAt: "2026-07-17T03:58:00.000Z",
    finishedAt: "2026-07-17T04:00:00.000Z",
    ...overrides,
  }
}

function run(results = [result()]): WebRetrievalLiveSmokeSummary {
  return {
    kind: "web_retrieval.live_smoke",
    mode: "live-run",
    smokeId: "web-smoke:task153",
    policyVersion: "web-evidence-llm-diagnosis-v2",
    startedAt: "2026-07-17T03:58:00.000Z",
    finishedAt: "2026-07-17T04:00:00.000Z",
    status: "passed",
    counts: { total: results.length, passed: results.length, failed: 0, skipped: 0 },
    results,
  }
}

function produce(summary = run()) {
  return produceWebLiveAcceptanceEvidence({
    run: summary,
    now: NOW,
    maxSourceAgeMs: 5 * 60 * 1_000,
  })
}

function rejected(reasonCode: WebLiveEvidenceRejectionCode, summary: WebRetrievalLiveSmokeSummary) {
  expect(produce(summary)).toEqual({
    accepted: [],
    rejected: [{ scenarioId: "sk-hynix-current-price", reasonCode }],
  })
}

describe("Task 153 Web live evidence producer", () => {
  it("produces only bounded evidence from a verified live current-fact receipt", () => {
    expect(produce()).toEqual({
      accepted: [
        {
          evidenceRef: "web-smoke:web-smoke:task153:sk-hynix-current-price",
          capability: "web",
          scenarioId: "sk-hynix-current-price",
          terminalStatus: "passed",
          auditEventId: "audit:web:153",
          executedAt: NOW,
          redactionStatus: "verified",
        },
      ],
      rejected: [],
    })
    expect(JSON.stringify(produce())).not.toMatch(/private|000660|quote\.example|currentPrice/u)
  })

  it("rejects fixture or dry-run summaries", () => {
    rejected("web_smoke_not_live", { ...run(), mode: "dry-run" })
  })

  it("rejects a failed run before individual transport success", () => {
    rejected("web_smoke_run_not_passed", { ...run(), status: "failed" })
  })

  it("rejects duplicate scenarios", () => {
    const first = result()
    const production = produce(run([first, result()]))
    expect(production.accepted).toHaveLength(0)
    expect(production.rejected).toContainEqual({
      scenarioId: first.scenario.id,
      reasonCode: "web_smoke_scenario_duplicate",
    })
  })

  it("emits one capability evidence only after every unique scenario passes", () => {
    const first = result()
    const second = result({
      scenario: { ...first.scenario, id: "current-weather" },
    })

    expect(produce(run([first, second]))).toEqual({
      accepted: [
        {
          evidenceRef: "web-smoke:web-smoke:task153:sk-hynix-current-price",
          capability: "web",
          scenarioId: "sk-hynix-current-price",
          terminalStatus: "passed",
          auditEventId: "audit:web:153",
          executedAt: NOW,
          redactionStatus: "verified",
        },
      ],
      rejected: [],
    })
  })

  it.each([
    ["web_smoke_result_not_passed", { status: "failed" }],
    ["web_smoke_answer_missing", { trace: trace({ answerProduced: false }) }],
    ["web_smoke_llm_diagnosis_missing", { trace: trace({ resultDiagnosis: null }) }],
    [
      "web_smoke_llm_diagnosis_invalid",
      { trace: trace({ resultDiagnosis: diagnosis({ diagnosedBy: "fixture" }) }) },
    ],
    [
      "web_smoke_llm_diagnosis_invalid",
      { trace: trace({ resultDiagnosis: diagnosis({ criterionKeys: ["existence"] }) }) },
    ],
    [
      "web_smoke_source_provenance_missing",
      { trace: trace({ liveAcceptance: liveAcceptance({ sourceEvidence: [] }) }) },
    ],
    [
      "web_smoke_source_timestamp_invalid",
      {
        trace: trace({
          liveAcceptance: liveAcceptance({
            sourceEvidence: [sourceEvidence({ sourceTimestamp: "unknown" })],
          }),
        }),
      },
    ],
    [
      "web_smoke_source_stale",
      {
        trace: trace({
          liveAcceptance: liveAcceptance({
            sourceEvidence: [sourceEvidence({ sourceTimestamp: "2026-07-16T03:00:00.000Z" })],
          }),
        }),
      },
    ],
    [
      "web_smoke_target_binding_invalid",
      {
        trace: trace({
          liveAcceptance: liveAcceptance({
            targetBinding: targetBinding({
              evidenceTargetFingerprint: `sha256:${"d".repeat(64)}`,
            }),
          }),
        }),
      },
    ],
    [
      "web_smoke_audit_missing",
      { trace: trace({ liveAcceptance: liveAcceptance({ auditEventId: "" }) }) },
    ],
    [
      "web_smoke_unredacted",
      { trace: trace({ liveAcceptance: liveAcceptance({ redactionStatus: "unverified" }) }) },
    ],
  ] as const)("rejects %s", (reasonCode, overrides) => {
    rejected(reasonCode, run([result(overrides as Partial<WebRetrievalLiveSmokeResult>)]))
  })

  it("has no provider, persistence, filesystem, network, or environment access", () => {
    const source = readFileSync("packages/core/src/release/web-live-acceptance-evidence.ts", "utf8")
    expect(source).not.toMatch(
      /process\.env|node:fs|db\/|from\s+["'][^"']*providers?|fetch\(|tools\/builtin/u,
    )
  })
})
