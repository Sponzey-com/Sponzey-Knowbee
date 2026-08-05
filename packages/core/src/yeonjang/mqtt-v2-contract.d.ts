export interface YeonjangMqttV2Enrollment {
    readonly instanceId: string;
    readonly sessionId: string;
    readonly requesterId: string;
}
export type YeonjangMqttV2EnrollmentParseResult = {
    readonly ok: true;
    readonly enrollment: YeonjangMqttV2Enrollment;
} | {
    readonly ok: false;
    readonly reasonCode: "yeonjang_v2_enrollment_invalid";
};
export interface YeonjangMqttV2Topics {
    readonly commandTopic: string;
    readonly controlTopic: string;
    readonly adminTopic: string;
    readonly responseTopic: string;
    readonly eventTopic: string;
    readonly statusTopic: string;
    readonly capabilitiesTopic: string;
    readonly artifactChunkFilter: string;
}
export interface YeonjangMqttV2ObservationTopic {
    readonly instanceId: string;
    readonly sessionId: string;
    readonly kind: "status" | "capabilities";
}
export interface YeonjangMqttV2StatusObservation {
    readonly kind: "status";
    readonly instanceId: string;
    readonly sessionId: string;
    readonly targetFingerprint: string;
    readonly state: "online" | "offline";
    readonly observedAt: number;
    readonly expiresAt: number | null;
    readonly sequence: number;
}
export interface YeonjangMqttV2CapabilityRow {
    readonly method: "camera.capture" | "screen.capture";
    readonly resource: "camera" | "screen";
    readonly implementationStatus: "executable" | "unavailable" | "contract_only";
    readonly platformAvailable: boolean;
    readonly localPolicy: "allowed" | "denied";
    readonly authorizationScope: "effect.execute";
    readonly cancellable: true;
    readonly postCheckRequired: true;
    readonly artifactDelivery: "mqtt.fetch_ack";
    readonly knownLimitation?: string;
}
export interface YeonjangMqttV2CapabilitiesObservation {
    readonly kind: "capabilities";
    readonly instanceId: string;
    readonly sessionId: string;
    readonly targetFingerprint: string;
    readonly platform: "macos" | "windows" | "linux" | "android" | "ios";
    readonly policyRevision: number;
    readonly advertisedMethods: readonly ("camera.capture" | "screen.capture")[];
    readonly capabilities: readonly YeonjangMqttV2CapabilityRow[];
    readonly observedAt: number;
    readonly expiresAt: number;
    readonly sequence: number;
}
export type YeonjangMqttV2ObservationAdmissionResult = {
    readonly ok: true;
    readonly observation: YeonjangMqttV2StatusObservation | YeonjangMqttV2CapabilitiesObservation;
} | {
    readonly ok: false;
    readonly reasonCode: "yeonjang_v2_observation_topic_invalid" | "yeonjang_v2_observation_non_retained" | "yeonjang_v2_observation_payload_invalid" | "yeonjang_v2_observation_identity_mismatch" | "yeonjang_v2_observation_expired" | "yeonjang_v2_observation_signature_rejected";
};
export type YeonjangMqttV2CommandMethod = "camera.capture" | "screen.capture";
/**
 * Converts a canonical opaque identity at the external DTO boundary only when
 * the producer's 64-byte topic/envelope grammar cannot carry it verbatim.
 * The mapping is stable and cryptographic; it never interprets prose.
 */
export declare function mapYeonjangMqttV2WireIdentity(label: string, canonical: string): string;
export interface YeonjangMqttV2CommandIdentity {
    readonly messageId: string;
    readonly requestId: string;
    readonly commandId: string;
    readonly operationId: string;
    readonly correlationId: string;
    readonly causationId: string;
    readonly idempotencyKey: string;
    readonly cancellationId: string;
    readonly cancelToken: string;
    readonly authorizationId: string;
    readonly nonce: string;
}
export interface YeonjangMqttV2CommandEnvelope {
    readonly protocol_version: 2;
    readonly schema_id: "yeonjang.command.v2";
    readonly message_kind: "command";
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
    readonly cancellation_id: string;
    readonly cancel_token: string;
    readonly issued_at: number;
    readonly expires_at: number;
    readonly sequence: number;
    readonly payload: {
        readonly method: YeonjangMqttV2CommandMethod;
        readonly params: Readonly<Record<string, unknown>>;
    };
    readonly authorization: {
        readonly schema_version: 1;
        readonly authorization_id: string;
        readonly issuer: string;
        readonly key_id: "requester-hmac-v2";
        readonly audience: string;
        readonly scope: "effect.execute";
        readonly method: YeonjangMqttV2CommandMethod;
        readonly resource: "camera" | "screen";
        readonly requester_id: string;
        readonly command_id: string;
        readonly operation_id: string;
        readonly target_instance_id: string;
        readonly target_session_id: string;
        readonly target_fingerprint: string;
        readonly idempotency_key: string;
        readonly cancellation_id: string;
        readonly cancel_token: string;
        readonly expires_at: number;
        readonly nonce: string;
        readonly signature: string;
    };
}
/**
 * Validates the public v2 topic identity without consulting aliases, broker
 * credentials, or legacy v1 routes. The Rust producer applies the same
 * lowercase identifier grammar and 64-byte bound.
 */
export declare function parseYeonjangMqttV2Enrollment(value: YeonjangMqttV2Enrollment): YeonjangMqttV2EnrollmentParseResult;
/** Builds the exact topic set owned by one enrolled requester. */
export declare function buildYeonjangMqttV2Topics(value: YeonjangMqttV2Enrollment): YeonjangMqttV2Topics;
/** Parses only the retained instance-session read projection namespace. */
export declare function parseYeonjangMqttV2ObservationTopic(topic: string): YeonjangMqttV2ObservationTopic | null;
/**
 * Admits a retained v2 liveness projection only after strict shape, exact
 * topic identity, timing, and HMAC verification. It does not write registry
 * state; the broker adapter remains the single projection writer.
 */
export declare function admitYeonjangMqttV2Observation(input: {
    readonly topic: string;
    readonly payload: Uint8Array;
    readonly retained: boolean;
    readonly nowMs: number;
    readonly hmacKey: Uint8Array;
}): YeonjangMqttV2ObservationAdmissionResult;
/**
 * Derives the protocol HMAC key from the leased broker secret. Callers retain
 * ownership of the input lease and must clear it at their secure boundary.
 */
export declare function deriveYeonjangMqttV2HmacKey(secret: Uint8Array): Buffer;
/**
 * Builds one signed command from identities already owned by the canonical
 * operation. This adapter never generates or reconstructs those identities.
 */
export declare function createYeonjangMqttV2Command(input: {
    readonly enrollment: YeonjangMqttV2Enrollment;
    readonly targetFingerprint: string;
    readonly method: YeonjangMqttV2CommandMethod;
    readonly params: Readonly<Record<string, unknown>>;
    readonly identity: YeonjangMqttV2CommandIdentity;
    readonly issuedAt: number;
    readonly expiresAt: number;
    readonly sequence: number;
    readonly hmacKey: Uint8Array;
}): {
    readonly topic: string;
    readonly envelope: YeonjangMqttV2CommandEnvelope;
};
//# sourceMappingURL=mqtt-v2-contract.d.ts.map