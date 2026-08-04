import { type YeonjangMqttV2Enrollment } from "./mqtt-v2-contract.js";
type PermissionReadOutcome = "available" | "binding_mismatch" | "policy_unavailable" | "observation_unavailable";
type PermissionOsState = "not_observed" | "not_required" | "granted" | "not_determined" | "denied" | "restricted";
export interface YeonjangMqttV2PermissionIdentity {
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
export interface YeonjangMqttV2CapturePermission {
    readonly outcome: PermissionReadOutcome;
    readonly policyRevision?: number;
    readonly permissions?: readonly {
        readonly method: "camera.capture" | "screen.capture";
        readonly resource: "camera" | "screen";
        readonly settingName: "allow_camera_access" | "allow_screen_capture";
        readonly platformAvailable: boolean;
        readonly localPolicy: "allowed" | "denied";
        readonly policyResource: "any" | "exact_camera" | "exact_display";
        readonly osPermission: PermissionOsState;
    }[];
}
export interface YeonjangMqttV2CapturePermissionQuery {
    readonly topic: string;
    readonly enrollment: YeonjangMqttV2Enrollment;
    readonly envelope: {
        readonly protocol_version: 2;
        readonly schema_id: "yeonjang.control.v2";
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
        readonly payload: {
            readonly control: "capture.permission.get";
            readonly params: Record<string, never>;
        };
        readonly authorization: {
            readonly schema_version: 1;
            readonly authorization_id: string;
            readonly issuer: string;
            readonly key_id: "requester-hmac-v2";
            readonly audience: string;
            readonly scope: "permission.read";
            readonly requester_id: string;
            readonly command_id: string;
            readonly operation_id: string;
            readonly target_instance_id: string;
            readonly target_session_id: string;
            readonly target_fingerprint: string;
            readonly idempotency_key: string;
            readonly expires_at: number;
            readonly nonce: string;
            readonly signature: string;
        };
    };
}
export type YeonjangMqttV2CapturePermissionAdmission = {
    readonly ok: true;
    readonly permission: YeonjangMqttV2CapturePermission;
} | {
    readonly ok: false;
    readonly reasonCode: "yeonjang_v2_permission_response_payload_invalid" | "yeonjang_v2_permission_response_identity_mismatch" | "yeonjang_v2_permission_response_expired" | "yeonjang_v2_permission_response_signature_rejected";
};
/**
 * Builds the versioned, read-only permission control request accepted by the
 * existing Yeonjang v2 adapter. It intentionally has no device selector or
 * OS prompt parameter, so it cannot become a capture command by accident.
 */
export declare function createYeonjangMqttV2CapturePermissionQuery(input: {
    readonly enrollment: YeonjangMqttV2Enrollment;
    readonly targetFingerprint: string;
    readonly identity: YeonjangMqttV2PermissionIdentity;
    readonly issuedAt: number;
    readonly expiresAt: number;
    readonly sequence: number;
    readonly hmacKey: Uint8Array;
}): YeonjangMqttV2CapturePermissionQuery;
/** Verifies the exact response identity and HMAC before projecting OS state. */
export declare function admitYeonjangMqttV2CapturePermissionResponse(input: {
    readonly payload: Uint8Array;
    readonly nowMs: number;
    readonly hmacKey: Uint8Array;
    readonly expected: {
        readonly enrollment: YeonjangMqttV2Enrollment;
        readonly requestId: string;
        readonly commandId: string;
        readonly operationId: string;
        readonly idempotencyKey: string;
        readonly targetFingerprint: string;
    };
}): YeonjangMqttV2CapturePermissionAdmission;
export {};
//# sourceMappingURL=mqtt-v2-permission.d.ts.map