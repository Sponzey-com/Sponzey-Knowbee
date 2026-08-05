import type { LiveAcceptanceEvidence } from "./live-acceptance-admission.js";
export interface LiveAcceptanceBundleCandidate {
    appVersion: string;
    gitTag: string | null;
    gitCommit: string | null;
}
export interface LiveAcceptanceBundleApproval {
    decision: "approved";
    authorizationStatus: "active";
    authorizationId: string;
    auditEventId: string;
    principalType: "authenticated_user";
    principalId: string;
    authenticationId: string;
    roles: string[];
    approvedAt: number;
    expiresAt: number;
    redactionStatus: "verified";
}
export interface LiveAcceptanceBundlePayload {
    kind: "knowbee.release.live_acceptance_bundle";
    schemaVersion: 2;
    candidate: LiveAcceptanceBundleCandidate;
    approval: LiveAcceptanceBundleApproval;
    evidence: LiveAcceptanceEvidence[];
}
export interface LiveAcceptanceBundleSignature {
    algorithm: "ed25519";
    keyId: `sha256:${string}`;
    valueBase64: string;
}
export interface LiveAcceptanceBundle extends LiveAcceptanceBundlePayload {
    payloadSha256: `sha256:${string}`;
    signature: LiveAcceptanceBundleSignature;
}
export interface LiveAcceptanceBundleSignatureVerification {
    algorithm: "ed25519";
    keyId: `sha256:${string}`;
    signatureBase64: string;
    payloadBytes: Uint8Array;
}
export type LiveAcceptanceBundleSignatureVerifier = (input: Readonly<LiveAcceptanceBundleSignatureVerification>) => boolean;
export type LiveAcceptanceBundleParseResult = {
    status: "verified";
    bundle: Readonly<LiveAcceptanceBundle>;
} | {
    status: "rejected";
    reasonCode: string;
};
export declare function buildLiveAcceptanceBundleSigningBytes(payload: LiveAcceptanceBundlePayload): Uint8Array;
export declare function buildLiveAcceptanceBundleChecksum(payload: LiveAcceptanceBundlePayload): `sha256:${string}`;
export type LiveAcceptanceBundlePayloadValidationResult = {
    status: "verified";
    payload: Readonly<LiveAcceptanceBundlePayload>;
} | {
    status: "rejected";
    reasonCode: string;
};
export declare function validateLiveAcceptanceBundlePayload(input: {
    value: unknown;
    expectedCandidate: LiveAcceptanceBundleCandidate;
    now: number;
}): LiveAcceptanceBundlePayloadValidationResult;
export declare function parseLiveAcceptanceBundle(input: {
    value: unknown;
    expectedCandidate: LiveAcceptanceBundleCandidate;
    now: number;
    verifySignature?: LiveAcceptanceBundleSignatureVerifier;
}): LiveAcceptanceBundleParseResult;
//# sourceMappingURL=live-acceptance-bundle.d.ts.map