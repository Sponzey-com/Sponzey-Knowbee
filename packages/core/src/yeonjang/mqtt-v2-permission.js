import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { buildYeonjangMqttV2Topics, } from "./mqtt-v2-contract.js";
/**
 * Builds the versioned, read-only permission control request accepted by the
 * existing Yeonjang v2 adapter. It intentionally has no device selector or
 * OS prompt parameter, so it cannot become a capture command by accident.
 */
export function createYeonjangMqttV2CapturePermissionQuery(input) {
    validateQueryInput(input);
    const { enrollment, identity } = input;
    const unsigned = {
        protocol_version: 2,
        schema_id: "yeonjang.control.v2",
        message_kind: "control",
        message_id: identity.messageId,
        request_id: identity.requestId,
        command_id: identity.commandId,
        operation_id: identity.operationId,
        correlation_id: identity.correlationId,
        causation_id: identity.causationId,
        requester_id: enrollment.requesterId,
        target_instance_id: enrollment.instanceId,
        target_session_id: enrollment.sessionId,
        target_fingerprint: input.targetFingerprint,
        idempotency_key: identity.idempotencyKey,
        issued_at: input.issuedAt,
        expires_at: input.expiresAt,
        sequence: input.sequence,
        payload: { control: "capture.permission.get", params: {} },
        authorization: {
            schema_version: 1,
            authorization_id: identity.authorizationId,
            issuer: enrollment.requesterId,
            key_id: "requester-hmac-v2",
            audience: enrollment.instanceId,
            scope: "permission.read",
            requester_id: enrollment.requesterId,
            command_id: identity.commandId,
            operation_id: identity.operationId,
            target_instance_id: enrollment.instanceId,
            target_session_id: enrollment.sessionId,
            target_fingerprint: input.targetFingerprint,
            idempotency_key: identity.idempotencyKey,
            expires_at: input.expiresAt,
            nonce: identity.nonce,
            signature: "",
        },
    };
    const envelope = {
        ...unsigned,
        authorization: {
            ...unsigned.authorization,
            signature: createHmac("sha256", input.hmacKey)
                .update(permissionQuerySigningBytes(unsigned))
                .digest("hex"),
        },
    };
    return {
        topic: buildYeonjangMqttV2Topics(enrollment).controlTopic,
        enrollment,
        envelope,
    };
}
/** Verifies the exact response identity and HMAC before projecting OS state. */
export function admitYeonjangMqttV2CapturePermissionResponse(input) {
    if (input.payload.byteLength < 1 || input.payload.byteLength > 65_536 || input.hmacKey.byteLength < 16) {
        return { ok: false, reasonCode: "yeonjang_v2_permission_response_payload_invalid" };
    }
    let value;
    try {
        value = JSON.parse(Buffer.from(input.payload).toString("utf8"));
    }
    catch {
        return { ok: false, reasonCode: "yeonjang_v2_permission_response_payload_invalid" };
    }
    const envelope = parsePermissionResponse(value);
    if (!envelope)
        return { ok: false, reasonCode: "yeonjang_v2_permission_response_payload_invalid" };
    const { expected } = input;
    if (envelope.request_id !== expected.requestId
        || envelope.command_id !== expected.commandId
        || envelope.operation_id !== expected.operationId
        || envelope.idempotency_key !== expected.idempotencyKey
        || envelope.requester_id !== expected.enrollment.requesterId
        || envelope.target_instance_id !== expected.enrollment.instanceId
        || envelope.target_session_id !== expected.enrollment.sessionId
        || envelope.target_fingerprint !== expected.targetFingerprint
        || envelope.authorization.issuer !== expected.enrollment.instanceId
        || envelope.authorization.key_id !== "instance-hmac-v2"
        || envelope.authorization.audience !== expected.enrollment.requesterId
        || envelope.authorization.scope !== "response.publish"
        || envelope.authorization.requester_id !== envelope.requester_id
        || envelope.authorization.request_id !== envelope.request_id
        || envelope.authorization.command_id !== envelope.command_id
        || envelope.authorization.operation_id !== envelope.operation_id
        || envelope.authorization.target_instance_id !== envelope.target_instance_id
        || envelope.authorization.target_session_id !== envelope.target_session_id
        || envelope.authorization.target_fingerprint !== envelope.target_fingerprint
        || envelope.authorization.idempotency_key !== envelope.idempotency_key
        || envelope.authorization.expires_at !== envelope.expires_at)
        return { ok: false, reasonCode: "yeonjang_v2_permission_response_identity_mismatch" };
    if (envelope.issued_at > input.nowMs || envelope.expires_at <= input.nowMs || envelope.expires_at <= envelope.issued_at) {
        return { ok: false, reasonCode: "yeonjang_v2_permission_response_expired" };
    }
    const observed = Buffer.from(envelope.authorization.signature, "hex");
    const expectedSignature = createHmac("sha256", input.hmacKey)
        .update(permissionResponseSigningBytes(envelope))
        .digest();
    if (observed.length !== expectedSignature.length || !timingSafeEqual(observed, expectedSignature)) {
        return { ok: false, reasonCode: "yeonjang_v2_permission_response_signature_rejected" };
    }
    return { ok: true, permission: envelope.payload };
}
function parsePermissionResponse(value) {
    if (!isRecord(value) || !hasExactKeys(value, [
        "protocol_version", "schema_id", "message_kind", "message_id", "request_id", "command_id",
        "operation_id", "correlation_id", "causation_id", "requester_id", "target_instance_id",
        "target_session_id", "target_fingerprint", "idempotency_key", "issued_at", "expires_at",
        "sequence", "payload", "authorization",
    ]))
        return null;
    if (value.protocol_version !== 2
        || value.schema_id !== "yeonjang.capture-permission-response.v2"
        || value.message_kind !== "response"
        || !["message_id", "request_id", "command_id", "operation_id", "correlation_id", "causation_id", "requester_id", "target_instance_id", "target_session_id", "idempotency_key"].every((key) => isIdentifier(value[key]))
        || !isSha256Fingerprint(value.target_fingerprint)
        || !isSafeTimestamp(value.issued_at)
        || !isSafeTimestamp(value.expires_at)
        || !isPositiveSequence(value.sequence))
        return null;
    const permission = parsePermissionPayload(value.payload);
    const authorization = parsePermissionResponseAuthorization(value.authorization);
    if (!permission || !authorization)
        return null;
    return { ...value, payload: permission, authorization };
}
function parsePermissionPayload(value) {
    if (!isRecord(value))
        return null;
    const outcome = value.outcome;
    if (!isPermissionOutcome(outcome))
        return null;
    if (outcome !== "available") {
        return hasExactKeys(value, ["outcome"])
            ? { outcome }
            : null;
    }
    if (!hasExactKeys(value, ["outcome", "policyRevision", "permissions"]))
        return null;
    const policyRevision = value.policyRevision;
    if (typeof policyRevision !== "number" || !Number.isSafeInteger(policyRevision) || policyRevision < 0 || !Array.isArray(value.permissions))
        return null;
    const permissions = value.permissions.map(parsePermissionRow);
    if (permissions.some((row) => row === null) || permissions.length < 1 || permissions.length > 2)
        return null;
    return {
        outcome,
        policyRevision,
        permissions: permissions,
    };
}
function parsePermissionRow(value) {
    if (!isRecord(value) || !hasExactKeys(value, [
        "method", "resource", "settingName", "platformAvailable", "localPolicy", "policyResource", "osPermission",
    ]))
        return null;
    if ((value.method !== "camera.capture" && value.method !== "screen.capture")
        || (value.resource !== "camera" && value.resource !== "screen")
        || (value.settingName !== "allow_camera_access" && value.settingName !== "allow_screen_capture")
        || typeof value.platformAvailable !== "boolean"
        || (value.localPolicy !== "allowed" && value.localPolicy !== "denied")
        || (value.policyResource !== "any" && value.policyResource !== "exact_camera" && value.policyResource !== "exact_display")
        || !isPermissionOsState(value.osPermission))
        return null;
    return {
        method: value.method,
        resource: value.resource,
        settingName: value.settingName,
        platformAvailable: value.platformAvailable,
        localPolicy: value.localPolicy,
        policyResource: value.policyResource,
        osPermission: value.osPermission,
    };
}
function parsePermissionResponseAuthorization(value) {
    if (!isRecord(value) || !hasExactKeys(value, [
        "schema_version", "issuer", "key_id", "audience", "scope", "requester_id", "request_id", "command_id",
        "operation_id", "target_instance_id", "target_session_id", "target_fingerprint", "idempotency_key",
        "expires_at", "nonce", "signature",
    ]))
        return null;
    if (value.schema_version !== 1
        || value.scope !== "response.publish"
        || !["issuer", "key_id", "audience", "requester_id", "request_id", "command_id", "operation_id", "target_instance_id", "target_session_id", "idempotency_key", "nonce"].every((key) => isIdentifier(value[key]))
        || !isSha256Fingerprint(value.target_fingerprint)
        || !isSafeTimestamp(value.expires_at)
        || !isLowerHex(value.signature))
        return null;
    return value;
}
function permissionQuerySigningBytes(envelope) {
    const chunks = [];
    appendText(chunks, "domain", "yeonjang.capture-permission-query.authorization.v2");
    appendU64(chunks, "protocol_version", envelope.protocol_version);
    appendText(chunks, "schema_id", envelope.schema_id);
    appendText(chunks, "message_kind", envelope.message_kind);
    appendText(chunks, "control", envelope.payload.control);
    for (const [name, value] of [
        ["message_id", envelope.message_id], ["request_id", envelope.request_id], ["command_id", envelope.command_id],
        ["operation_id", envelope.operation_id], ["correlation_id", envelope.correlation_id], ["causation_id", envelope.causation_id],
        ["requester_id", envelope.requester_id], ["target_instance_id", envelope.target_instance_id], ["target_session_id", envelope.target_session_id],
        ["target_fingerprint", envelope.target_fingerprint], ["idempotency_key", envelope.idempotency_key],
    ])
        appendText(chunks, name, value);
    appendI64(chunks, "issued_at", envelope.issued_at);
    appendI64(chunks, "expires_at", envelope.expires_at);
    appendU64(chunks, "sequence", envelope.sequence);
    appendU64(chunks, "authorization_schema_version", envelope.authorization.schema_version);
    for (const [name, value] of [
        ["authorization_id", envelope.authorization.authorization_id], ["authorization_issuer", envelope.authorization.issuer],
        ["authorization_key_id", envelope.authorization.key_id], ["authorization_audience", envelope.authorization.audience],
        ["authorization_scope", envelope.authorization.scope], ["authorization_requester_id", envelope.authorization.requester_id],
        ["authorization_command_id", envelope.authorization.command_id], ["authorization_operation_id", envelope.authorization.operation_id],
        ["authorization_target_instance_id", envelope.authorization.target_instance_id], ["authorization_target_session_id", envelope.authorization.target_session_id],
        ["authorization_target_fingerprint", envelope.authorization.target_fingerprint], ["authorization_idempotency_key", envelope.authorization.idempotency_key],
    ])
        appendText(chunks, name, value);
    appendI64(chunks, "authorization_expires_at", envelope.authorization.expires_at);
    appendText(chunks, "authorization_nonce", envelope.authorization.nonce);
    return Buffer.concat(chunks);
}
function permissionResponseSigningBytes(envelope) {
    const chunks = [];
    appendText(chunks, "domain", "yeonjang.capture-permission-response.authorization.v2");
    appendBytes(chunks, "payload_sha256", createHash("sha256").update(JSON.stringify(toWirePermissionPayload(envelope.payload))).digest());
    for (const [name, value] of [
        ["schema_id", envelope.schema_id], ["message_kind", envelope.message_kind], ["message_id", envelope.message_id],
        ["request_id", envelope.request_id], ["command_id", envelope.command_id], ["operation_id", envelope.operation_id],
        ["correlation_id", envelope.correlation_id], ["causation_id", envelope.causation_id], ["requester_id", envelope.requester_id],
        ["target_instance_id", envelope.target_instance_id], ["target_session_id", envelope.target_session_id], ["target_fingerprint", envelope.target_fingerprint],
        ["idempotency_key", envelope.idempotency_key], ["authorization_issuer", envelope.authorization.issuer], ["authorization_key_id", envelope.authorization.key_id],
        ["authorization_audience", envelope.authorization.audience], ["authorization_scope", envelope.authorization.scope],
        ["authorization_requester_id", envelope.authorization.requester_id], ["authorization_request_id", envelope.authorization.request_id],
        ["authorization_command_id", envelope.authorization.command_id], ["authorization_operation_id", envelope.authorization.operation_id],
        ["authorization_target_instance_id", envelope.authorization.target_instance_id], ["authorization_target_session_id", envelope.authorization.target_session_id],
        ["authorization_target_fingerprint", envelope.authorization.target_fingerprint], ["authorization_idempotency_key", envelope.authorization.idempotency_key],
        ["authorization_nonce", envelope.authorization.nonce],
    ])
        appendText(chunks, name, value);
    appendU64(chunks, "protocol_version", envelope.protocol_version);
    appendU64(chunks, "sequence", envelope.sequence);
    appendU64(chunks, "authorization_schema_version", envelope.authorization.schema_version);
    appendI64(chunks, "issued_at", envelope.issued_at);
    appendI64(chunks, "expires_at", envelope.expires_at);
    appendI64(chunks, "authorization_expires_at", envelope.authorization.expires_at);
    return Buffer.concat(chunks);
}
function toWirePermissionPayload(permission) {
    if (permission.outcome !== "available")
        return { outcome: permission.outcome };
    return {
        outcome: permission.outcome,
        policyRevision: permission.policyRevision,
        permissions: permission.permissions?.map((row) => ({
            method: row.method, resource: row.resource, settingName: row.settingName,
            platformAvailable: row.platformAvailable, localPolicy: row.localPolicy,
            policyResource: row.policyResource, osPermission: row.osPermission,
        })),
    };
}
function validateQueryInput(input) {
    const values = [
        input.enrollment.instanceId, input.enrollment.sessionId, input.enrollment.requesterId,
        input.identity.messageId, input.identity.requestId, input.identity.commandId, input.identity.operationId,
        input.identity.correlationId, input.identity.causationId, input.identity.idempotencyKey,
        input.identity.authorizationId, input.identity.nonce,
    ];
    if (!values.every(isIdentifier) || !isSha256Fingerprint(input.targetFingerprint) || !isSafeTimestamp(input.issuedAt) || !isSafeTimestamp(input.expiresAt) || input.expiresAt <= input.issuedAt || input.expiresAt - input.issuedAt > 300_000 || !isPositiveSequence(input.sequence) || input.hmacKey.byteLength < 16) {
        throw new Error("yeonjang_v2_permission_query_invalid");
    }
}
function appendText(chunks, name, value) { appendBytes(chunks, name, Buffer.from(value, "utf8")); }
function appendU64(chunks, name, value) { const bytes = Buffer.alloc(8); bytes.writeBigUInt64BE(BigInt(value)); appendBytes(chunks, name, bytes); }
function appendI64(chunks, name, value) { const bytes = Buffer.alloc(8); bytes.writeBigInt64BE(BigInt(value)); appendBytes(chunks, name, bytes); }
function appendBytes(chunks, name, value) { const bytes = Buffer.from(name, "utf8"); const nameLength = Buffer.alloc(8); nameLength.writeBigUInt64BE(BigInt(bytes.length)); const valueLength = Buffer.alloc(8); valueLength.writeBigUInt64BE(BigInt(value.byteLength)); chunks.push(nameLength, bytes, valueLength, Buffer.from(value)); }
function isRecord(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
function hasExactKeys(value, keys) { const actual = Object.keys(value); return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
/** Matches the v2 producer identity grammar: lowercase ASCII alphanumeric at both ends. */
function isIdentifier(value) { return typeof value === "string" && /^[a-z0-9][a-z0-9_-]{0,63}$/u.test(value); }
function isSha256Fingerprint(value) { return typeof value === "string" && /^sha256:[0-9a-f]{64}$/u.test(value); }
function isLowerHex(value) { return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value); }
function isSafeTimestamp(value) { return typeof value === "number" && Number.isSafeInteger(value) && value > 0; }
function isPositiveSequence(value) { return typeof value === "number" && Number.isSafeInteger(value) && value > 0; }
function isPermissionOutcome(value) { return value === "available" || value === "binding_mismatch" || value === "policy_unavailable" || value === "observation_unavailable"; }
function isPermissionOsState(value) { return value === "not_observed" || value === "not_required" || value === "granted" || value === "not_determined" || value === "denied" || value === "restricted"; }
//# sourceMappingURL=mqtt-v2-permission.js.map