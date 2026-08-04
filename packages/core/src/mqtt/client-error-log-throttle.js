/**
 * Bounds repeated diagnostic logs without changing transport or workflow
 * state. The broker owns and clears this process-local projection.
 */
export function createMqttClientErrorLogThrottle(input) {
    if (!Number.isSafeInteger(input.windowMs) || input.windowMs < 1
        || !Number.isSafeInteger(input.maxKeys) || input.maxKeys < 1) {
        throw new Error("mqtt_client_error_log_throttle_config_invalid");
    }
    const nowMs = input.nowMs ?? Date.now;
    const entries = new Map();
    return {
        admit(key) {
            const normalized = key.trim();
            if (!normalized)
                return { emit: true, suppressed: 0 };
            const now = nowMs();
            const existing = entries.get(normalized);
            if (existing && now - existing.lastEmittedAt < input.windowMs) {
                existing.suppressed += 1;
                return { emit: false, suppressed: existing.suppressed };
            }
            const suppressed = existing?.suppressed ?? 0;
            if (!existing && entries.size >= input.maxKeys)
                evictOldest(entries);
            entries.set(normalized, { lastEmittedAt: now, suppressed: 0 });
            return { emit: true, suppressed };
        },
        clear() {
            entries.clear();
        },
        size() {
            return entries.size;
        },
    };
}
function evictOldest(entries) {
    let oldestKey = null;
    let oldestAt = Number.POSITIVE_INFINITY;
    for (const [key, value] of entries) {
        if (value.lastEmittedAt < oldestAt) {
            oldestKey = key;
            oldestAt = value.lastEmittedAt;
        }
    }
    if (oldestKey !== null)
        entries.delete(oldestKey);
}
//# sourceMappingURL=client-error-log-throttle.js.map