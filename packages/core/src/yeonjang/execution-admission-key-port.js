import { createHmac } from "node:crypto";
export function createYeonjangExecutionAdmissionPasswordHandle(input) {
    const extensionId = input.extensionId.trim();
    const sessionId = normalizeOptional(input.sessionId);
    const keyId = input.keyId.trim();
    const connectionPassword = input.connectionPassword.trim();
    if (!extensionId || !keyId || !connectionPassword)
        return undefined;
    return Object.freeze({
        keyId,
        extensionId,
        ...(sessionId ? { sessionId } : {}),
        sign: ({ canonicalPayload }) => `hmac-sha256:${createHmac("sha256", connectionPassword)
            .update(canonicalPayload, "utf8")
            .digest("hex")}`,
    });
}
export function createBootstrapYeonjangExecutionAdmissionKeyPort(input) {
    const handles = new Map();
    for (const handle of input.handles) {
        const extensionId = handle.extensionId.trim();
        const sessionId = normalizeOptional(handle.sessionId);
        const keyId = handle.keyId.trim();
        if (!extensionId || !keyId || typeof handle.sign !== "function") {
            return { ok: false, reasonCode: "execution_admission_key_bootstrap_invalid" };
        }
        const binding = keyBinding(extensionId, sessionId);
        if (handles.has(binding)) {
            return { ok: false, reasonCode: "execution_admission_key_binding_duplicate" };
        }
        handles.set(binding, handle);
    }
    return {
        ok: true,
        keyPort: Object.freeze({
            resolve: ({ extensionId, sessionId }) => {
                const normalizedExtensionId = extensionId.trim();
                const normalizedSessionId = normalizeOptional(sessionId);
                return (handles.get(keyBinding(normalizedExtensionId, normalizedSessionId)) ??
                    (normalizedSessionId ? handles.get(keyBinding(normalizedExtensionId, "")) : undefined));
            },
        }),
    };
}
export function createYeonjangExecutionAdmissionKeyRegistry(input = {}) {
    const handles = new Map();
    const fallbackPorts = Object.freeze([...(input.fallbackPorts ?? [])]);
    const keyPort = Object.freeze({
        resolve: ({ extensionId, sessionId, }) => {
            const normalizedExtensionId = extensionId.trim();
            const normalizedSessionId = normalizeOptional(sessionId);
            const exact = handles.get(keyBinding(normalizedExtensionId, normalizedSessionId));
            if (exact)
                return exact;
            const extensionWide = normalizedSessionId
                ? handles.get(keyBinding(normalizedExtensionId, ""))
                : undefined;
            if (extensionWide)
                return extensionWide;
            for (const fallback of fallbackPorts) {
                const resolved = fallback.resolve({
                    extensionId: normalizedExtensionId,
                    ...(normalizedSessionId ? { sessionId: normalizedSessionId } : {}),
                });
                if (resolved)
                    return resolved;
            }
            return undefined;
        },
    });
    return Object.freeze({
        keyPort,
        register: (handle) => {
            const normalized = normalizeHandle(handle);
            if (!normalized) {
                return { ok: false, reasonCode: "execution_admission_key_bootstrap_invalid" };
            }
            handles.set(keyBinding(normalized.extensionId, normalizeOptional(normalized.sessionId)), normalized);
            return { ok: true };
        },
        remove: ({ extensionId, sessionId }) => {
            handles.delete(keyBinding(extensionId.trim(), normalizeOptional(sessionId)));
        },
    });
}
export function bindYeonjangExecutionAdmissionKey(input) {
    const extensionId = input.extensionId.trim();
    const sessionId = normalizeOptional(input.sessionId);
    const handle = input.keyPort.resolve({
        extensionId,
        ...(sessionId ? { sessionId } : {}),
    });
    if (!handle) {
        return blocked("execution_admission_key_unavailable");
    }
    if (handle.extensionId.trim() !== extensionId ||
        (normalizeOptional(handle.sessionId) && normalizeOptional(handle.sessionId) !== sessionId) ||
        handle.keyId.trim().length === 0) {
        return blocked("execution_admission_key_binding_mismatch");
    }
    return {
        schemaVersion: "knowbee.yeonjang-execution-admission-key-binding.v1",
        status: "ready",
        reasonCode: "execution_admission_key_ready",
        keyRef: `yeonjang-execution-admission-key:${handle.keyId.trim()}`,
    };
}
function blocked(reasonCode) {
    return {
        schemaVersion: "knowbee.yeonjang-execution-admission-key-binding.v1",
        status: "blocked",
        reasonCode,
    };
}
function normalizeOptional(value) {
    return value?.trim() ?? "";
}
function normalizeHandle(handle) {
    const extensionId = handle.extensionId.trim();
    const keyId = handle.keyId.trim();
    const sessionId = normalizeOptional(handle.sessionId);
    if (!extensionId || !keyId || typeof handle.sign !== "function")
        return undefined;
    return Object.freeze({
        keyId,
        extensionId,
        ...(sessionId ? { sessionId } : {}),
        sign: handle.sign,
    });
}
function keyBinding(extensionId, sessionId) {
    return `${extensionId}\u0000${sessionId}`;
}
//# sourceMappingURL=execution-admission-key-port.js.map