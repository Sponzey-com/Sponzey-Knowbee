import { createHash, createHmac, timingSafeEqual } from "node:crypto";
const MAX_IDENTIFIER_BYTES = 64;
const MAX_SECRET_BYTES = 4_096;
const MQTT_V2_HMAC_DOMAIN = Buffer.from("knowbee.yeonjang.mqtt-v2-hmac-key\0", "utf8");
/**
 * Converts a canonical opaque identity at the external DTO boundary only when
 * the producer's 64-byte topic/envelope grammar cannot carry it verbatim.
 * The mapping is stable and cryptographic; it never interprets prose.
 */
export function mapYeonjangMqttV2WireIdentity(label, canonical) {
    if (isMqttV2Identifier(canonical))
        return canonical;
    if (!/^[a-z][a-z0-9_-]{0,15}$/u.test(label) || !canonical.trim()) {
        throw new Error("yeonjang_v2_wire_identity_invalid");
    }
    const digestLength = MAX_IDENTIFIER_BYTES - Buffer.byteLength(label, "utf8") - 1;
    return `${label}-${createHash("sha256").update(canonical, "utf8").digest("hex").slice(0, digestLength)}`;
}
/**
 * Validates the public v2 topic identity without consulting aliases, broker
 * credentials, or legacy v1 routes. The Rust producer applies the same
 * lowercase identifier grammar and 64-byte bound.
 */
export function parseYeonjangMqttV2Enrollment(value) {
    if (!isMqttV2Identifier(value.instanceId)
        || !isMqttV2Identifier(value.sessionId)
        || !isMqttV2Identifier(value.requesterId)) {
        return { ok: false, reasonCode: "yeonjang_v2_enrollment_invalid" };
    }
    return {
        ok: true,
        enrollment: {
            instanceId: value.instanceId,
            sessionId: value.sessionId,
            requesterId: value.requesterId,
        },
    };
}
/** Builds the exact topic set owned by one enrolled requester. */
export function buildYeonjangMqttV2Topics(value) {
    const parsed = parseYeonjangMqttV2Enrollment(value);
    if (!parsed.ok)
        throw new Error(parsed.reasonCode);
    const { instanceId, sessionId, requesterId } = parsed.enrollment;
    const sessionBase = `yeonjang/v2/instances/${instanceId}/sessions/${sessionId}`;
    const requesterBase = `${sessionBase}/requesters/${requesterId}`;
    return {
        commandTopic: `${requesterBase}/command`,
        controlTopic: `${requesterBase}/control`,
        adminTopic: `${requesterBase}/admin`,
        responseTopic: `${requesterBase}/response`,
        eventTopic: `${requesterBase}/event`,
        statusTopic: `${sessionBase}/status`,
        capabilitiesTopic: `${sessionBase}/capabilities`,
        artifactChunkFilter: `${requesterBase}/artifact/+/chunk`,
    };
}
/** Parses only the retained instance-session read projection namespace. */
export function parseYeonjangMqttV2ObservationTopic(topic) {
    const segments = topic.split("/");
    if (segments.length !== 7
        || segments[0] !== "yeonjang"
        || segments[1] !== "v2"
        || segments[2] !== "instances"
        || segments[4] !== "sessions"
        || (segments[6] !== "status" && segments[6] !== "capabilities"))
        return null;
    const instanceId = segments[3];
    const sessionId = segments[5];
    if (!instanceId || !sessionId || !isMqttV2Identifier(instanceId) || !isMqttV2Identifier(sessionId)) {
        return null;
    }
    return { instanceId, sessionId, kind: segments[6] };
}
/**
 * Admits a retained v2 liveness projection only after strict shape, exact
 * topic identity, timing, and HMAC verification. It does not write registry
 * state; the broker adapter remains the single projection writer.
 */
export function admitYeonjangMqttV2Observation(input) {
    const topic = parseYeonjangMqttV2ObservationTopic(input.topic);
    if (!topic)
        return { ok: false, reasonCode: "yeonjang_v2_observation_topic_invalid" };
    if (!input.retained)
        return { ok: false, reasonCode: "yeonjang_v2_observation_non_retained" };
    if (input.payload.byteLength < 1
        || input.payload.byteLength > 65_536
        || !Number.isSafeInteger(input.nowMs)
        || input.hmacKey.byteLength < 16
        || input.hmacKey.byteLength > MAX_SECRET_BYTES)
        return { ok: false, reasonCode: "yeonjang_v2_observation_payload_invalid" };
    let value;
    const text = Buffer.from(input.payload).toString("utf8");
    try {
        value = JSON.parse(text);
    }
    catch {
        return { ok: false, reasonCode: "yeonjang_v2_observation_payload_invalid" };
    }
    if (topic.kind === "capabilities") {
        return admitCapabilitiesObservation({ topic, value, nowMs: input.nowMs, hmacKey: input.hmacKey });
    }
    const envelope = parseStatusEnvelope(value, text.match(/"expires_at"\s*:\s*9223372036854775807/gu)?.length === 1);
    if (!envelope)
        return { ok: false, reasonCode: "yeonjang_v2_observation_payload_invalid" };
    if (envelope.target_instance_id !== topic.instanceId
        || envelope.target_session_id !== topic.sessionId)
        return { ok: false, reasonCode: "yeonjang_v2_observation_identity_mismatch" };
    if (envelope.observed_at > input.nowMs
        || (envelope.payload.state === "online" && (envelope.expires_at <= input.nowMs
            || envelope.expires_at <= envelope.observed_at
            || envelope.expires_at - envelope.observed_at > 5 * 60_000)))
        return { ok: false, reasonCode: "yeonjang_v2_observation_expired" };
    const expected = createHmac("sha256", input.hmacKey)
        .update(statusAuthorizationSigningBytes(envelope))
        .digest();
    const observed = Buffer.from(envelope.authorization.signature, "hex");
    if (observed.length !== expected.length || !timingSafeEqual(observed, expected)) {
        return { ok: false, reasonCode: "yeonjang_v2_observation_signature_rejected" };
    }
    return {
        ok: true,
        observation: {
            kind: "status",
            instanceId: envelope.target_instance_id,
            sessionId: envelope.target_session_id,
            targetFingerprint: envelope.target_fingerprint,
            state: envelope.payload.state,
            observedAt: envelope.observed_at,
            expiresAt: envelope.payload.state === "offline" ? null : envelope.expires_at,
            sequence: envelope.sequence,
        },
    };
}
function admitCapabilitiesObservation(input) {
    const envelope = parseCapabilitiesEnvelope(input.value);
    if (!envelope)
        return { ok: false, reasonCode: "yeonjang_v2_observation_payload_invalid" };
    if (envelope.target_instance_id !== input.topic.instanceId
        || envelope.target_session_id !== input.topic.sessionId)
        return { ok: false, reasonCode: "yeonjang_v2_observation_identity_mismatch" };
    if (envelope.observed_at > input.nowMs
        || envelope.expires_at <= input.nowMs
        || envelope.expires_at <= envelope.observed_at
        || envelope.expires_at - envelope.observed_at > 5 * 60_000)
        return { ok: false, reasonCode: "yeonjang_v2_observation_expired" };
    const expected = createHmac("sha256", input.hmacKey)
        .update(capabilitiesAuthorizationSigningBytes(envelope))
        .digest();
    const observed = Buffer.from(envelope.authorization.signature, "hex");
    if (observed.length !== expected.length || !timingSafeEqual(observed, expected)) {
        return { ok: false, reasonCode: "yeonjang_v2_observation_signature_rejected" };
    }
    return {
        ok: true,
        observation: {
            kind: "capabilities",
            instanceId: envelope.target_instance_id,
            sessionId: envelope.target_session_id,
            targetFingerprint: envelope.target_fingerprint,
            platform: envelope.payload.targetPlatform,
            policyRevision: envelope.payload.policyRevision,
            advertisedMethods: envelope.payload.advertisedMethods,
            capabilities: envelope.payload.capabilities.map(({ policyResource: _policyResource, ...row }) => row),
            observedAt: envelope.observed_at,
            expiresAt: envelope.expires_at,
            sequence: envelope.sequence,
        },
    };
}
function parseCapabilitiesEnvelope(value) {
    if (!isRecord(value) || !hasExactKeys(value, [
        "protocol_version", "schema_id", "message_kind", "message_id",
        "target_instance_id", "target_session_id", "target_fingerprint",
        "observed_at", "expires_at", "sequence", "payload", "authorization",
    ]) || !isRecord(value.payload) || !hasExactKeys(value.payload, [
        "targetPlatform", "policyRevision", "advertisedMethods", "capabilities",
    ]) || !isRecord(value.authorization) || !hasExactKeys(value.authorization, [
        "schema_version", "issuer", "key_id", "audience", "scope", "nonce", "signature",
    ]))
        return null;
    const payload = value.payload;
    const authorization = value.authorization;
    if (value.protocol_version !== 2
        || value.schema_id !== "yeonjang.capabilities.v2"
        || value.message_kind !== "capabilities"
        || typeof value.message_id !== "string" || !isMqttV2Identifier(value.message_id)
        || typeof value.target_instance_id !== "string" || !isMqttV2Identifier(value.target_instance_id)
        || typeof value.target_session_id !== "string" || !isMqttV2Identifier(value.target_session_id)
        || typeof value.target_fingerprint !== "string" || !isSha256Fingerprint(value.target_fingerprint)
        || !Number.isSafeInteger(value.observed_at) || Number(value.observed_at) <= 0
        || !Number.isSafeInteger(value.expires_at)
        || !Number.isSafeInteger(value.sequence) || Number(value.sequence) < 1
        || !["macos", "windows", "linux", "android", "ios"].includes(String(payload.targetPlatform))
        || !Number.isSafeInteger(payload.policyRevision) || Number(payload.policyRevision) < 0
        || !Array.isArray(payload.advertisedMethods)
        || !Array.isArray(payload.capabilities) || payload.capabilities.length !== 2
        || authorization.schema_version !== 1
        || authorization.issuer !== value.target_instance_id
        || authorization.audience !== value.target_session_id
        || authorization.scope !== "capabilities.publish"
        || typeof authorization.key_id !== "string" || !isMqttV2Identifier(authorization.key_id)
        || typeof authorization.nonce !== "string" || !isMqttV2Identifier(authorization.nonce)
        || typeof authorization.signature !== "string" || !isLowerHexDigest(authorization.signature))
        return null;
    const rows = payload.capabilities.map(parseCapabilityRow);
    if (rows.some((row) => row === null))
        return null;
    const typedRows = rows;
    if (typedRows[0]?.method !== "camera.capture" || typedRows[1]?.method !== "screen.capture")
        return null;
    const executable = typedRows.filter((row) => row.implementationStatus === "executable").map((row) => row.method);
    if (payload.advertisedMethods.length !== executable.length
        || payload.advertisedMethods.some((method, index) => method !== executable[index]))
        return null;
    return value;
}
function parseCapabilityRow(value) {
    if (!isRecord(value))
        return null;
    const required = [
        "method", "resource", "implementationStatus", "platformAvailable", "localPolicy",
        "policyResource", "authorizationScope", "cancellable", "postCheckRequired", "artifactDelivery",
    ];
    const keys = Object.keys(value);
    if (!hasExactKeys(value, value.knownLimitation === undefined ? required : [...required, "knownLimitation"]))
        return null;
    if (!isRecord(value.policyResource) || !hasExactKeys(value.policyResource, ["kind"]))
        return null;
    if (!["camera.capture", "screen.capture"].includes(String(value.method))
        || !["camera", "screen"].includes(String(value.resource))
        || !["executable", "unavailable", "contract_only"].includes(String(value.implementationStatus))
        || typeof value.platformAvailable !== "boolean"
        || !["allowed", "denied"].includes(String(value.localPolicy))
        || !["any", "exact_camera", "exact_display"].includes(String(value.policyResource.kind))
        || value.authorizationScope !== "effect.execute"
        || value.cancellable !== true
        || value.postCheckRequired !== true
        || value.artifactDelivery !== "mqtt.fetch_ack"
        || (value.knownLimitation !== undefined && (typeof value.knownLimitation !== "string" || !isBoundedText(value.knownLimitation)))
        || value.platformAvailable !== (value.implementationStatus === "executable"))
        return null;
    void keys;
    return value;
}
function capabilitiesAuthorizationSigningBytes(envelope) {
    const chunks = [];
    appendBytes(chunks, "domain", Buffer.from("yeonjang.capabilities.authorization.v2"));
    appendBytes(chunks, "payload_sha256", createHash("sha256").update(JSON.stringify(envelope.payload)).digest());
    for (const [name, value] of [
        ["schema_id", envelope.schema_id], ["message_kind", envelope.message_kind],
        ["message_id", envelope.message_id], ["target_instance_id", envelope.target_instance_id],
        ["target_session_id", envelope.target_session_id], ["target_fingerprint", envelope.target_fingerprint],
        ["authorization_issuer", envelope.authorization.issuer], ["authorization_key_id", envelope.authorization.key_id],
        ["authorization_audience", envelope.authorization.audience], ["authorization_scope", envelope.authorization.scope],
        ["authorization_nonce", envelope.authorization.nonce],
    ])
        appendText(chunks, name, value);
    appendBytes(chunks, "protocol_version", u16(envelope.protocol_version));
    appendI64(chunks, "observed_at", envelope.observed_at);
    appendI64(chunks, "expires_at", envelope.expires_at);
    appendU64(chunks, "sequence", envelope.sequence);
    return Buffer.concat(chunks);
}
function parseStatusEnvelope(value, offlineI64Max) {
    if (!isRecord(value) || !hasExactKeys(value, [
        "protocol_version", "schema_id", "message_kind", "message_id",
        "target_instance_id", "target_session_id", "target_fingerprint",
        "observed_at", "expires_at", "sequence", "payload", "authorization",
    ]))
        return null;
    if (!isRecord(value.payload) || !((hasExactKeys(value.payload, ["state"]) && value.payload.state === "online")
        || (hasExactKeys(value.payload, ["state", "reason"])
            && value.payload.state === "offline"
            && (value.payload.reason === "unexpected_disconnect" || value.payload.reason === "graceful_shutdown")))) {
        return null;
    }
    if (!isRecord(value.authorization) || !hasExactKeys(value.authorization, [
        "schema_version", "issuer", "key_id", "audience", "scope", "nonce", "signature",
    ]))
        return null;
    const authorization = value.authorization;
    if (value.protocol_version !== 2
        || value.schema_id !== "yeonjang.status.v2"
        || value.message_kind !== "status"
        || typeof value.message_id !== "string"
        || !isMqttV2Identifier(value.message_id)
        || typeof value.target_instance_id !== "string"
        || !isMqttV2Identifier(value.target_instance_id)
        || typeof value.target_session_id !== "string"
        || !isMqttV2Identifier(value.target_session_id)
        || typeof value.target_fingerprint !== "string"
        || !isSha256Fingerprint(value.target_fingerprint)
        || !Number.isSafeInteger(value.observed_at)
        || Number(value.observed_at) <= 0
        || (value.payload.state === "online" ? !Number.isSafeInteger(value.expires_at) : !offlineI64Max)
        || !Number.isSafeInteger(value.sequence)
        || Number(value.sequence) < 1
        || authorization.schema_version !== 1
        || authorization.issuer !== value.target_instance_id
        || authorization.audience !== value.target_session_id
        || authorization.scope !== "status.publish"
        || typeof authorization.key_id !== "string"
        || !isMqttV2Identifier(authorization.key_id)
        || typeof authorization.nonce !== "string"
        || !isMqttV2Identifier(authorization.nonce)
        || typeof authorization.signature !== "string"
        || !isLowerHexDigest(authorization.signature))
        return null;
    return value;
}
function statusAuthorizationSigningBytes(envelope) {
    const chunks = [];
    appendBytes(chunks, "domain", Buffer.from("yeonjang.status.authorization.v2"));
    appendBytes(chunks, "payload_sha256", createHash("sha256").update(JSON.stringify(envelope.payload)).digest());
    for (const [name, value] of [
        ["schema_id", envelope.schema_id],
        ["message_kind", envelope.message_kind],
        ["message_id", envelope.message_id],
        ["target_instance_id", envelope.target_instance_id],
        ["target_session_id", envelope.target_session_id],
        ["target_fingerprint", envelope.target_fingerprint],
        ["authorization_issuer", envelope.authorization.issuer],
        ["authorization_key_id", envelope.authorization.key_id],
        ["authorization_audience", envelope.authorization.audience],
        ["authorization_scope", envelope.authorization.scope],
        ["authorization_nonce", envelope.authorization.nonce],
    ])
        appendText(chunks, name, value);
    appendBytes(chunks, "protocol_version", u16(envelope.protocol_version));
    appendI64(chunks, "observed_at", envelope.observed_at);
    appendI64(chunks, "expires_at", envelope.payload.state === "offline" ? 9223372036854775807n : envelope.expires_at);
    appendU64(chunks, "sequence", envelope.sequence);
    return Buffer.concat(chunks);
}
/**
 * Derives the protocol HMAC key from the leased broker secret. Callers retain
 * ownership of the input lease and must clear it at their secure boundary.
 */
export function deriveYeonjangMqttV2HmacKey(secret) {
    if (secret.byteLength < 1 || secret.byteLength > MAX_SECRET_BYTES) {
        throw new Error("yeonjang_v2_broker_secret_invalid");
    }
    const length = Buffer.alloc(8);
    length.writeBigUInt64BE(BigInt(secret.byteLength));
    return createHash("sha256")
        .update(MQTT_V2_HMAC_DOMAIN)
        .update(length)
        .update(secret)
        .digest();
}
/**
 * Builds one signed command from identities already owned by the canonical
 * operation. This adapter never generates or reconstructs those identities.
 */
export function createYeonjangMqttV2Command(input) {
    const parsedEnrollment = parseYeonjangMqttV2Enrollment(input.enrollment);
    const identities = [
        input.identity.messageId,
        input.identity.requestId,
        input.identity.commandId,
        input.identity.operationId,
        input.identity.correlationId,
        input.identity.causationId,
        input.identity.idempotencyKey,
        input.identity.cancellationId,
        input.identity.authorizationId,
        input.identity.nonce,
    ];
    if (!parsedEnrollment.ok
        || !isSha256Fingerprint(input.targetFingerprint)
        || !identities.every(isMqttV2Identifier)
        || !isBoundedText(input.identity.cancelToken)
        || !Number.isSafeInteger(input.issuedAt)
        || input.issuedAt < 0
        || !Number.isSafeInteger(input.expiresAt)
        || input.expiresAt <= input.issuedAt
        || !Number.isSafeInteger(input.sequence)
        || input.sequence < 1
        || input.hmacKey.byteLength < 16
        || input.hmacKey.byteLength > MAX_SECRET_BYTES
        || !isValidCommandParams(input.method, input.params)) {
        throw new Error("yeonjang_v2_command_invalid");
    }
    const enrollment = parsedEnrollment.enrollment;
    const resource = input.method === "camera.capture" ? "camera" : "screen";
    const unsigned = {
        protocol_version: 2,
        schema_id: "yeonjang.command.v2",
        message_kind: "command",
        message_id: input.identity.messageId,
        request_id: input.identity.requestId,
        command_id: input.identity.commandId,
        operation_id: input.identity.operationId,
        correlation_id: input.identity.correlationId,
        causation_id: input.identity.causationId,
        requester_id: enrollment.requesterId,
        target_instance_id: enrollment.instanceId,
        target_session_id: enrollment.sessionId,
        target_fingerprint: input.targetFingerprint,
        idempotency_key: input.identity.idempotencyKey,
        cancellation_id: input.identity.cancellationId,
        cancel_token: input.identity.cancelToken,
        issued_at: input.issuedAt,
        expires_at: input.expiresAt,
        sequence: input.sequence,
        payload: { method: input.method, params: { ...input.params } },
        authorization: {
            schema_version: 1,
            authorization_id: input.identity.authorizationId,
            issuer: enrollment.requesterId,
            key_id: "requester-hmac-v2",
            audience: enrollment.instanceId,
            scope: "effect.execute",
            method: input.method,
            resource,
            requester_id: enrollment.requesterId,
            command_id: input.identity.commandId,
            operation_id: input.identity.operationId,
            target_instance_id: enrollment.instanceId,
            target_session_id: enrollment.sessionId,
            target_fingerprint: input.targetFingerprint,
            idempotency_key: input.identity.idempotencyKey,
            cancellation_id: input.identity.cancellationId,
            cancel_token: input.identity.cancelToken,
            expires_at: input.expiresAt,
            nonce: input.identity.nonce,
            signature: "",
        },
    };
    const signature = createHmac("sha256", input.hmacKey)
        .update(commandAuthorizationSigningBytes(unsigned))
        .digest("hex");
    const envelope = {
        ...unsigned,
        authorization: { ...unsigned.authorization, signature },
    };
    return {
        topic: buildYeonjangMqttV2Topics(enrollment).commandTopic,
        envelope,
    };
}
function commandAuthorizationSigningBytes(envelope) {
    const chunks = [];
    appendText(chunks, "domain", "yeonjang.command.authorization.v2");
    appendU64(chunks, "protocol_version", envelope.protocol_version);
    appendText(chunks, "schema_id", envelope.schema_id);
    appendText(chunks, "message_kind", envelope.message_kind);
    appendText(chunks, "method", envelope.payload.method);
    appendBytes(chunks, "payload_sha256", commandPayloadDigest(envelope.payload));
    for (const [name, value] of [
        ["message_id", envelope.message_id],
        ["request_id", envelope.request_id],
        ["command_id", envelope.command_id],
        ["operation_id", envelope.operation_id],
        ["correlation_id", envelope.correlation_id],
        ["causation_id", envelope.causation_id],
        ["requester_id", envelope.requester_id],
        ["target_instance_id", envelope.target_instance_id],
        ["target_session_id", envelope.target_session_id],
        ["target_fingerprint", envelope.target_fingerprint],
        ["idempotency_key", envelope.idempotency_key],
        ["cancellation_id", envelope.cancellation_id],
        ["cancel_token", envelope.cancel_token],
    ])
        appendText(chunks, name, value);
    appendI64(chunks, "issued_at", envelope.issued_at);
    appendI64(chunks, "expires_at", envelope.expires_at);
    appendU64(chunks, "sequence", envelope.sequence);
    const authorization = envelope.authorization;
    appendU64(chunks, "authorization_schema_version", authorization.schema_version);
    for (const [name, value] of [
        ["authorization_id", authorization.authorization_id],
        ["authorization_issuer", authorization.issuer],
        ["authorization_key_id", authorization.key_id],
        ["authorization_audience", authorization.audience],
        ["authorization_scope", authorization.scope],
        ["authorization_method", authorization.method],
        ["authorization_resource", authorization.resource],
        ["authorization_requester_id", authorization.requester_id],
        ["authorization_command_id", authorization.command_id],
        ["authorization_operation_id", authorization.operation_id],
        ["authorization_target_instance_id", authorization.target_instance_id],
        ["authorization_target_session_id", authorization.target_session_id],
        ["authorization_target_fingerprint", authorization.target_fingerprint],
        ["authorization_idempotency_key", authorization.idempotency_key],
        ["authorization_cancellation_id", authorization.cancellation_id],
        ["authorization_cancel_token", authorization.cancel_token],
    ])
        appendText(chunks, name, value);
    appendI64(chunks, "authorization_expires_at", authorization.expires_at);
    appendText(chunks, "authorization_nonce", authorization.nonce);
    return Buffer.concat(chunks);
}
function commandPayloadDigest(payload) {
    const chunks = [];
    appendText(chunks, "method", payload.method);
    if (payload.method === "camera.capture") {
        appendOptionalText(chunks, "device_id", payload.params.device_id);
        appendOptionalU64(chunks, "capture_timeout_ms", payload.params.capture_timeout_ms);
    }
    else {
        appendOptionalU64(chunks, "display", payload.params.display);
    }
    return createHash("sha256").update(Buffer.concat(chunks)).digest();
}
function isValidCommandParams(method, params) {
    const allowed = method === "camera.capture"
        ? new Set(["device_id", "capture_timeout_ms"])
        : new Set(["display"]);
    if (Object.keys(params).some((key) => !allowed.has(key)))
        return false;
    if (method === "camera.capture") {
        const device = params.device_id;
        const timeout = params.capture_timeout_ms;
        return (device === undefined || (typeof device === "string" && isBoundedText(device)))
            && (timeout === undefined || (Number.isSafeInteger(timeout) && Number(timeout) >= 1 && Number(timeout) <= 60_000));
    }
    const display = params.display;
    return display === undefined
        || (Number.isSafeInteger(display) && Number(display) >= 0 && Number(display) <= 0xffff_ffff);
}
function appendText(output, name, value) {
    appendBytes(output, name, Buffer.from(value, "utf8"));
}
function appendBytes(output, name, value) {
    const nameBytes = Buffer.from(name, "utf8");
    output.push(u64(nameBytes.length), nameBytes, u64(value.byteLength), Buffer.from(value));
}
function appendU64(output, name, value) {
    appendBytes(output, name, u64(value));
}
function appendI64(output, name, value) {
    const bytes = Buffer.alloc(8);
    bytes.writeBigInt64BE(BigInt(value));
    appendBytes(output, name, bytes);
}
function appendOptionalText(output, name, value) {
    appendBytes(output, `${name}_present`, Buffer.from([value === undefined ? 0 : 1]));
    if (typeof value === "string")
        appendText(output, name, value);
}
function appendOptionalU64(output, name, value) {
    appendBytes(output, `${name}_present`, Buffer.from([value === undefined ? 0 : 1]));
    if (typeof value === "number")
        appendU64(output, name, value);
}
function u64(value) {
    const bytes = Buffer.alloc(8);
    bytes.writeBigUInt64BE(BigInt(value));
    return bytes;
}
function u16(value) {
    const bytes = Buffer.alloc(2);
    bytes.writeUInt16BE(value);
    return bytes;
}
function isSha256Fingerprint(value) {
    if (!value.startsWith("sha256:") || value.length !== 71)
        return false;
    return [...value.slice(7)].every((character) => (character >= "0" && character <= "9") || (character >= "a" && character <= "f"));
}
function isLowerHexDigest(value) {
    return value.length === 64 && [...value].every((character) => (character >= "0" && character <= "9") || (character >= "a" && character <= "f"));
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function hasExactKeys(value, expected) {
    const actual = Object.keys(value).sort();
    const sortedExpected = [...expected].sort();
    return actual.length === sortedExpected.length
        && actual.every((key, index) => key === sortedExpected[index]);
}
function isBoundedText(value) {
    return value.trim().length > 0 && Buffer.byteLength(value, "utf8") <= 256;
}
function isMqttV2Identifier(value) {
    const bytes = Buffer.from(value, "utf8");
    if (bytes.length < 1 || bytes.length > MAX_IDENTIFIER_BYTES)
        return false;
    for (let index = 0; index < bytes.length; index += 1) {
        const byte = bytes[index];
        if (byte === undefined)
            return false;
        const alphanumeric = isLowercaseAlphanumeric(byte);
        if (index === 0 || index === bytes.length - 1) {
            if (!alphanumeric)
                return false;
        }
        else if (!alphanumeric && byte !== 0x2d && byte !== 0x5f) {
            return false;
        }
    }
    return true;
}
function isLowercaseAlphanumeric(byte) {
    return (byte >= 0x61 && byte <= 0x7a) || (byte >= 0x30 && byte <= 0x39);
}
//# sourceMappingURL=mqtt-v2-contract.js.map