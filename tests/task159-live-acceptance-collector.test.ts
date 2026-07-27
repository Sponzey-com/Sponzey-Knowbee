import { describe, expect, it } from "vitest"
import type {
  LiveAcceptanceCapability,
  LiveAcceptanceEvidence,
} from "../packages/core/src/release/live-acceptance-admission.ts"
import type {
  LiveAcceptanceBundleApproval,
  LiveAcceptanceBundleCandidate,
} from "../packages/core/src/release/live-acceptance-bundle.ts"
import {
  type LiveAcceptanceCollectionInput,
  collectLiveAcceptancePayload,
} from "../packages/core/src/release/live-acceptance-collector.ts"

const NOW = Date.parse("2026-07-17T10:00:00.000Z")
const candidate: LiveAcceptanceBundleCandidate = {
  appVersion: "1.2.3",
  gitTag: "v1.2.3",
  gitCommit: "abc1234",
}
const approval: LiveAcceptanceBundleApproval = {
  decision: "approved",
  authorizationStatus: "active",
  authorizationId: "authorization:159",
  auditEventId: "audit:159",
  principalType: "authenticated_user",
  principalId: "operator:159",
  authenticationId: "authentication:159",
  roles: ["release_administrator"],
  approvedAt: NOW - 1_000,
  expiresAt: NOW + 60_000,
  redactionStatus: "verified",
}

function evidence(capability: LiveAcceptanceCapability): LiveAcceptanceEvidence {
  return {
    evidenceRef: `live:${capability}:159`,
    capability,
    scenarioId: `${capability}-live`,
    terminalStatus: "passed",
    auditEventId: `audit:${capability}:159`,
    executedAt: NOW - 1_000,
    redactionStatus: "verified",
  }
}

function input(): LiveAcceptanceCollectionInput {
  const bound = (accepted: LiveAcceptanceEvidence[]) => ({
    candidate,
    result: { accepted, rejected: [] },
  })
  return {
    candidate,
    approval,
    channels: bound([evidence("webui"), evidence("telegram"), evidence("slack")]),
    web: bound([evidence("web")]),
    extensions: bound([evidence("skill"), evidence("mcp")]),
    yeonjang: bound([evidence("yeonjang")]),
    now: NOW,
    maxEvidenceAgeMs: 60_000,
  }
}

describe("Task 159 live acceptance collector", () => {
  it("collects exactly seven candidate-bound producer results into a signing payload", () => {
    const result = collectLiveAcceptancePayload(input())
    expect(result).toMatchObject({ status: "collected" })
    if (result.status !== "collected") throw new Error(JSON.stringify(result.blockers))
    expect(result.payload.candidate).toEqual(candidate)
    expect(result.payload.evidence.map((item) => item.capability)).toEqual([
      "webui",
      "telegram",
      "slack",
      "web",
      "skill",
      "mcp",
      "yeonjang",
    ])
    expect(JSON.stringify(result.payload)).not.toMatch(/raw|credential|resultDiagnosis|toolOutput/u)
  })

  it.each([
    [
      "live_collection_candidate_mismatch",
      (value: LiveAcceptanceCollectionInput) => ({
        ...value,
        web: { ...value.web, candidate: { ...candidate, gitCommit: "other" } },
      }),
    ],
    [
      "live_collection_producer_rejected",
      (value: LiveAcceptanceCollectionInput) => ({
        ...value,
        web: {
          ...value.web,
          result: {
            accepted: [],
            rejected: [{ scenarioId: "web-live", reasonCode: "web_smoke_not_live" }],
          },
        },
      }),
    ],
    [
      "live_evidence_missing",
      (value: LiveAcceptanceCollectionInput) => ({
        ...value,
        web: { ...value.web, result: { accepted: [], rejected: [] } },
      }),
    ],
    [
      "live_collection_capability_duplicate",
      (value: LiveAcceptanceCollectionInput) => ({
        ...value,
        web: {
          ...value.web,
          result: { accepted: [evidence("web"), evidence("web")], rejected: [] },
        },
      }),
    ],
    [
      "live_evidence_stale",
      (value: LiveAcceptanceCollectionInput) => ({
        ...value,
        web: {
          ...value.web,
          result: {
            accepted: [{ ...evidence("web"), executedAt: NOW - 60_001 }],
            rejected: [],
          },
        },
      }),
    ],
    [
      "live_evidence_unsafe_shape",
      (value: LiveAcceptanceCollectionInput) => ({
        ...value,
        web: {
          ...value.web,
          result: {
            accepted: [{ ...evidence("web"), rawResult: "unsafe" } as LiveAcceptanceEvidence],
            rejected: [],
          },
        },
      }),
    ],
    [
      "live_collection_evidence_ref_duplicate",
      (value: LiveAcceptanceCollectionInput) => ({
        ...value,
        web: {
          ...value.web,
          result: {
            accepted: [{ ...evidence("web"), evidenceRef: "live:webui:159" }],
            rejected: [],
          },
        },
      }),
    ],
  ])("blocks invalid collection with %s", (reasonCode, mutate) => {
    const result = collectLiveAcceptancePayload(mutate(input()))
    expect(result).toMatchObject({ status: "blocked" })
    if (result.status !== "blocked") throw new Error("expected blocked")
    expect(result.blockers).toEqual(
      expect.arrayContaining([expect.objectContaining({ reasonCode })]),
    )
  })

  it("preserves a safe producer reason code for operator diagnosis", () => {
    const value = input()
    const result = collectLiveAcceptancePayload({
      ...value,
      web: {
        ...value.web,
        result: {
          accepted: [],
          rejected: [{ scenarioId: "web-live", reasonCode: "credential_unavailable" }],
        },
      },
    })
    expect(result).toMatchObject({
      status: "blocked",
      blockers: expect.arrayContaining([
        {
          capability: "web",
          reasonCode: "live_collection_producer_rejected",
          sourceReasonCode: "credential_unavailable",
        },
      ]),
    })
  })
})
