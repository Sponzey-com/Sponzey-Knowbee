import { type LiveAcceptanceBundle, type LiveAcceptanceBundleCandidate, type LiveAcceptanceBundlePayload, type LiveAcceptanceBundleSignatureVerifier } from "./live-acceptance-bundle.js";
export interface LiveAcceptanceSigningRequest {
    kind: "knowbee.release.live_acceptance_signing_request";
    schemaVersion: 1;
    requestId: string;
    requestedKeyId: `sha256:${string}`;
    payloadSha256: `sha256:${string}`;
    payload: Readonly<LiveAcceptanceBundlePayload>;
}
export interface LiveAcceptanceSignatureResponse {
    kind: "knowbee.release.live_acceptance_signature_response";
    schemaVersion: 1;
    requestId: string;
    algorithm: "ed25519";
    keyId: `sha256:${string}`;
    signatureBase64: string;
}
export type LiveAcceptanceSigningRequestResult = {
    status: "created";
    request: Readonly<LiveAcceptanceSigningRequest>;
} | {
    status: "rejected";
    reasonCode: string;
};
export type LiveAcceptanceBundleAssemblyResult = {
    status: "assembled";
    bundle: Readonly<LiveAcceptanceBundle>;
} | {
    status: "rejected";
    reasonCode: string;
};
export declare function createLiveAcceptanceSigningRequest(input: {
    value: unknown;
    expectedCandidate: LiveAcceptanceBundleCandidate;
    requestedKeyId: string;
    now: number;
}): LiveAcceptanceSigningRequestResult;
export declare function assembleLiveAcceptanceBundle(input: {
    request: unknown;
    response: unknown;
    expectedCandidate: LiveAcceptanceBundleCandidate;
    now: number;
    verifySignature: LiveAcceptanceBundleSignatureVerifier;
}): LiveAcceptanceBundleAssemblyResult;
//# sourceMappingURL=live-acceptance-signing-exchange.d.ts.map