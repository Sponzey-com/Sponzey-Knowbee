import { createHash } from "node:crypto";
function canonicalJson(value) {
    if (Array.isArray(value))
        return `[${value.map(canonicalJson).join(",")}]`;
    if (value && typeof value === "object") {
        return `{${Object.entries(value)
            .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
            .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
            .join(",")}}`;
    }
    const encoded = JSON.stringify(value);
    if (encoded === undefined)
        throw new Error("live_acceptance_bundle_canonical_value_invalid");
    return encoded;
}
export function buildLiveAcceptanceBundleSigningBytes(payload) {
    return new TextEncoder().encode(canonicalJson(payload));
}
export function buildLiveAcceptanceBundleChecksum(payload) {
    return `sha256:${createHash("sha256")
        .update(buildLiveAcceptanceBundleSigningBytes(payload))
        .digest("hex")}`;
}
const TOP_LEVEL_KEYS = [
    "kind",
    "schemaVersion",
    "candidate",
    "approval",
    "evidence",
    "payloadSha256",
    "signature",
];
const PAYLOAD_KEYS = ["kind", "schemaVersion", "candidate", "approval", "evidence"];
const CANDIDATE_KEYS = ["appVersion", "gitTag", "gitCommit"];
const APPROVAL_KEYS = [
    "decision",
    "authorizationStatus",
    "authorizationId",
    "auditEventId",
    "principalType",
    "principalId",
    "authenticationId",
    "roles",
    "approvedAt",
    "expiresAt",
    "redactionStatus",
];
const SIGNATURE_KEYS = ["algorithm", "keyId", "valueBase64"];
const EVIDENCE_KEYS = [
    "evidenceRef",
    "capability",
    "scenarioId",
    "terminalStatus",
    "auditEventId",
    "executedAt",
    "redactionStatus",
];
const CAPABILITIES = new Set(["webui", "telegram", "slack", "web", "skill", "mcp", "yeonjang"]);
const KEY_ID_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const ED25519_SIGNATURE_PATTERN = /^[A-Za-z0-9+/]{86}==$/u;
function isRecord(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
function hasExactKeys(value, keys) {
    const actual = Object.keys(value).sort();
    const expected = [...keys].sort();
    return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
function isNullableString(value) {
    return value === null || typeof value === "string";
}
function reject(reasonCode) {
    return { status: "rejected", reasonCode };
}
function validatePayloadFields(input) {
    if (input.value.kind !== "knowbee.release.live_acceptance_bundle" ||
        input.value.schemaVersion !== 2) {
        return { status: "rejected", reasonCode: "live_acceptance_bundle_schema_invalid" };
    }
    const candidate = input.value.candidate;
    if (!isRecord(candidate) ||
        !hasExactKeys(candidate, CANDIDATE_KEYS) ||
        typeof candidate.appVersion !== "string" ||
        !candidate.appVersion.trim() ||
        !isNullableString(candidate.gitTag) ||
        !isNullableString(candidate.gitCommit)) {
        return { status: "rejected", reasonCode: "live_acceptance_bundle_candidate_invalid" };
    }
    if (candidate.appVersion !== input.expectedCandidate.appVersion ||
        candidate.gitTag !== input.expectedCandidate.gitTag ||
        candidate.gitCommit !== input.expectedCandidate.gitCommit) {
        return { status: "rejected", reasonCode: "live_acceptance_bundle_candidate_mismatch" };
    }
    const approval = input.value.approval;
    if (!isRecord(approval) || !hasExactKeys(approval, APPROVAL_KEYS)) {
        return { status: "rejected", reasonCode: "live_acceptance_bundle_approval_invalid" };
    }
    if (approval.decision !== "approved") {
        return { status: "rejected", reasonCode: "live_acceptance_bundle_not_approved" };
    }
    if (approval.authorizationStatus === "revoked") {
        return { status: "rejected", reasonCode: "live_acceptance_bundle_revoked" };
    }
    if (approval.principalType !== "authenticated_user" ||
        typeof approval.principalId !== "string" ||
        !approval.principalId.trim() ||
        typeof approval.authenticationId !== "string" ||
        !approval.authenticationId.trim() ||
        !Array.isArray(approval.roles) ||
        approval.roles.length === 0 ||
        approval.roles.some((role) => typeof role !== "string" || !role.trim()) ||
        new Set(approval.roles).size !== approval.roles.length ||
        !approval.roles.includes("release_administrator")) {
        return { status: "rejected", reasonCode: "live_acceptance_bundle_principal_unauthorized" };
    }
    if (approval.authorizationStatus !== "active" ||
        typeof approval.authorizationId !== "string" ||
        !approval.authorizationId.trim() ||
        typeof approval.auditEventId !== "string" ||
        !approval.auditEventId.trim() ||
        !Number.isSafeInteger(approval.approvedAt) ||
        !Number.isSafeInteger(approval.expiresAt) ||
        approval.approvedAt > input.now ||
        approval.approvedAt >= approval.expiresAt ||
        approval.redactionStatus !== "verified") {
        return { status: "rejected", reasonCode: "live_acceptance_bundle_approval_invalid" };
    }
    if (approval.expiresAt <= input.now) {
        return { status: "rejected", reasonCode: "live_acceptance_bundle_expired" };
    }
    if (!Array.isArray(input.value.evidence) || input.value.evidence.length === 0) {
        return { status: "rejected", reasonCode: "live_acceptance_bundle_evidence_invalid" };
    }
    const evidence = [];
    const scenarioKeys = new Set();
    for (const item of input.value.evidence) {
        if (!isRecord(item) ||
            !hasExactKeys(item, EVIDENCE_KEYS) ||
            typeof item.evidenceRef !== "string" ||
            !item.evidenceRef.trim() ||
            typeof item.scenarioId !== "string" ||
            !item.scenarioId.trim() ||
            typeof item.auditEventId !== "string" ||
            !item.auditEventId.trim() ||
            typeof item.capability !== "string" ||
            !CAPABILITIES.has(item.capability) ||
            item.terminalStatus !== "passed" ||
            !Number.isSafeInteger(item.executedAt) ||
            item.redactionStatus !== "verified") {
            return { status: "rejected", reasonCode: "live_acceptance_bundle_evidence_invalid" };
        }
        const scenarioKey = `${item.capability}:${item.scenarioId}`;
        if (scenarioKeys.has(scenarioKey)) {
            return { status: "rejected", reasonCode: "live_acceptance_bundle_capability_duplicate" };
        }
        scenarioKeys.add(scenarioKey);
        evidence.push(Object.freeze({ ...item }));
    }
    const payload = {
        kind: "knowbee.release.live_acceptance_bundle",
        schemaVersion: 2,
        candidate: Object.freeze({ ...candidate }),
        approval: Object.freeze({
            ...approval,
            roles: Object.freeze([...approval.roles]),
        }),
        evidence: Object.freeze(evidence),
    };
    return { status: "verified", payload: Object.freeze(payload) };
}
export function validateLiveAcceptanceBundlePayload(input) {
    if (!isRecord(input.value) || !hasExactKeys(input.value, PAYLOAD_KEYS)) {
        return { status: "rejected", reasonCode: "live_acceptance_signing_payload_invalid" };
    }
    return validatePayloadFields({
        value: input.value,
        expectedCandidate: input.expectedCandidate,
        now: input.now,
    });
}
export function parseLiveAcceptanceBundle(input) {
    if (!isRecord(input.value) || !hasExactKeys(input.value, TOP_LEVEL_KEYS)) {
        return reject("live_acceptance_bundle_shape_invalid");
    }
    const payloadResult = validatePayloadFields({
        value: input.value,
        expectedCandidate: input.expectedCandidate,
        now: input.now,
    });
    if (payloadResult.status === "rejected")
        return payloadResult;
    const payload = payloadResult.payload;
    if (typeof input.value.payloadSha256 !== "string" ||
        input.value.payloadSha256 !== buildLiveAcceptanceBundleChecksum(payload)) {
        return reject("live_acceptance_bundle_checksum_mismatch");
    }
    const signature = input.value.signature;
    if (!isRecord(signature) ||
        !hasExactKeys(signature, SIGNATURE_KEYS) ||
        signature.algorithm !== "ed25519" ||
        typeof signature.keyId !== "string" ||
        !KEY_ID_PATTERN.test(signature.keyId) ||
        typeof signature.valueBase64 !== "string" ||
        !ED25519_SIGNATURE_PATTERN.test(signature.valueBase64)) {
        return reject("live_acceptance_bundle_signature_invalid");
    }
    try {
        if (!input.verifySignature?.({
            algorithm: "ed25519",
            keyId: signature.keyId,
            signatureBase64: signature.valueBase64,
            payloadBytes: buildLiveAcceptanceBundleSigningBytes(payload),
        })) {
            return reject("live_acceptance_bundle_signature_invalid");
        }
    }
    catch {
        return reject("live_acceptance_bundle_signature_invalid");
    }
    const verified = {
        ...payload,
        candidate: Object.freeze({ ...payload.candidate }),
        approval: Object.freeze({
            ...payload.approval,
            roles: Object.freeze([...payload.approval.roles]),
        }),
        evidence: Object.freeze(payload.evidence.map((item) => Object.freeze({ ...item }))),
        payloadSha256: input.value.payloadSha256,
        signature: Object.freeze({
            algorithm: "ed25519",
            keyId: signature.keyId,
            valueBase64: signature.valueBase64,
        }),
    };
    return { status: "verified", bundle: Object.freeze(verified) };
}
//# sourceMappingURL=live-acceptance-bundle.js.map