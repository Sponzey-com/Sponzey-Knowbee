import { describe, expect, it } from "vitest"
import {
  type LiveAcceptanceEvidence,
  admitLiveAcceptance,
} from "../packages/core/src/release/live-acceptance-admission.ts"
import {
  type LiveAcceptanceBundleApproval,
  type LiveAcceptanceBundleCandidate,
  type LiveAcceptanceBundlePayload,
  validateLiveAcceptanceBundlePayload,
} from "../packages/core/src/release/live-acceptance-bundle.ts"
import { createLiveAcceptanceSigningRequest } from "../packages/core/src/release/live-acceptance-signing-exchange.ts"
import { produceVerifiedYeonjangAcceptanceEvidence } from "../packages/core/src/release/yeonjang-verified-acceptance-evidence.ts"
import { buildYeonjangEvidenceEnvelope } from "../packages/core/src/yeonjang/evidence.ts"

const NOW = Date.parse("2026-07-22T03:00:00.000Z")
const KEY_ID = `sha256:${"1".repeat(64)}` as const

const candidate: LiveAcceptanceBundleCandidate = Object.freeze({
  appVersion: "1.2.3",
  gitTag: "v1.2.3",
  gitCommit: "abc123",
})

const approval: LiveAcceptanceBundleApproval = Object.freeze({
  decision: "approved",
  authorizationStatus: "active",
  authorizationId: "authorization:180",
  auditEventId: "audit:approval:180",
  principalType: "authenticated_user",
  principalId: "operator:180",
  authenticationId: "authentication:180",
  roles: Object.freeze(["release_administrator"]),
  approvedAt: NOW - 1_000,
  expiresAt: NOW + 60_000,
  redactionStatus: "verified",
})

function verifiedEvidence(): LiveAcceptanceEvidence {
  const produced = produceVerifiedYeonjangAcceptanceEvidence([
    {
      auditEventId: "audit:yeonjang:180",
      evidence: buildYeonjangEvidenceEnvelope({
        targetRef:
          "yeonjang:office-mac:browser:https://example.test/admin?token=private:pid=4401:window-private:tab-private",
        toolName: "yeonjang_browser_focus",
        methodIds: ["browser.focus"],
        group: "browser",
        riskLevel: "moderate",
        requiresApproval: true,
        collectedAt: NOW - 500,
        summary:
          "raw focused title Private Admin Console raw focused URL https://example.test/admin?token=private operationId=operation:180 receipt payload structured diagnosis payload",
        postCheck: {
          kind: "verified",
          verified: true,
          reason: "focused_target_matched",
        },
      }),
    },
  ])
  const evidence = produced.accepted[0]
  if (!evidence) throw new Error("verified evidence fixture missing")
  return evidence
}

function payload(evidence: LiveAcceptanceEvidence[]): LiveAcceptanceBundlePayload {
  return {
    kind: "knowbee.release.live_acceptance_bundle",
    schemaVersion: 2,
    candidate,
    approval,
    evidence,
  }
}

describe("Task 180 Yeonjang verified acceptance bundle boundary", () => {
  it("admits verified Yeonjang evidence into signing requests without raw focus internals", () => {
    const value = payload([verifiedEvidence()])

    expect(validateLiveAcceptanceBundlePayload({ value, expectedCandidate: candidate, now: NOW }))
      .toMatchObject({ status: "verified" })

    const request = createLiveAcceptanceSigningRequest({
      value,
      expectedCandidate: candidate,
      requestedKeyId: KEY_ID,
      now: NOW,
    })

    expect(request.status).toBe("created")
    if (request.status !== "created") throw new Error("signing request was not created")
    const serialized = JSON.stringify(request.request)
    expect(serialized).toContain("yeonjang-verified:")
    expect(serialized).not.toMatch(
      /Private Admin Console|token=private|pid=4401|window-private|tab-private|operationId|receipt payload|structured diagnosis payload|targetRef|postCheck/u,
    )
  })

  it("rejects duplicate, unsafe, and unredacted verified Yeonjang bundle evidence", () => {
    const evidence = verifiedEvidence()

    expect(
      validateLiveAcceptanceBundlePayload({
        value: payload([evidence, { ...evidence, evidenceRef: "yeonjang-verified:other" }]),
        expectedCandidate: candidate,
        now: NOW,
      }),
    ).toMatchObject({
      status: "rejected",
      reasonCode: "live_acceptance_bundle_capability_duplicate",
    })

    expect(
      validateLiveAcceptanceBundlePayload({
        value: payload([{ ...evidence, rawTargetRef: "secret" } as LiveAcceptanceEvidence]),
        expectedCandidate: candidate,
        now: NOW,
      }),
    ).toMatchObject({
      status: "rejected",
      reasonCode: "live_acceptance_bundle_evidence_invalid",
    })

    expect(
      validateLiveAcceptanceBundlePayload({
        value: payload([{ ...evidence, redactionStatus: "unverified" }]),
        expectedCandidate: candidate,
        now: NOW,
      }),
    ).toMatchObject({
      status: "rejected",
      reasonCode: "live_acceptance_bundle_evidence_invalid",
    })
  })

  it("blocks stale verified Yeonjang evidence at live acceptance admission", () => {
    expect(
      admitLiveAcceptance({
        audience: "public",
        requiredCapabilities: ["yeonjang"],
        evidence: [{ ...verifiedEvidence(), executedAt: NOW - 60_001 }],
        now: NOW,
        maxAgeMs: 60_000,
      }),
    ).toMatchObject({
      status: "blocked",
      reasonCodes: ["live_evidence_stale"],
      acceptedEvidenceRefs: [],
    })
  })
})
