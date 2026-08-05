import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { buildYeonjangMqttV2Topics } from "./mqtt-v2-contract.js";
/** Builds one signed artifact lifecycle control from an admitted terminal. */
export function createYeonjangMqttV2ArtifactControl(input) {
    const chunkPayloadBytes = input.kind === "fetch" ? 262_144 : null;
    const fullDigest = input.kind === "ack" ? input.descriptor.fullDigest : null;
    const payload = {
        artifact: input.kind === "fetch"
            ? "artifact.fetch"
            : input.kind === "ack"
                ? "artifact.ack"
                : "artifact.cancel",
        params: input.kind === "fetch"
            ? { artifact_ref: input.descriptor.artifactRef, owner_request_id: input.ownerRequestId, owner_operation_id: input.ownerOperationId, expected_revision: input.expectedRevision, transfer_id: input.transferId, chunk_payload_bytes: chunkPayloadBytes }
            : input.kind === "ack"
                ? { artifact_ref: input.descriptor.artifactRef, owner_request_id: input.ownerRequestId, owner_operation_id: input.ownerOperationId, expected_revision: input.expectedRevision, transfer_id: input.transferId, full_digest: input.descriptor.fullDigest }
                : { artifact_ref: input.descriptor.artifactRef, owner_request_id: input.ownerRequestId, owner_operation_id: input.ownerOperationId, expected_revision: input.expectedRevision, transfer_id: input.transferId },
    };
    const authorization = {
        schema_version: 1,
        authorization_id: input.identity.authorizationId,
        issuer: input.enrollment.requesterId,
        key_id: "requester-hmac-v2",
        audience: input.enrollment.instanceId,
        scope: input.kind === "cancel" ? "artifact.cancel" : "artifact.read",
        requester_id: input.enrollment.requesterId,
        command_id: input.identity.commandId,
        operation_id: input.identity.operationId,
        target_instance_id: input.enrollment.instanceId,
        target_session_id: input.enrollment.sessionId,
        target_fingerprint: input.targetFingerprint,
        idempotency_key: input.identity.idempotencyKey,
        artifact_ref: input.descriptor.artifactRef,
        owner_request_id: input.ownerRequestId,
        owner_operation_id: input.ownerOperationId,
        transfer_id: input.transferId,
        expected_revision: input.expectedRevision,
        full_digest: fullDigest,
        chunk_payload_bytes: chunkPayloadBytes,
        expires_at: input.expiresAt,
        nonce: input.identity.nonce,
        signature: "",
    };
    const envelope = {
        protocol_version: 2, schema_id: "yeonjang.artifact-control.v2", message_kind: "control",
        message_id: input.identity.messageId, request_id: input.identity.requestId,
        command_id: input.identity.commandId, operation_id: input.identity.operationId,
        correlation_id: input.identity.correlationId, causation_id: input.identity.causationId,
        requester_id: input.enrollment.requesterId, target_instance_id: input.enrollment.instanceId,
        target_session_id: input.enrollment.sessionId, target_fingerprint: input.targetFingerprint,
        idempotency_key: input.identity.idempotencyKey, issued_at: input.issuedAt,
        expires_at: input.expiresAt, sequence: input.sequence, payload, authorization,
    };
    validateArtifactControl(envelope, input.hmacKey);
    const signature = createHmac("sha256", input.hmacKey).update(artifactSigningBytes(envelope)).digest("hex");
    const signed = { ...envelope, authorization: { ...authorization, signature } };
    const topics = buildYeonjangMqttV2Topics(input.enrollment);
    return {
        topic: input.kind === "ack"
            ? `${topics.controlTopic.slice(0, -"control".length)}artifact/${input.transferId}/ack`
            : topics.controlTopic,
        envelope: signed,
    };
}
function validateArtifactControl(envelope, key) {
    const identities = [envelope.message_id, envelope.request_id, envelope.command_id, envelope.operation_id, envelope.correlation_id, envelope.causation_id, envelope.requester_id, envelope.target_instance_id, envelope.target_session_id, envelope.idempotency_key];
    if (!identities.every((value) => /^[a-z0-9_-]+$/u.test(value) && Buffer.byteLength(value) <= 64)
        || !/^sha256:[0-9a-f]{64}$/u.test(envelope.target_fingerprint)
        || !Number.isSafeInteger(envelope.issued_at) || !Number.isSafeInteger(envelope.expires_at) || envelope.expires_at <= envelope.issued_at
        || !Number.isSafeInteger(envelope.sequence) || envelope.sequence < 1 || key.byteLength < 16) {
        throw new Error("yeonjang_v2_artifact_control_invalid");
    }
}
function artifactSigningBytes(envelope) {
    const payload = envelope.payload;
    const params = payload.params;
    const payloadBytes = [];
    appendField(payloadBytes, "artifact", Buffer.from(payload.artifact));
    for (const name of ["artifact_ref", "owner_request_id", "owner_operation_id", "transfer_id"])
        appendField(payloadBytes, name, Buffer.from(String(params[name])));
    appendField(payloadBytes, "expected_revision", u64(Number(params.expected_revision)));
    appendOptionalText(payloadBytes, "full_digest", typeof params.full_digest === "string" ? params.full_digest : null);
    appendOptionalU32(payloadBytes, "chunk_payload_bytes", typeof params.chunk_payload_bytes === "number" ? params.chunk_payload_bytes : null);
    const payloadDigest = createHash("sha256").update(Buffer.concat(payloadBytes)).digest();
    const auth = envelope.authorization;
    const output = [];
    const values = [
        ["domain", "yeonjang.artifact.authorization.v2"], ["protocol_version", 2], ["schema_id", envelope.schema_id], ["message_kind", envelope.message_kind], ["payload_sha256", payloadDigest],
        ["message_id", envelope.message_id], ["request_id", envelope.request_id], ["command_id", envelope.command_id], ["operation_id", envelope.operation_id], ["correlation_id", envelope.correlation_id], ["causation_id", envelope.causation_id], ["requester_id", envelope.requester_id], ["target_instance_id", envelope.target_instance_id], ["target_session_id", envelope.target_session_id], ["target_fingerprint", envelope.target_fingerprint], ["idempotency_key", envelope.idempotency_key], ["issued_at", envelope.issued_at], ["expires_at", envelope.expires_at], ["sequence", envelope.sequence],
        ["authorization_schema_version", 1], ["authorization_id", String(auth.authorization_id)], ["authorization_issuer", String(auth.issuer)], ["authorization_key_id", String(auth.key_id)], ["authorization_audience", String(auth.audience)], ["authorization_scope", String(auth.scope)], ["authorization_requester_id", String(auth.requester_id)], ["authorization_command_id", String(auth.command_id)], ["authorization_operation_id", String(auth.operation_id)], ["authorization_target_instance_id", String(auth.target_instance_id)], ["authorization_target_session_id", String(auth.target_session_id)], ["authorization_target_fingerprint", String(auth.target_fingerprint)], ["authorization_idempotency_key", String(auth.idempotency_key)], ["authorization_artifact_ref", String(auth.artifact_ref)], ["authorization_owner_request_id", String(auth.owner_request_id)], ["authorization_owner_operation_id", String(auth.owner_operation_id)], ["authorization_transfer_id", String(auth.transfer_id)], ["authorization_expected_revision", Number(auth.expected_revision)],
    ];
    for (const [name, value] of values)
        appendField(output, name, Buffer.isBuffer(value) ? value : typeof value === "number" ? u64(value) : Buffer.from(value));
    appendOptionalText(output, "authorization_full_digest", typeof auth.full_digest === "string" ? auth.full_digest : null);
    appendOptionalU32(output, "authorization_chunk_payload_bytes", typeof auth.chunk_payload_bytes === "number" ? auth.chunk_payload_bytes : null);
    appendField(output, "authorization_expires_at", u64(Number(auth.expires_at)));
    appendField(output, "authorization_nonce", Buffer.from(String(auth.nonce)));
    return Buffer.concat(output);
}
function appendOptionalText(output, name, value) {
    // Rust protocol_v2_artifact signs optional-presence as an unsigned 64-bit
    // field, not as a single byte. Keeping this exact wire representation is
    // required for Yeonjang to admit Gateway artifact.fetch controls.
    appendField(output, `${name}_present`, u64(value === null ? 0 : 1));
    if (value !== null)
        appendField(output, name, Buffer.from(value));
}
function appendOptionalU32(output, name, value) {
    appendField(output, `${name}_present`, u64(value === null ? 0 : 1));
    // The v2 Rust contract encodes optional u32 values in an eight-byte
    // canonical integer field, as it does for expected_revision. A four-byte
    // value here changes the signed payload digest even though JSON is valid.
    if (value !== null)
        appendField(output, name, u64(value));
}
function appendField(output, name, value) {
    const key = Buffer.from(name);
    output.push(u64(key.length), key, u64(value.length), value);
}
function u64(value) {
    const bytes = Buffer.alloc(8);
    bytes.writeBigUInt64BE(BigInt(value));
    return bytes;
}
/**
 * Admits only an authenticated rejection for the exact fetch control already
 * published by this requester. Structural or authorization failures never
 * become lifecycle truth and artifact bytes are never included in this DTO.
 */
export function admitYeonjangMqttV2ArtifactFetchRejection(input) {
    if (input.payload.byteLength < 1 || input.payload.byteLength > 65_536 || input.hmacKey.byteLength < 16) {
        return { ok: false, reasonCode: "yeonjang_v2_artifact_fetch_payload_invalid" };
    }
    let value;
    try {
        value = JSON.parse(Buffer.from(input.payload).toString("utf8"));
    }
    catch {
        return { ok: false, reasonCode: "yeonjang_v2_artifact_fetch_payload_invalid" };
    }
    const envelope = parseArtifactFetchRejection(value);
    if (!envelope)
        return { ok: false, reasonCode: "yeonjang_v2_artifact_fetch_payload_invalid" };
    const expected = input.expected;
    const auth = envelope.authorization;
    const content = envelope.payload;
    if (envelope.request_id !== expected.requestId
        || envelope.command_id !== expected.commandId
        || envelope.operation_id !== expected.operationId
        || envelope.correlation_id !== expected.correlationId
        || envelope.causation_id !== expected.messageId
        || envelope.idempotency_key !== expected.idempotencyKey
        || envelope.requester_id !== expected.enrollment.requesterId
        || envelope.target_instance_id !== expected.enrollment.instanceId
        || envelope.target_session_id !== expected.enrollment.sessionId
        || envelope.target_fingerprint !== expected.targetFingerprint
        || content.artifact_ref !== expected.artifactRef
        || content.owner_request_id !== expected.ownerRequestId
        || content.owner_operation_id !== expected.ownerOperationId
        || content.transfer_id !== expected.transferId
        || content.observed_revision !== expected.expectedRevision
        || auth.issuer !== envelope.target_instance_id
        || auth.audience !== envelope.requester_id
        || auth.requester_id !== envelope.requester_id
        || auth.request_id !== envelope.request_id
        || auth.command_id !== envelope.command_id
        || auth.operation_id !== envelope.operation_id
        || auth.target_instance_id !== envelope.target_instance_id
        || auth.target_session_id !== envelope.target_session_id
        || auth.target_fingerprint !== envelope.target_fingerprint
        || auth.idempotency_key !== envelope.idempotency_key
        || auth.expires_at !== envelope.expires_at)
        return { ok: false, reasonCode: "yeonjang_v2_artifact_fetch_identity_mismatch" };
    if (envelope.issued_at > input.nowMs
        || envelope.expires_at <= input.nowMs
        || envelope.expires_at <= envelope.issued_at)
        return { ok: false, reasonCode: "yeonjang_v2_artifact_fetch_expired" };
    const payloadDigest = createHash("sha256").update(JSON.stringify(envelope.payload)).digest();
    const observed = Buffer.from(envelope.authorization.signature, "hex");
    const expectedSignature = createHmac("sha256", input.hmacKey)
        .update(artifactFetchRejectionSigningBytes(envelope, payloadDigest))
        .digest();
    if (observed.length !== expectedSignature.length || !timingSafeEqual(observed, expectedSignature)) {
        return { ok: false, reasonCode: "yeonjang_v2_artifact_fetch_signature_rejected" };
    }
    return { ok: true, rejection: { reason: envelope.payload.reason } };
}
function parseArtifactFetchRejection(value) {
    if (!isRecord(value) || !exact(value, [
        "protocol_version", "schema_id", "message_kind", "message_id", "request_id", "command_id",
        "operation_id", "correlation_id", "causation_id", "requester_id", "target_instance_id",
        "target_session_id", "target_fingerprint", "idempotency_key", "issued_at", "expires_at",
        "sequence", "payload", "authorization",
    ]) || value.protocol_version !== 2 || value.schema_id !== "yeonjang.artifact-fetch-result.v2"
        || value.message_kind !== "response" || value.sequence !== 1)
        return null;
    const identities = [
        value.message_id, value.request_id, value.command_id, value.operation_id, value.correlation_id,
        value.causation_id, value.requester_id, value.target_instance_id, value.target_session_id,
        value.idempotency_key,
    ];
    if (!identities.every(isProtocolIdentity)
        || typeof value.target_fingerprint !== "string"
        || !/^sha256:[0-9a-f]{64}$/u.test(value.target_fingerprint)
        || !Number.isSafeInteger(value.issued_at) || Number(value.issued_at) < 0
        || !Number.isSafeInteger(value.expires_at) || Number(value.expires_at) < 1)
        return null;
    if (!isRecord(value.payload) || !exact(value.payload, [
        "artifact_ref", "owner_request_id", "owner_operation_id", "transfer_id", "observed_revision",
        "outcome", "reason",
    ]))
        return null;
    const reasons = [
        "missing", "wrong_owner", "wrong_transfer", "revision_conflict", "digest_mismatch",
        "invalid_state", "expired", "source_unavailable", "verification_failed", "storage_conflict",
        "unavailable",
    ];
    if (typeof value.payload.artifact_ref !== "string"
        || !/^capture:[0-9a-f]{64}$/u.test(value.payload.artifact_ref)
        || !isProtocolIdentity(value.payload.owner_request_id)
        || !isProtocolIdentity(value.payload.owner_operation_id)
        || !isProtocolIdentity(value.payload.transfer_id)
        || !Number.isSafeInteger(value.payload.observed_revision)
        || Number(value.payload.observed_revision) < 0
        || value.payload.outcome !== "rejected"
        || !reasons.includes(value.payload.reason))
        return null;
    if (!isRecord(value.authorization) || !exact(value.authorization, [
        "schema_version", "issuer", "key_id", "audience", "scope", "requester_id", "request_id",
        "command_id", "operation_id", "target_instance_id", "target_session_id", "target_fingerprint",
        "idempotency_key", "expires_at", "nonce", "signature",
    ]))
        return null;
    const auth = value.authorization;
    if (auth.schema_version !== 1 || auth.scope !== "response.publish"
        || !isProtocolIdentity(auth.issuer) || !isProtocolIdentity(auth.key_id)
        || !isProtocolIdentity(auth.audience) || !isProtocolIdentity(auth.requester_id)
        || !isProtocolIdentity(auth.request_id) || !isProtocolIdentity(auth.command_id)
        || !isProtocolIdentity(auth.operation_id) || !isProtocolIdentity(auth.target_instance_id)
        || !isProtocolIdentity(auth.target_session_id) || !isProtocolIdentity(auth.idempotency_key)
        || !isProtocolIdentity(auth.nonce)
        || typeof auth.target_fingerprint !== "string"
        || !/^sha256:[0-9a-f]{64}$/u.test(auth.target_fingerprint)
        || !Number.isSafeInteger(auth.expires_at)
        || typeof auth.signature !== "string" || !/^[0-9a-f]{64}$/u.test(auth.signature))
        return null;
    return value;
}
function artifactFetchRejectionSigningBytes(envelope, payloadDigest) {
    const auth = envelope.authorization;
    const output = [];
    for (const [name, value] of [
        ["domain", "yeonjang.artifact-fetch-result.authorization.v2"],
        ["protocol_version", envelope.protocol_version], ["schema_id", envelope.schema_id],
        ["message_kind", envelope.message_kind], ["message_id", envelope.message_id],
        ["request_id", envelope.request_id], ["command_id", envelope.command_id],
        ["operation_id", envelope.operation_id], ["correlation_id", envelope.correlation_id],
        ["causation_id", envelope.causation_id], ["requester_id", envelope.requester_id],
        ["target_instance_id", envelope.target_instance_id],
        ["target_session_id", envelope.target_session_id],
        ["target_fingerprint", envelope.target_fingerprint],
        ["idempotency_key", envelope.idempotency_key], ["issued_at", envelope.issued_at],
        ["expires_at", envelope.expires_at], ["sequence", envelope.sequence],
        ["payload_sha256", payloadDigest], ["authorization_schema_version", auth.schema_version],
        ["authorization_issuer", auth.issuer], ["authorization_key_id", auth.key_id],
        ["authorization_audience", auth.audience], ["authorization_scope", auth.scope],
        ["authorization_requester_id", auth.requester_id],
        ["authorization_request_id", auth.request_id],
        ["authorization_command_id", auth.command_id],
        ["authorization_operation_id", auth.operation_id],
        ["authorization_target_instance_id", auth.target_instance_id],
        ["authorization_target_session_id", auth.target_session_id],
        ["authorization_target_fingerprint", auth.target_fingerprint],
        ["authorization_idempotency_key", auth.idempotency_key],
        ["authorization_nonce", auth.nonce], ["authorization_expires_at", auth.expires_at],
    ]) {
        appendField(output, name, Buffer.isBuffer(value)
            ? value
            : typeof value === "number"
                ? u64(value)
                : Buffer.from(value));
    }
    return Buffer.concat(output);
}
function isProtocolIdentity(value) {
    return typeof value === "string"
        && /^[a-z0-9_-]+$/u.test(value)
        && Buffer.byteLength(value, "utf8") <= 64;
}
/** Bounded reference consumer for `YAC2 | u32 header length | JSON | raw`. */
export function createYeonjangMqttV2ArtifactAssembler(input) {
    const chunks = new Map();
    let expectedCount = null;
    let terminal = false;
    return {
        accept(frame) {
            if (terminal)
                return { ok: false, reasonCode: "yeonjang_v2_artifact_already_terminal" };
            const decoded = decodeFrame(frame);
            if (!decoded) {
                terminal = true;
                return { ok: false, reasonCode: "yeonjang_v2_artifact_frame_invalid" };
            }
            const { header, bytes } = decoded;
            if (input.nowMs() >= input.expiresAtMs || input.nowMs() >= header.expires_at_ms) {
                terminal = true;
                return { ok: false, reasonCode: "yeonjang_v2_artifact_expired" };
            }
            if (header.transfer_id !== input.transferId || header.artifact_ref !== input.artifactRef
                || header.owner_requester_id !== input.ownerRequesterId || header.owner_request_id !== input.ownerRequestId
                || header.full_digest !== input.fullDigest || header.total_size !== input.totalSize) {
                terminal = true;
                return { ok: false, reasonCode: "yeonjang_v2_artifact_binding_mismatch" };
            }
            const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
            if (digest !== header.payload_digest) {
                terminal = true;
                return { ok: false, reasonCode: "yeonjang_v2_artifact_digest_mismatch" };
            }
            if (expectedCount === null)
                expectedCount = header.count;
            if (expectedCount !== header.count) {
                terminal = true;
                return { ok: false, reasonCode: "yeonjang_v2_artifact_binding_mismatch" };
            }
            const previous = chunks.get(header.index);
            if (previous && (previous.offset !== header.offset || !previous.bytes.equals(bytes))) {
                terminal = true;
                return { ok: false, reasonCode: "yeonjang_v2_artifact_binding_mismatch" };
            }
            chunks.set(header.index, { offset: header.offset, bytes });
            if (chunks.size !== expectedCount)
                return { ok: true, state: "pending" };
            const ordered = [...chunks.entries()].sort(([left], [right]) => left - right);
            let offset = 0;
            const parts = [];
            for (let index = 0; index < ordered.length; index += 1) {
                const entry = ordered[index];
                if (!entry || entry[0] !== index || entry[1].offset !== offset) {
                    terminal = true;
                    return { ok: false, reasonCode: "yeonjang_v2_artifact_binding_mismatch" };
                }
                parts.push(entry[1].bytes);
                offset += entry[1].bytes.length;
            }
            const result = Buffer.concat(parts);
            const fullDigest = `sha256:${createHash("sha256").update(result).digest("hex")}`;
            terminal = true;
            if (result.length !== input.totalSize || fullDigest !== input.fullDigest) {
                return { ok: false, reasonCode: "yeonjang_v2_artifact_digest_mismatch" };
            }
            return { ok: true, state: "complete", bytes: result };
        },
    };
}
function decodeFrame(frameInput) {
    const frame = Buffer.from(frameInput);
    if (frame.length < 9 || frame.subarray(0, 4).toString("ascii") !== "YAC2")
        return null;
    const headerLength = frame.readUInt32BE(4);
    if (headerLength < 1 || headerLength > 65_536 || 8 + headerLength >= frame.length)
        return null;
    let header;
    try {
        header = JSON.parse(frame.subarray(8, 8 + headerLength).toString("utf8"));
    }
    catch {
        return null;
    }
    if (!isRecord(header) || !exact(header, ["schema_version", "transfer_id", "artifact_ref", "owner_requester_id", "owner_request_id", "index", "count", "offset", "chunk_size", "total_size", "payload_digest", "full_digest", "expires_at_ms"]))
        return null;
    const bytes = frame.subarray(8 + headerLength);
    if (header.schema_version !== 1 || !isIdentity(header.transfer_id) || !isIdentity(header.owner_requester_id) || !isIdentity(header.owner_request_id)
        || typeof header.artifact_ref !== "string" || !/^capture:[0-9a-f]{64}$/u.test(header.artifact_ref)
        || typeof header.payload_digest !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(header.payload_digest)
        || typeof header.full_digest !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(header.full_digest)
        || !safePositive(header.count) || Number(header.count) > 65_536 || !Number.isSafeInteger(header.index) || Number(header.index) < 0 || Number(header.index) >= Number(header.count)
        || !Number.isSafeInteger(header.offset) || Number(header.offset) < 0 || !safePositive(header.chunk_size) || Number(header.chunk_size) > 262_144
        || !safePositive(header.total_size) || !safePositive(header.expires_at_ms) || bytes.length !== Number(header.chunk_size)
        || Number(header.offset) + bytes.length > Number(header.total_size))
        return null;
    return { header: header, bytes };
}
function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function exact(value, keys) {
    return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function isIdentity(value) {
    return typeof value === "string" && value.length > 0 && Buffer.byteLength(value) <= 256;
}
function safePositive(value) {
    return Number.isSafeInteger(value) && Number(value) > 0;
}
//# sourceMappingURL=mqtt-v2-artifact.js.map