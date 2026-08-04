import { type YeonjangMqttV2Enrollment } from "./mqtt-v2-contract.js";
export interface YeonjangMqttV2ArtifactControlIdentity {
    readonly messageId: string;
    readonly requestId: string;
    readonly commandId: string;
    readonly operationId: string;
    readonly correlationId: string;
    readonly causationId: string;
    readonly idempotencyKey: string;
    readonly authorizationId: string;
    readonly nonce: string;
}
export interface YeonjangMqttV2ArtifactControlEnvelope {
    readonly protocol_version: 2;
    readonly schema_id: "yeonjang.artifact-control.v2";
    readonly message_kind: "control";
    readonly message_id: string;
    readonly request_id: string;
    readonly command_id: string;
    readonly operation_id: string;
    readonly correlation_id: string;
    readonly causation_id: string;
    readonly requester_id: string;
    readonly target_instance_id: string;
    readonly target_session_id: string;
    readonly target_fingerprint: string;
    readonly idempotency_key: string;
    readonly issued_at: number;
    readonly expires_at: number;
    readonly sequence: number;
    readonly payload: Readonly<Record<string, unknown>>;
    readonly authorization: Readonly<Record<string, unknown>> & {
        readonly signature: string;
    };
}
/** Builds one signed artifact lifecycle control from an admitted terminal. */
export declare function createYeonjangMqttV2ArtifactControl(input: {
    readonly kind: "fetch" | "ack" | "cancel";
    readonly enrollment: YeonjangMqttV2Enrollment;
    readonly targetFingerprint: string;
    readonly ownerRequestId: string;
    readonly ownerOperationId: string;
    readonly descriptor: {
        readonly artifactRef: string;
        readonly fullDigest: string;
        readonly lifecycleRevision: number;
    };
    readonly transferId: string;
    readonly expectedRevision: number;
    readonly identity: YeonjangMqttV2ArtifactControlIdentity;
    readonly issuedAt: number;
    readonly expiresAt: number;
    readonly sequence: number;
    readonly hmacKey: Uint8Array;
}): {
    readonly topic: string;
    readonly envelope: YeonjangMqttV2ArtifactControlEnvelope;
};
export type YeonjangMqttV2ArtifactFetchRejectReason = "missing" | "wrong_owner" | "wrong_transfer" | "revision_conflict" | "digest_mismatch" | "invalid_state" | "expired" | "source_unavailable" | "verification_failed" | "storage_conflict" | "unavailable";
export type YeonjangMqttV2ArtifactFetchRejectionAdmission = {
    readonly ok: true;
    readonly rejection: {
        readonly reason: YeonjangMqttV2ArtifactFetchRejectReason;
    };
} | {
    readonly ok: false;
    readonly reasonCode: "yeonjang_v2_artifact_fetch_payload_invalid" | "yeonjang_v2_artifact_fetch_identity_mismatch" | "yeonjang_v2_artifact_fetch_expired" | "yeonjang_v2_artifact_fetch_signature_rejected";
};
export interface YeonjangMqttV2ExpectedArtifactFetchRejection {
    readonly enrollment: YeonjangMqttV2Enrollment;
    readonly targetFingerprint: string;
    readonly messageId: string;
    readonly requestId: string;
    readonly commandId: string;
    readonly operationId: string;
    readonly correlationId: string;
    readonly idempotencyKey: string;
    readonly artifactRef: string;
    readonly ownerRequestId: string;
    readonly ownerOperationId: string;
    readonly transferId: string;
    readonly expectedRevision: number;
}
/**
 * Admits only an authenticated rejection for the exact fetch control already
 * published by this requester. Structural or authorization failures never
 * become lifecycle truth and artifact bytes are never included in this DTO.
 */
export declare function admitYeonjangMqttV2ArtifactFetchRejection(input: {
    readonly payload: Uint8Array;
    readonly nowMs: number;
    readonly hmacKey: Uint8Array;
    readonly expected: YeonjangMqttV2ExpectedArtifactFetchRejection;
}): YeonjangMqttV2ArtifactFetchRejectionAdmission;
export type YeonjangMqttV2ArtifactAssemblyResult = {
    readonly ok: true;
    readonly state: "pending";
} | {
    readonly ok: true;
    readonly state: "complete";
    readonly bytes: Buffer;
} | {
    readonly ok: false;
    readonly reasonCode: "yeonjang_v2_artifact_frame_invalid" | "yeonjang_v2_artifact_binding_mismatch" | "yeonjang_v2_artifact_digest_mismatch" | "yeonjang_v2_artifact_expired" | "yeonjang_v2_artifact_already_terminal";
};
export interface YeonjangMqttV2ArtifactAssembler {
    accept(frame: Uint8Array): YeonjangMqttV2ArtifactAssemblyResult;
}
/** Bounded reference consumer for `YAC2 | u32 header length | JSON | raw`. */
export declare function createYeonjangMqttV2ArtifactAssembler(input: {
    readonly transferId: string;
    readonly artifactRef: string;
    readonly ownerRequesterId: string;
    readonly ownerRequestId: string;
    readonly fullDigest: string;
    readonly totalSize: number;
    readonly expiresAtMs: number;
    readonly nowMs: () => number;
}): YeonjangMqttV2ArtifactAssembler;
//# sourceMappingURL=mqtt-v2-artifact.d.ts.map