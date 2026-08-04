import { createHash, createHmac, timingSafeEqual } from "node:crypto";
/**
 * Verifies a terminal publication before any artifact fetch, acknowledgement,
 * or user-visible completion. The expected identity comes from the dispatched
 * command snapshot; no field is reconstructed from response prose.
 */
export function admitYeonjangMqttV2TerminalResponse(input) {
    if (input.payload.byteLength < 1 || input.payload.byteLength > 512 * 1024 || input.hmacKey.byteLength < 16) {
        return { ok: false, reasonCode: "yeonjang_v2_response_payload_invalid" };
    }
    let value;
    try {
        value = JSON.parse(Buffer.from(input.payload).toString("utf8"));
    }
    catch {
        return { ok: false, reasonCode: "yeonjang_v2_response_payload_invalid" };
    }
    const envelope = parseTerminalEnvelope(value);
    if (!envelope)
        return { ok: false, reasonCode: "yeonjang_v2_response_payload_invalid" };
    const expected = input.expected;
    if (envelope.request_id !== expected.requestId
        || envelope.command_id !== expected.commandId
        || envelope.operation_id !== expected.operationId
        || envelope.idempotency_key !== expected.idempotencyKey
        || envelope.requester_id !== expected.enrollment.requesterId
        || envelope.target_instance_id !== expected.enrollment.instanceId
        || envelope.target_session_id !== expected.enrollment.sessionId
        || envelope.target_fingerprint !== expected.targetFingerprint
        || !contentIdentityMatches(envelope.payload, envelope))
        return { ok: false, reasonCode: "yeonjang_v2_response_identity_mismatch" };
    if (envelope.issued_at > input.nowMs || envelope.expires_at <= input.nowMs || envelope.expires_at <= envelope.issued_at) {
        return { ok: false, reasonCode: "yeonjang_v2_response_expired" };
    }
    const payloadDigest = createHash("sha256").update(JSON.stringify(envelope.payload)).digest();
    const responseDigest = `sha256:${payloadDigest.toString("hex")}`;
    if (envelope.response_digest !== responseDigest
        || envelope.receipt_id !== `receipt-${payloadDigest.toString("hex").slice(0, 56)}`)
        return { ok: false, reasonCode: "yeonjang_v2_response_payload_invalid" };
    const observed = Buffer.from(envelope.authorization.signature, "hex");
    const expectedSignature = createHmac("sha256", input.hmacKey)
        .update(responseSigningBytes(envelope, payloadDigest))
        .digest();
    if (observed.length !== expectedSignature.length || !timingSafeEqual(observed, expectedSignature)) {
        return { ok: false, reasonCode: "yeonjang_v2_response_signature_rejected" };
    }
    return {
        ok: true,
        terminal: {
            receiptId: envelope.receipt_id,
            responseDigest,
            terminalRevision: envelope.payload.terminal.terminal_revision,
            executionOutcome: envelope.payload.terminal.execution_outcome,
            deliveryOutcome: envelope.payload.terminal.delivery_outcome,
            failure: envelope.payload.terminal.failure ?? null,
            artifact: envelope.payload.artifact ?? null,
        },
    };
}
function parseTerminalEnvelope(value) {
    if (!isRecord(value) || !exact(value, [
        "protocol_version", "schema_id", "message_kind", "message_id", "receipt_id", "response_digest",
        "request_id", "command_id", "operation_id", "correlation_id", "causation_id", "requester_id",
        "target_instance_id", "target_session_id", "target_fingerprint", "idempotency_key", "issued_at",
        "expires_at", "sequence", "payload", "authorization",
    ]) || value.protocol_version !== 2 || value.schema_id !== "yeonjang.response.v2" || value.message_kind !== "response")
        return null;
    if (!isRecord(value.payload) || !exact(value.payload, [
        "schema_version", "request_id", "command_id", "operation_id", "requester_id", "correlation_id",
        "causation_id", "target_instance_id", "target_session_id", "target_fingerprint", "idempotency_key",
        "target_scope_digest", "terminal", ...(value.payload.artifact === undefined ? [] : ["artifact"]),
    ]) || value.payload.schema_version !== 3 || !isRecord(value.payload.terminal))
        return null;
    const terminal = value.payload.terminal;
    const terminalKeys = ["schema_version", "request_id", "command_id", "operation_id", "requester_id", "target", "method", "resource", "idempotency_key", "binding_digest", "execution_outcome", "delivery_outcome", "terminal_revision"];
    if (!exact(terminal, [...terminalKeys, ...(terminal.failure === undefined ? [] : ["failure"])]) || terminal.schema_version !== 1 || !isRecord(terminal.target))
        return null;
    if (!isRecord(value.authorization) || !exact(value.authorization, ["schema_version", "issuer", "key_id", "audience", "scope", "requester_id", "request_id", "command_id", "operation_id", "target_instance_id", "target_session_id", "target_fingerprint", "idempotency_key", "expires_at", "nonce", "signature"]))
        return null;
    const strings = [value.message_id, value.receipt_id, value.response_digest, value.request_id, value.command_id, value.operation_id, value.correlation_id, value.causation_id, value.requester_id, value.target_instance_id, value.target_session_id, value.target_fingerprint, value.idempotency_key];
    if (!strings.every(isBoundedText) || !Number.isSafeInteger(value.issued_at) || !Number.isSafeInteger(value.expires_at) || !Number.isSafeInteger(value.sequence) || Number(value.sequence) < 1)
        return null;
    const auth = value.authorization;
    if (auth.schema_version !== 1 || auth.scope !== "response.publish" || !isLowerHex(auth.signature) || !Number.isSafeInteger(auth.expires_at))
        return null;
    if (!isBoundedText(auth.issuer) || !isBoundedText(auth.key_id) || !isBoundedText(auth.audience) || !isBoundedText(auth.nonce))
        return null;
    const outcomes = ["blocked", "failed", "cancelled", "effect_unknown", "succeeded"];
    const delivery = ["not_started", "queued", "published", "consumer_acknowledged", "pending_retry", "failed", "expired"];
    if (!outcomes.includes(String(terminal.execution_outcome)) || !delivery.includes(String(terminal.delivery_outcome)) || !Number.isSafeInteger(terminal.terminal_revision) || Number(terminal.terminal_revision) < 1 || Number(value.sequence) !== Number(terminal.terminal_revision))
        return null;
    if (terminal.execution_outcome !== "succeeded" && !isRecord(terminal.failure))
        return null;
    if (value.payload.artifact !== undefined && !parseArtifact(value.payload.artifact))
        return null;
    if (auth.issuer !== value.target_instance_id || auth.audience !== value.requester_id || auth.expires_at !== value.expires_at)
        return null;
    return value;
}
function parseArtifact(value) {
    if (!isRecord(value) || !exact(value, ["schemaVersion", "artifactRef", "kind", "mediaType", "sizeBytes", "fullDigest", "createdAtMs", "expiresAtMs", "lifecycleRevision"]))
        return false;
    return value.schemaVersion === 1
        && ((value.kind === "camera_jpeg" && value.mediaType === "image/jpeg") || (value.kind === "screen_png" && value.mediaType === "image/png"))
        && typeof value.artifactRef === "string" && /^capture:[0-9a-f]{64}$/u.test(value.artifactRef)
        && typeof value.fullDigest === "string" && /^sha256:[0-9a-f]{64}$/u.test(value.fullDigest)
        && Number.isSafeInteger(value.sizeBytes) && Number(value.sizeBytes) > 0
        && Number.isSafeInteger(value.createdAtMs) && Number.isSafeInteger(value.expiresAtMs) && Number(value.expiresAtMs) > Number(value.createdAtMs)
        // Registration is the first durable artifact state, so a freshly captured
        // Yeonjang artifact is fetchable at revision 0. Fetch owns the 0 -> 1 CAS.
        && Number.isSafeInteger(value.lifecycleRevision) && Number(value.lifecycleRevision) >= 0;
}
function contentIdentityMatches(content, envelope) {
    const terminal = content.terminal;
    const target = terminal.target;
    const auth = envelope.authorization;
    return content.request_id === envelope.request_id && terminal.request_id === envelope.request_id && auth.request_id === envelope.request_id
        && content.command_id === envelope.command_id && terminal.command_id === envelope.command_id && auth.command_id === envelope.command_id
        && content.operation_id === envelope.operation_id && terminal.operation_id === envelope.operation_id && auth.operation_id === envelope.operation_id
        && content.requester_id === envelope.requester_id && terminal.requester_id === envelope.requester_id && auth.requester_id === envelope.requester_id
        && content.target_instance_id === envelope.target_instance_id && target.instance_id === envelope.target_instance_id && auth.target_instance_id === envelope.target_instance_id
        && content.target_session_id === envelope.target_session_id && target.session_id === envelope.target_session_id && auth.target_session_id === envelope.target_session_id
        && content.target_fingerprint === envelope.target_fingerprint && target.fingerprint === envelope.target_fingerprint && auth.target_fingerprint === envelope.target_fingerprint
        && content.idempotency_key === envelope.idempotency_key && terminal.idempotency_key === envelope.idempotency_key && auth.idempotency_key === envelope.idempotency_key
        && content.correlation_id === envelope.correlation_id && content.causation_id === envelope.causation_id;
}
function responseSigningBytes(envelope, payloadDigest) {
    const output = [];
    const values = [
        ["domain", "yeonjang.response.authorization.v2"], ["protocol_version", envelope.protocol_version],
        ["schema_id", envelope.schema_id], ["message_kind", envelope.message_kind], ["message_id", envelope.message_id],
        ["receipt_id", envelope.receipt_id], ["response_digest", envelope.response_digest], ["request_id", envelope.request_id],
        ["command_id", envelope.command_id], ["operation_id", envelope.operation_id], ["correlation_id", envelope.correlation_id],
        ["causation_id", envelope.causation_id], ["requester_id", envelope.requester_id], ["target_instance_id", envelope.target_instance_id],
        ["target_session_id", envelope.target_session_id], ["target_fingerprint", envelope.target_fingerprint], ["idempotency_key", envelope.idempotency_key],
        ["issued_at", envelope.issued_at], ["expires_at", envelope.expires_at], ["sequence", envelope.sequence], ["payload_sha256", payloadDigest],
        ["authorization_schema_version", envelope.authorization.schema_version], ["authorization_issuer", envelope.authorization.issuer],
        ["authorization_key_id", envelope.authorization.key_id], ["authorization_audience", envelope.authorization.audience],
        ["authorization_scope", envelope.authorization.scope], ["authorization_requester_id", envelope.authorization.requester_id],
        ["authorization_request_id", envelope.authorization.request_id], ["authorization_command_id", envelope.authorization.command_id],
        ["authorization_operation_id", envelope.authorization.operation_id], ["authorization_target_instance_id", envelope.authorization.target_instance_id],
        ["authorization_target_session_id", envelope.authorization.target_session_id], ["authorization_target_fingerprint", envelope.authorization.target_fingerprint],
        ["authorization_idempotency_key", envelope.authorization.idempotency_key], ["authorization_expires_at", envelope.authorization.expires_at],
        ["authorization_nonce", envelope.authorization.nonce],
    ];
    for (const [name, value] of values)
        append(output, name, Buffer.isBuffer(value) ? value : typeof value === "number" ? u64(value) : Buffer.from(value));
    return Buffer.concat(output);
}
function append(output, name, value) {
    const key = Buffer.from(name);
    output.push(u64(key.length), key, u64(value.length), value);
}
function u64(value) {
    const bytes = Buffer.alloc(8);
    bytes.writeBigUInt64BE(BigInt(value));
    return bytes;
}
function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function exact(value, keys) {
    const actual = Object.keys(value);
    return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function isBoundedText(value) {
    return typeof value === "string" && value.trim().length > 0 && Buffer.byteLength(value, "utf8") <= 256;
}
function isLowerHex(value) {
    return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}
//# sourceMappingURL=mqtt-v2-response.js.map