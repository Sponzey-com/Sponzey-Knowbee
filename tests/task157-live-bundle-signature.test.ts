import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import {
  type LiveAcceptanceBundlePayload,
  buildLiveAcceptanceBundleChecksum,
  buildLiveAcceptanceBundleSigningBytes,
  parseLiveAcceptanceBundle,
} from "../packages/core/src/release/live-acceptance-bundle.ts"

const NOW = Date.parse("2026-07-17T08:00:00.000Z")
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
      authorizationId: "authorization:157",
      auditEventId: "audit:157",
      principalType: "authenticated_user",
      principalId: "operator:157",
      authenticationId: "authentication:157",
      roles: ["release_administrator"],
      approvedAt: NOW - 1_000,
      expiresAt: NOW + 60_000,
      redactionStatus: "verified",
    },
    evidence: [
      {
        evidenceRef: "live:webui:157",
        capability: "webui",
        scenarioId: "webui-live",
        terminalStatus: "passed",
        auditEventId: "audit:webui:157",
        executedAt: NOW,
        redactionStatus: "verified",
      },
    ],
  }
}

function bundle(value = payload()) {
  return {
    ...value,
    payloadSha256: buildLiveAcceptanceBundleChecksum(value),
    signature,
  }
}

describe("Task 157 live bundle signature boundary", () => {
  it("verifies the exact canonical payload bytes through the injected trusted verifier", () => {
    const verifySignature = vi.fn(() => true)
    const value = payload()
    expect(
      parseLiveAcceptanceBundle({
        value: bundle(value),
        expectedCandidate: candidate,
        now: NOW,
        verifySignature,
      }),
    ).toMatchObject({ status: "verified" })
    expect(verifySignature).toHaveBeenCalledOnce()
    expect(verifySignature).toHaveBeenCalledWith({
      algorithm: "ed25519",
      keyId: signature.keyId,
      signatureBase64: signature.valueBase64,
      payloadBytes: buildLiveAcceptanceBundleSigningBytes(value),
    })
  })

  it.each([
    ["missing verifier", undefined],
    ["denied signature", () => false],
    [
      "verifier failure",
      () => {
        throw new Error("crypto unavailable")
      },
    ],
  ])("rejects a self-authored bundle with %s", (_label, verifySignature) => {
    expect(
      parseLiveAcceptanceBundle({
        value: bundle(),
        expectedCandidate: candidate,
        now: NOW,
        verifySignature,
      }),
    ).toEqual({ status: "rejected", reasonCode: "live_acceptance_bundle_signature_invalid" })
  })

  it.each([
    [
      "live_acceptance_bundle_principal_unauthorized",
      { approval: { ...payload().approval, roles: ["release_viewer"] } },
    ],
    [
      "live_acceptance_bundle_principal_unauthorized",
      { approval: { ...payload().approval, principalType: "service" } },
    ],
    [
      "live_acceptance_bundle_revoked",
      { approval: { ...payload().approval, authorizationStatus: "revoked" } },
    ],
  ])("rejects authorization failure %s before signature verification", (reasonCode, overrides) => {
    const changed = { ...payload(), ...overrides } as unknown as LiveAcceptanceBundlePayload
    const verifySignature = vi.fn(() => true)
    expect(
      parseLiveAcceptanceBundle({
        value: bundle(changed),
        expectedCandidate: candidate,
        now: NOW,
        verifySignature,
      }),
    ).toEqual({ status: "rejected", reasonCode })
    expect(verifySignature).not.toHaveBeenCalled()
  })

  it.each([
    ["unknown algorithm", { ...signature, algorithm: "rsa" }],
    ["malformed key ID", { ...signature, keyId: "unknown" }],
    ["malformed signature", { ...signature, valueBase64: "not base64" }],
    ["extra signature field", { ...signature, secret: "unsafe" }],
  ])("rejects %s", (_label, invalidSignature) => {
    expect(
      parseLiveAcceptanceBundle({
        value: { ...bundle(), signature: invalidSignature },
        expectedCandidate: candidate,
        now: NOW,
        verifySignature: () => true,
      }),
    ).toEqual({ status: "rejected", reasonCode: "live_acceptance_bundle_signature_invalid" })
  })

  it("requires an explicit trusted public-key CLI input with every bundle", () => {
    const source = readFileSync("scripts/release-package.mjs", "utf8")
    expect(source).toContain("--live-acceptance-public-key")
    expect(source).not.toMatch(/KNOWBEE_LIVE_ACCEPTANCE_PUBLIC_KEY/u)
  })

  it("contains no private signing key or private-key loader", () => {
    const coreSource = readFileSync("packages/core/src/release/live-acceptance-bundle.ts", "utf8")
    const cliSource = readFileSync("scripts/release-package.mjs", "utf8")
    const verifierSource = readFileSync("scripts/lib/live-acceptance-verifier.mjs", "utf8")
    expect(`${coreSource}\n${cliSource}\n${verifierSource}`).not.toMatch(
      /BEGIN (?:RSA |EC )?PRIVATE KEY/u,
    )
    expect(cliSource).not.toMatch(/createPrivateKey|privateKeyPath|--live-acceptance-private/u)
    expect(verifierSource).not.toMatch(/createPrivateKey|privateKeyPath/u)
  })
})
