import type { YeonjangMqttV2Enrollment } from "./mqtt-v2-contract.js";
export interface YeonjangMqttV2ExpectedResponseIdentity {
    readonly enrollment: YeonjangMqttV2Enrollment;
    readonly requestId: string;
    readonly commandId: string;
    readonly operationId: string;
    readonly idempotencyKey: string;
    readonly targetFingerprint: string;
}
export interface YeonjangMqttV2ArtifactDescriptor {
    readonly artifactRef: string;
    readonly kind: "camera_jpeg" | "screen_png";
    readonly mediaType: "image/jpeg" | "image/png";
    readonly sizeBytes: number;
    readonly fullDigest: string;
    readonly createdAtMs: number;
    readonly expiresAtMs: number;
    readonly lifecycleRevision: number;
}
export interface YeonjangMqttV2TerminalResult {
    readonly receiptId: string;
    readonly responseDigest: string;
    readonly terminalRevision: number;
    readonly executionOutcome: "blocked" | "failed" | "cancelled" | "effect_unknown" | "succeeded";
    readonly deliveryOutcome: "not_started" | "queued" | "published" | "consumer_acknowledged" | "pending_retry" | "failed" | "expired";
    readonly failure: Readonly<Record<string, unknown>> | null;
    readonly artifact: YeonjangMqttV2ArtifactDescriptor | null;
}
export type YeonjangMqttV2TerminalAdmission = {
    readonly ok: true;
    readonly terminal: YeonjangMqttV2TerminalResult;
} | {
    readonly ok: false;
    readonly reasonCode: "yeonjang_v2_response_payload_invalid" | "yeonjang_v2_response_identity_mismatch" | "yeonjang_v2_response_expired" | "yeonjang_v2_response_signature_rejected";
};
/**
 * Verifies a terminal publication before any artifact fetch, acknowledgement,
 * or user-visible completion. The expected identity comes from the dispatched
 * command snapshot; no field is reconstructed from response prose.
 */
export declare function admitYeonjangMqttV2TerminalResponse(input: {
    readonly payload: Uint8Array;
    readonly nowMs: number;
    readonly hmacKey: Uint8Array;
    readonly expected: YeonjangMqttV2ExpectedResponseIdentity;
}): YeonjangMqttV2TerminalAdmission;
//# sourceMappingURL=mqtt-v2-response.d.ts.map