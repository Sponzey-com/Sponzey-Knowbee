import { describe, expect, it } from "vitest"
import {
  type LiveAcceptanceEvidence,
  admitLiveAcceptance,
} from "../packages/core/src/release/live-acceptance-admission.ts"

const NOW = Date.parse("2026-07-17T04:00:00.000Z")

function evidence(
  capability: LiveAcceptanceEvidence["capability"],
  overrides: Partial<LiveAcceptanceEvidence> = {},
): LiveAcceptanceEvidence {
  return {
    evidenceRef: `audit:${capability}:151`,
    capability,
    scenarioId: `${capability}.basic_query`,
    terminalStatus: "passed",
    auditEventId: `finalization-${capability}-151`,
    executedAt: NOW - 1_000,
    redactionStatus: "verified",
    ...overrides,
  }
}

describe("Task 151 live acceptance admission", () => {
  it("admits a public release only when every required capability has current verified evidence", () => {
    expect(
      admitLiveAcceptance({
        audience: "public",
        requiredCapabilities: ["webui", "telegram", "slack"],
        evidence: [evidence("webui"), evidence("telegram"), evidence("slack")],
        now: NOW,
        maxAgeMs: 60_000,
      }),
    ).toEqual({
      status: "admitted",
      reasonCodes: [],
      acceptedEvidenceRefs: ["audit:webui:151", "audit:telegram:151", "audit:slack:151"],
    })
  })

  it.each([
    [[], "live_evidence_missing"],
    [[evidence("telegram", { terminalStatus: "failed" })], "live_evidence_not_passed"],
    [[evidence("telegram", { executedAt: NOW - 60_001 })], "live_evidence_stale"],
    [[evidence("telegram", { redactionStatus: "unverified" })], "live_evidence_unredacted"],
    [[evidence("telegram", { auditEventId: "" })], "live_evidence_audit_missing"],
  ])("blocks public release for invalid evidence", (items, reasonCode) => {
    expect(
      admitLiveAcceptance({
        audience: "public",
        requiredCapabilities: ["telegram"],
        evidence: items,
        now: NOW,
        maxAgeMs: 60_000,
      }),
    ).toMatchObject({ status: "blocked", reasonCodes: [reasonCode] })
  })

  it("reports missing internal evidence as warning without claiming admission", () => {
    expect(
      admitLiveAcceptance({
        audience: "internal",
        requiredCapabilities: ["slack"],
        evidence: [],
        now: NOW,
        maxAgeMs: 60_000,
      }),
    ).toMatchObject({ status: "warning", reasonCodes: ["live_evidence_missing"] })
  })

  it("rejects unsafe raw fields instead of redacting after admission", () => {
    const unsafe = { ...evidence("slack"), rawResponse: "secret" } as LiveAcceptanceEvidence
    expect(
      admitLiveAcceptance({
        audience: "public",
        requiredCapabilities: ["slack"],
        evidence: [unsafe],
        now: NOW,
        maxAgeMs: 60_000,
      }),
    ).toMatchObject({ status: "blocked", reasonCodes: ["live_evidence_unsafe_shape"] })
  })
})
