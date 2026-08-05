const immutableSnapshots = new WeakSet();
const snapshotsByInput = new WeakMap();
function freezeDeep(value, visited) {
    if (value === null || typeof value !== "object" || visited.has(value))
        return;
    visited.add(value);
    for (const nested of Object.values(value)) {
        freezeDeep(nested, visited);
    }
    Object.freeze(value);
}
export function createImmutableConfigSnapshot(config) {
    if (immutableSnapshots.has(config))
        return config;
    const existing = snapshotsByInput.get(config);
    if (existing)
        return existing;
    const snapshot = structuredClone(config);
    freezeDeep(snapshot, new WeakSet());
    immutableSnapshots.add(snapshot);
    snapshotsByInput.set(config, snapshot);
    return snapshot;
}
export function createStartupConfigSource(loader) {
    let state = "empty";
    let snapshot = null;
    let failure;
    return {
        getState() {
            return state;
        },
        getSnapshot() {
            if (state === "ready" && snapshot)
                return snapshot;
            if (state === "failed")
                throw failure;
            if (state === "loading")
                throw new Error("startup_config_load_reentrant");
            state = "loading";
            try {
                snapshot = createImmutableConfigSnapshot(loader());
                state = "ready";
                return snapshot;
            }
            catch (error) {
                failure = error;
                state = "failed";
                throw error;
            }
        },
    };
}
//# sourceMappingURL=startup-source.js.map