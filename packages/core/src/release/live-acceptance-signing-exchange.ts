import {
  type LiveAcceptanceBundle,
  type LiveAcceptanceBundleCandidate,
  type LiveAcceptanceBundlePayload,
  type LiveAcceptanceBundleSignatureVerifier,
  buildLiveAcceptanceBundleChecksum,
  parseLiveAcceptanceBundle,
  validateLiveAcceptanceBundlePayload,
} from "./live-acceptance-bundle.js"

export interface LiveAcceptanceSigningRequest {
  kind: "knowbee.release.live_acceptance_signing_request"
  schemaVersion: 1
  requestId: string
  requestedKeyId: `sha256:${string}`
  payloadSha256: `sha256:${string}`
  payload: Readonly<LiveAcceptanceBundlePayload>
}

export interface LiveAcceptanceSignatureResponse {
  kind: "knowbee.release.live_acceptance_signature_response"
  schemaVersion: 1
  requestId: string
  algorithm: "ed25519"
  keyId: `sha256:${string}`
  signatureBase64: string
}

export type LiveAcceptanceSigningRequestResult =
  | { status: "created"; request: Readonly<LiveAcceptanceSigningRequest> }
  | { status: "rejected"; reasonCode: string }

export type LiveAcceptanceBundleAssemblyResult =
  | { status: "assembled"; bundle: Readonly<LiveAcceptanceBundle> }
  | { status: "rejected"; reasonCode: string }

const REQUEST_KEYS = [
  "kind",
  "schemaVersion",
  "requestId",
  "requestedKeyId",
  "payloadSha256",
  "payload",
]
const RESPONSE_KEYS = [
  "kind",
  "schemaVersion",
  "requestId",
  "algorithm",
  "keyId",
  "signatureBase64",
]
const KEY_ID_PATTERN = /^sha256:[a-f0-9]{64}$/u

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function requestId(payloadSha256: string, requestedKeyId: string): string {
  return `live-request:${payloadSha256.slice("sha256:".length)}:${requestedKeyId.slice("sha256:".length)}`
}

export function createLiveAcceptanceSigningRequest(input: {
  value: unknown
  expectedCandidate: LiveAcceptanceBundleCandidate
  requestedKeyId: string
  now: number
}): LiveAcceptanceSigningRequestResult {
  if (!KEY_ID_PATTERN.test(input.requestedKeyId)) {
    return { status: "rejected", reasonCode: "live_acceptance_signing_key_id_invalid" }
  }
  const validated = validateLiveAcceptanceBundlePayload({
    value: input.value,
    expectedCandidate: input.expectedCandidate,
    now: input.now,
  })
  if (validated.status === "rejected") return validated
  const payload = validated.payload as LiveAcceptanceBundlePayload
  const payloadSha256 = buildLiveAcceptanceBundleChecksum(payload)

  const request: LiveAcceptanceSigningRequest = {
    kind: "knowbee.release.live_acceptance_signing_request",
    schemaVersion: 1,
    requestId: requestId(payloadSha256, input.requestedKeyId),
    requestedKeyId: input.requestedKeyId as `sha256:${string}`,
    payloadSha256,
    payload: validated.payload,
  }
  return { status: "created", request: Object.freeze(request) }
}

export function assembleLiveAcceptanceBundle(input: {
  request: unknown
  response: unknown
  expectedCandidate: LiveAcceptanceBundleCandidate
  now: number
  verifySignature: LiveAcceptanceBundleSignatureVerifier
}): LiveAcceptanceBundleAssemblyResult {
  if (!isRecord(input.request) || !hasExactKeys(input.request, REQUEST_KEYS)) {
    return { status: "rejected", reasonCode: "live_acceptance_signing_request_invalid" }
  }
  if (!isRecord(input.response) || !hasExactKeys(input.response, RESPONSE_KEYS)) {
    return { status: "rejected", reasonCode: "live_acceptance_signature_response_invalid" }
  }
  const recreated = createLiveAcceptanceSigningRequest({
    value: input.request.payload,
    expectedCandidate: input.expectedCandidate,
    requestedKeyId:
      typeof input.request.requestedKeyId === "string" ? input.request.requestedKeyId : "",
    now: input.now,
  })
  if (recreated.status === "rejected") return recreated
  if (
    input.request.kind !== recreated.request.kind ||
    input.request.schemaVersion !== recreated.request.schemaVersion ||
    input.request.requestId !== recreated.request.requestId ||
    input.request.payloadSha256 !== recreated.request.payloadSha256
  ) {
    return { status: "rejected", reasonCode: "live_acceptance_signing_request_changed" }
  }
  if (
    input.response.kind !== "knowbee.release.live_acceptance_signature_response" ||
    input.response.schemaVersion !== 1 ||
    input.response.requestId !== recreated.request.requestId ||
    input.response.algorithm !== "ed25519" ||
    input.response.keyId !== recreated.request.requestedKeyId ||
    typeof input.response.signatureBase64 !== "string"
  ) {
    return { status: "rejected", reasonCode: "live_acceptance_signature_response_mismatch" }
  }
  const parsed = parseLiveAcceptanceBundle({
    value: {
      ...recreated.request.payload,
      payloadSha256: recreated.request.payloadSha256,
      signature: {
        algorithm: "ed25519",
        keyId: recreated.request.requestedKeyId,
        valueBase64: input.response.signatureBase64,
      },
    },
    expectedCandidate: input.expectedCandidate,
    now: input.now,
    verifySignature: input.verifySignature,
  })
  if (parsed.status === "rejected") return parsed
  return { status: "assembled", bundle: parsed.bundle }
}
