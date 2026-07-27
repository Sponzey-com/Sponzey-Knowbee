import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  type LiveAcceptanceBundle,
  type LiveAcceptanceBundlePayload,
  buildLiveAcceptanceBundleChecksum,
  parseLiveAcceptanceBundle,
} from "../packages/core/src/release/live-acceptance-bundle.ts"

const NOW = Date.parse("2026-07-17T07:00:00.000Z")
const candidate = { appVersion: "1.2.3", gitTag: "v1.2.3", gitCommit: "abc1234" }
const signature = {
  algorithm: "ed25519" as const,
  keyId: `sha256:${"1".repeat(64)}`,
  valueBase64: `${"A".repeat(86)}==`,
}

function payload(): LiveAcceptanceBundlePayload {
  return {
    kind: "knowbee.release.live_acceptance_bundle",
    schemaVersion: 2,
    candidate,
    approval: {
      decision: "approved",
      authorizationStatus: "active",
      authorizationId: "authorization:live:156",
      auditEventId: "audit:live:156",
      principalType: "authenticated_user",
      principalId: "operator:156",
      authenticationId: "authentication:156",
      roles: ["release_administrator"],
      approvedAt: NOW - 1_000,
      expiresAt: NOW + 60_000,
      redactionStatus: "verified",
    },
    evidence: ["webui", "telegram", "slack", "web", "skill", "mcp", "yeonjang"].map(
      (capability, index) => ({
        evidenceRef: `live:${capability}:156`,
        capability: capability as LiveAcceptanceBundlePayload["evidence"][number]["capability"],
        scenarioId: `${capability}-live`,
        terminalStatus: "passed",
        auditEventId: `audit:${capability}:156`,
        executedAt: NOW - index,
        redactionStatus: "verified",
      }),
    ),
  }
}

function bundle(value = payload()): LiveAcceptanceBundle {
  return { ...value, payloadSha256: buildLiveAcceptanceBundleChecksum(value), signature }
}

const verifySignature = () => true

describe("Task 156 live acceptance bundle", () => {
  it("verifies an exact candidate-bound approved bounded bundle", () => {
    const result = parseLiveAcceptanceBundle({
      value: bundle(),
      expectedCandidate: candidate,
      now: NOW,
      verifySignature,
    })
    expect(result).toMatchObject({ status: "verified" })
    if (result.status !== "verified") throw new Error(result.reasonCode)
    expect(result.bundle.evidence).toHaveLength(7)
    expect(JSON.stringify(result.bundle)).not.toMatch(
      /request|finalText|resultDiagnosis|credential/u,
    )
  })

  it.each([
    ["live_acceptance_bundle_shape_invalid", { extra: "unsafe" }],
    ["live_acceptance_bundle_schema_invalid", { schemaVersion: 1 }],
    [
      "live_acceptance_bundle_candidate_mismatch",
      { candidate: { ...candidate, gitCommit: "other" } },
    ],
    [
      "live_acceptance_bundle_not_approved",
      { approval: { ...payload().approval, decision: "denied" } },
    ],
    [
      "live_acceptance_bundle_approval_invalid",
      { approval: { ...payload().approval, authorizationId: "" } },
    ],
    ["live_acceptance_bundle_expired", { approval: { ...payload().approval, expiresAt: NOW } }],
    [
      "live_acceptance_bundle_evidence_invalid",
      { evidence: [{ ...payload().evidence[0], raw: "private" }] },
    ],
    [
      "live_acceptance_bundle_capability_duplicate",
      { evidence: [payload().evidence[0], payload().evidence[0]] },
    ],
  ] as const)("rejects %s", (reasonCode, overrides) => {
    const changed = { ...payload(), ...overrides } as unknown as LiveAcceptanceBundlePayload
    expect(
      parseLiveAcceptanceBundle({
        value: bundle(changed),
        expectedCandidate: candidate,
        now: NOW,
        verifySignature,
      }),
    ).toEqual({
      status: "rejected",
      reasonCode,
    })
  })

  it("rejects checksum changes before accepting evidence", () => {
    expect(
      parseLiveAcceptanceBundle({
        value: { ...bundle(), payloadSha256: `sha256:${"0".repeat(64)}` },
        expectedCandidate: candidate,
        now: NOW,
        verifySignature,
      }),
    ).toEqual({ status: "rejected", reasonCode: "live_acceptance_bundle_checksum_mismatch" })
  })

  it("has no filesystem, DB, provider, network, or environment access", () => {
    const source = readFileSync("packages/core/src/release/live-acceptance-bundle.ts", "utf8")
    expect(source).not.toMatch(/node:fs|process\.env|db\/|provider|fetch\(/u)
  })
})
