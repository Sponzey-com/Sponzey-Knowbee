import { createHash, generateKeyPairSync, sign, verify } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  type LiveAcceptanceBundlePayload,
  buildLiveAcceptanceBundleSigningBytes,
} from "../packages/core/src/release/live-acceptance-bundle.ts"
import {
  assembleLiveAcceptanceBundle,
  createLiveAcceptanceSigningRequest,
} from "../packages/core/src/release/live-acceptance-signing-exchange.ts"

const NOW = Date.parse("2026-07-17T09:00:00.000Z")
const candidate = { appVersion: "1.2.3", gitTag: "v1.2.3", gitCommit: "abc1234" }
const { publicKey, privateKey } = generateKeyPairSync("ed25519")
const keyId = `sha256:${createHash("sha256")
  .update(publicKey.export({ type: "spki", format: "der" }))
  .digest("hex")}`

function payload(): LiveAcceptanceBundlePayload {
  return {
    kind: "knowbee.release.live_acceptance_bundle",
    schemaVersion: 2,
    candidate,
    approval: {
      decision: "approved",
      authorizationStatus: "active",
      authorizationId: "authorization:158",
      auditEventId: "audit:158",
      principalType: "authenticated_user",
      principalId: "operator:158",
      authenticationId: "authentication:158",
      roles: ["release_administrator"],
      approvedAt: NOW - 1_000,
      expiresAt: NOW + 60_000,
      redactionStatus: "verified",
    },
    evidence: [
      {
        evidenceRef: "live:webui:158",
        capability: "webui",
        scenarioId: "webui-live",
        terminalStatus: "passed",
        auditEventId: "audit:webui:158",
        executedAt: NOW,
        redactionStatus: "verified",
      },
    ],
  }
}

function createRequest(value: unknown = payload()) {
  return createLiveAcceptanceSigningRequest({
    value,
    expectedCandidate: candidate,
    requestedKeyId: keyId,
    now: NOW,
  })
}

describe("Task 158 live acceptance signing exchange", () => {
  it("exposes pure request creation and detached response assembly use cases", () => {
    const modulePath = "packages/core/src/release/live-acceptance-signing-exchange.ts"
    expect(existsSync(modulePath)).toBe(true)
    const source = existsSync(modulePath) ? readFileSync(modulePath, "utf8") : ""
    expect(source).toContain("export function createLiveAcceptanceSigningRequest")
    expect(source).toContain("export function assembleLiveAcceptanceBundle")
  })

  it("creates a bounded unsigned request and assembles only a valid external signature", () => {
    const created = createRequest()
    expect(created.status).toBe("created")
    if (created.status !== "created") throw new Error(created.reasonCode)
    expect(JSON.stringify(created.request)).not.toMatch(/valueBase64|requestText|resultDiagnosis/u)

    const signatureBase64 = sign(
      null,
      buildLiveAcceptanceBundleSigningBytes(created.request.payload),
      privateKey,
    ).toString("base64")
    const response = {
      kind: "knowbee.release.live_acceptance_signature_response",
      schemaVersion: 1,
      requestId: created.request.requestId,
      algorithm: "ed25519",
      keyId,
      signatureBase64,
    }
    const assembled = assembleLiveAcceptanceBundle({
      request: created.request,
      response,
      expectedCandidate: candidate,
      now: NOW,
      verifySignature: ({ keyId: claimedKeyId, payloadBytes, signatureBase64: encoded }) =>
        claimedKeyId === keyId &&
        verify(null, payloadBytes, publicKey, Buffer.from(encoded, "base64")),
    })
    expect(assembled).toMatchObject({ status: "assembled" })
  })

  it.each([
    [
      "live_acceptance_bundle_principal_unauthorized",
      { ...payload(), approval: { ...payload().approval, roles: ["release_viewer"] } },
    ],
    [
      "live_acceptance_bundle_expired",
      { ...payload(), approval: { ...payload().approval, expiresAt: NOW } },
    ],
    [
      "live_acceptance_bundle_candidate_mismatch",
      { ...payload(), candidate: { ...candidate, gitCommit: "other" } },
    ],
  ])("rejects an invalid signing request with %s", (reasonCode, value) => {
    expect(createRequest(value)).toEqual({ status: "rejected", reasonCode })
  })

  it("rejects a changed request and an invalid detached signature", () => {
    const created = createRequest()
    if (created.status !== "created") throw new Error(created.reasonCode)
    const response = {
      kind: "knowbee.release.live_acceptance_signature_response",
      schemaVersion: 1,
      requestId: created.request.requestId,
      algorithm: "ed25519",
      keyId,
      signatureBase64: `${"A".repeat(86)}==`,
    }
    expect(
      assembleLiveAcceptanceBundle({
        request: { ...created.request, requestId: "changed" },
        response,
        expectedCandidate: candidate,
        now: NOW,
        verifySignature: () => true,
      }),
    ).toEqual({ status: "rejected", reasonCode: "live_acceptance_signing_request_changed" })
    expect(
      assembleLiveAcceptanceBundle({
        request: created.request,
        response,
        expectedCandidate: candidate,
        now: NOW,
        verifySignature: () => false,
      }),
    ).toEqual({ status: "rejected", reasonCode: "live_acceptance_bundle_signature_invalid" })
  })

  it("provides request and assemble CLI modes without an in-repository signer", () => {
    const scriptPath = "scripts/live-acceptance-signing-exchange.mjs"
    expect(existsSync(scriptPath)).toBe(true)
    const source = existsSync(scriptPath) ? readFileSync(scriptPath, "utf8") : ""
    expect(source).toContain('command === "request"')
    expect(source).toContain('command === "assemble"')
    expect(source).not.toMatch(/createPrivateKey|privateKey|KNOWBEE_LIVE_ACCEPTANCE/u)
  })
})
