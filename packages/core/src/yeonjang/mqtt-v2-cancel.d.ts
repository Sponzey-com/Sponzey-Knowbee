import { type YeonjangMqttV2Enrollment } from "./mqtt-v2-contract.js";
interface YeonjangMqttV2CancellationTarget {
    readonly requestId: string;
    readonly commandId: string;
    readonly operationId: string;
    readonly idempotencyKey: string;
    readonly cancellationId: string;
    readonly cancelToken: string;
}
interface YeonjangMqttV2CancellationIdentity {
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
export interface YeonjangMqttV2CancellationEnvelope {
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
        readonly control: "command.cancel";
        readonly params: Readonly<Record<string, string>>;
    };
    readonly authorization: Readonly<Record<string, unknown>> & {
        readonly signature: string;
    };
}
/**
 * Builds the producer-owned v2 command cancellation contract. The target
 * identity is copied from the dispatched command; no alias or prose is
 * reinterpreted while cancelling an active effect.
 */
export declare function createYeonjangMqttV2Cancellation(input: {
    readonly enrollment: YeonjangMqttV2Enrollment;
    readonly targetFingerprint: string;
    readonly target: YeonjangMqttV2CancellationTarget;
    readonly identity: YeonjangMqttV2CancellationIdentity;
    readonly issuedAt: number;
    readonly expiresAt: number;
    readonly sequence: number;
    readonly hmacKey: Uint8Array;
    readonly reason?: "user_requested" | "deadline_exceeded" | "runtime_shutdown";
}): {
    readonly topic: string;
    readonly envelope: YeonjangMqttV2CancellationEnvelope;
};
export {};
//# sourceMappingURL=mqtt-v2-cancel.d.ts.map