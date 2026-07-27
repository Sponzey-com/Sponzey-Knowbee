function invalid(state, event) {
    throw new Error(`Invalid capability transition: ${state} -> ${event}`);
}
export function transitionCapabilityMutation(current, event) {
    const move = (state, reasonCode = null, rollbackAllowed = false) => ({ ...current, state, reasonCode, rollbackAllowed });
    if (event.type === "cancel" && ["draft", "validating", "ready"].includes(current.state))
        return move("cancelled");
    switch (current.state) {
        case "draft":
            if (event.type === "validate")
                return move("validating");
            break;
        case "validating":
            if (event.type === "validation_passed")
                return move("ready");
            if (event.type === "validation_failed")
                return move("failed", event.reasonCode);
            break;
        case "ready":
            if (event.type === "persist") {
                if (event.expectedRevision !== current.baseRevision || event.actualRevision !== event.expectedRevision)
                    throw new Error("Capability revision conflict");
                return move("persisting");
            }
            break;
        case "persisting":
            if (event.type === "persisted")
                return move("applying");
            if (event.type === "persist_failed")
                return move("failed", event.reasonCode);
            break;
        case "applying":
            if (event.type === "applied")
                return move("verifying", null, true);
            if (event.type === "apply_failed")
                return move("failed", event.reasonCode, true);
            break;
        case "verifying":
            if (event.type === "verified")
                return move("active");
            if (event.type === "verification_failed")
                return move("failed", event.reasonCode, true);
            break;
        case "failed":
            if (event.type === "rollback" && current.rollbackAllowed)
                return move("rolling_back", current.reasonCode);
            break;
        case "rolling_back":
            if (event.type === "rollback_succeeded")
                return move("rolled_back", current.reasonCode);
            if (event.type === "rollback_failed")
                return move("failed", event.reasonCode, true);
            break;
        default:
            break;
    }
    return invalid(current.state, event.type);
}
const BASE_ACTIONS = { draft: ["validate", "cancel"], validating: ["cancel"], ready: ["persist", "cancel"] };
export function projectCapabilityMutationReceipt(mutation) {
    const allowedActions = mutation.state === "failed" && mutation.rollbackAllowed ? ["rollback"] : BASE_ACTIONS[mutation.state] ?? [];
    return { mutationId: mutation.mutationId, targetRevision: mutation.targetRevision, state: mutation.state, reasonCode: mutation.reasonCode, allowedActions };
}
export async function executeCapabilityMutation(initial, ports, signal = new AbortController().signal) {
    let mutation = transitionCapabilityMutation(initial, { type: "validate" });
    if (signal.aborted)
        return transitionCapabilityMutation(mutation, { type: "cancel" });
    const validation = await ports.validate(signal);
    if (signal.aborted)
        return transitionCapabilityMutation(mutation, { type: "cancel" });
    if (!validation.ok)
        return transitionCapabilityMutation(mutation, { type: "validation_failed", reasonCode: validation.reasonCode ?? "validation_failed" });
    mutation = transitionCapabilityMutation(mutation, { type: "validation_passed" });
    if (signal.aborted)
        return transitionCapabilityMutation(mutation, { type: "cancel" });
    mutation = transitionCapabilityMutation(mutation, { type: "persist", expectedRevision: initial.baseRevision, actualRevision: initial.baseRevision });
    const persisted = await ports.persist(initial.baseRevision, signal);
    if (persisted.ok === false)
        return transitionCapabilityMutation(mutation, { type: "persist_failed", reasonCode: persisted.reasonCode ?? "persistence_failed" });
    if (persisted.revision !== initial.targetRevision)
        return transitionCapabilityMutation(mutation, { type: "persist_failed", reasonCode: "persisted_revision_mismatch" });
    mutation = transitionCapabilityMutation(mutation, { type: "persisted" });
    const applied = await ports.apply(initial.targetRevision, signal);
    if (!applied.ok)
        mutation = transitionCapabilityMutation(mutation, { type: "apply_failed", reasonCode: applied.reasonCode ?? "runtime_apply_failed" });
    else {
        mutation = transitionCapabilityMutation(mutation, { type: "applied" });
        const verified = await ports.verify(initial.targetRevision, signal);
        if (verified.ok)
            return transitionCapabilityMutation(mutation, { type: "verified" });
        mutation = transitionCapabilityMutation(mutation, { type: "verification_failed", reasonCode: verified.reasonCode ?? "health_verification_failed" });
    }
    mutation = transitionCapabilityMutation(mutation, { type: "rollback" });
    const rolledBack = await ports.rollback(initial.baseRevision, signal);
    return transitionCapabilityMutation(mutation, rolledBack.ok ? { type: "rollback_succeeded" } : { type: "rollback_failed", reasonCode: rolledBack.reasonCode ?? "rollback_failed" });
}
export function projectCapabilityMutationLog(level, mutation) {
    const receipt = projectCapabilityMutationReceipt(mutation);
    if (level === "product")
        return { level, state: mutation.state, reasonCode: mutation.reasonCode };
    if (level === "field_debug")
        return { level, mutationId: mutation.mutationId, targetRevision: mutation.targetRevision, state: mutation.state, reasonCode: mutation.reasonCode };
    return { ...receipt, level, baseRevision: mutation.baseRevision };
}
//# sourceMappingURL=capability-mutation-state-machine.js.map