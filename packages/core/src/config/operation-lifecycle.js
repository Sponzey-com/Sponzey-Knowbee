import { randomUUID } from "node:crypto";
const ALLOWED_TRANSITIONS = {
    received: ["validated", "rejected"],
    validated: ["executing", "backed_up", "rejected"],
    executing: ["persisted", "completed", "failed"],
    persisted: ["completed", "failed"],
    backed_up: ["replacing", "rolling_back"],
    replacing: ["verifying", "rolling_back"],
    verifying: ["completed", "rolling_back"],
    rolling_back: ["failed"],
    completed: [],
    failed: [],
    rejected: [],
};
function assertReasonCode(reasonCode) {
    if (!/^[a-z][a-z0-9_.-]*$/u.test(reasonCode)) {
        throw new Error("Configuration operation reason code must be a stable lowercase identifier");
    }
}
export function createConfigurationOperationLifecycle(options) {
    const now = options.now ?? Date.now;
    const commandId = options.commandId ?? randomUUID();
    let state = "received";
    const transitions = [
        Object.freeze({ from: null, to: "received", reasonCode: "command_received", timestamp: now() }),
    ];
    return {
        transition(next, reasonCode) {
            assertReasonCode(reasonCode);
            if (!ALLOWED_TRANSITIONS[state].includes(next)) {
                throw new Error(`Invalid configuration operation transition: ${state} -> ${next}`);
            }
            const previous = state;
            state = next;
            transitions.push(Object.freeze({ from: previous, to: next, reasonCode, timestamp: now() }));
        },
        snapshot() {
            return Object.freeze({
                commandId,
                kind: options.kind,
                state,
                transitions: Object.freeze([...transitions]),
            });
        },
    };
}
//# sourceMappingURL=operation-lifecycle.js.map