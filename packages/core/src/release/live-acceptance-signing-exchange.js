import { buildLiveAcceptanceBundleChecksum, parseLiveAcceptanceBundle, validateLiveAcceptanceBundlePayload, } from "./live-acceptance-bundle.js";
const REQUEST_KEYS = [
    "kind",
    "schemaVersion",
    "requestId",
    "requestedKeyId",
    "payloadSha256",
    "payload",
];
const RESPONSE_KEYS = [
    "kind",
    "schemaVersion",
    "requestId",
    "algorithm",
    "keyId",
    "signatureBase64",
];
const KEY_ID_PATTERN = /^sha256:[a-f0-9]{64}$/u;
function isRecord(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
function hasExactKeys(value, keys) {
    const actual = Object.keys(value).sort();
    const expected = [...keys].sort();
    return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
function requestId(payloadSha256, requestedKeyId) {
    return `live-request:${payloadSha256.slice("sha256:".length)}:${requestedKeyId.slice("sha256:".length)}`;
}
export function createLiveAcceptanceSigningRequest(input) {
    if (!KEY_ID_PATTERN.test(input.requestedKeyId)) {
        return { status: "rejected", reasonCode: "live_acceptance_signing_key_id_invalid" };
    }
    const validated = validateLiveAcceptanceBundlePayload({
        value: input.value,
        expectedCandidate: input.expectedCandidate,
        now: input.now,
    });
    if (validated.status === "rejected")
        return validated;
    const payload = validated.payload;
    const payloadSha256 = buildLiveAcceptanceBundleChecksum(payload);
    const request = {
        kind: "knowbee.release.live_acceptance_signing_request",
        schemaVersion: 1,
        requestId: requestId(payloadSha256, input.requestedKeyId),
        requestedKeyId: input.requestedKeyId,
        payloadSha256,
        payload: validated.payload,
    };
    return { status: "created", request: Object.freeze(request) };
}
export function assembleLiveAcceptanceBundle(input) {
    if (!isRecord(input.request) || !hasExactKeys(input.request, REQUEST_KEYS)) {
        return { status: "rejected", reasonCode: "live_acceptance_signing_request_invalid" };
    }
    if (!isRecord(input.response) || !hasExactKeys(input.response, RESPONSE_KEYS)) {
        return { status: "rejected", reasonCode: "live_acceptance_signature_response_invalid" };
    }
    const recreated = createLiveAcceptanceSigningRequest({
        value: input.request.payload,
        expectedCandidate: input.expectedCandidate,
        requestedKeyId: typeof input.request.requestedKeyId === "string" ? input.request.requestedKeyId : "",
        now: input.now,
    });
    if (recreated.status === "rejected")
        return recreated;
    if (input.request.kind !== recreated.request.kind ||
        input.request.schemaVersion !== recreated.request.schemaVersion ||
        input.request.requestId !== recreated.request.requestId ||
        input.request.payloadSha256 !== recreated.request.payloadSha256) {
        return { status: "rejected", reasonCode: "live_acceptance_signing_request_changed" };
    }
    if (input.response.kind !== "knowbee.release.live_acceptance_signature_response" ||
        input.response.schemaVersion !== 1 ||
        input.response.requestId !== recreated.request.requestId ||
        input.response.algorithm !== "ed25519" ||
        input.response.keyId !== recreated.request.requestedKeyId ||
        typeof input.response.signatureBase64 !== "string") {
        return { status: "rejected", reasonCode: "live_acceptance_signature_response_mismatch" };
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
    });
    if (parsed.status === "rejected")
        return parsed;
    return { status: "assembled", bundle: parsed.bundle };
}
//# sourceMappingURL=live-acceptance-signing-exchange.js.map