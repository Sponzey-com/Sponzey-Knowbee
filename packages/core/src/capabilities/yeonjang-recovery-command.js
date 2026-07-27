import { executeCapabilityMutation, projectCapabilityMutationReceipt, } from "./capability-mutation-state-machine.js";
import { validateMutationEnvelope } from "./capability-security-boundary.js";
function actionAllowed(snapshot, action) {
    if (action === "reconnect")
        return ["inactive", "stale", "unavailable"].includes(snapshot.status);
    return (snapshot.status === "permission_required" ||
        snapshot.permissionState === "required" ||
        snapshot.permissionState === "restricted");
}
function resultVerified(snapshot, action) {
    if (!snapshot)
        return false;
    if (action === "reconnect")
        return snapshot.status === "ready" && snapshot.runnable;
    return snapshot.status === "ready" && snapshot.permissionState === "ready" && snapshot.runnable;
}
async function verifyResultWithPolicy(input) {
    const attempts = Math.max(1, Math.min(10, Math.floor(input.policy?.maxAttempts ?? 1)));
    const intervalMs = Math.max(0, Math.min(5_000, Math.floor(input.policy?.intervalMs ?? 0)));
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        if (input.signal.aborted)
            return false;
        const snapshot = await input.ports.inspectResult(input.internalInstanceId, input.signal);
        if (resultVerified(snapshot, input.action))
            return true;
        if (attempt + 1 < attempts && input.policy) {
            await input.policy.wait(intervalMs, input.signal);
        }
    }
    return false;
}
export async function executeYeonjangRecoveryCommand(input, ports, signal = new AbortController().signal, verificationPolicy) {
    const baseRevision = ports.currentRevision();
    const rejected = (reasonCode) => ({
        mutationId: input.envelope.mutationId,
        state: "rejected",
        reasonCode,
        allowedActions: [],
        revision: baseRevision,
        yeonjangRef: input.yeonjangRef,
        action: input.action,
        ready: false,
    });
    if (input.envelope.purpose !== `yeonjang_${input.action}`)
        return rejected("mutation_purpose_denied");
    const checked = validateMutationEnvelope({
        envelope: input.envelope,
        requiredScope: "capability:write",
        currentRevision: baseRevision,
        now: ports.now(),
        maxAgeMs: 5 * 60_000,
        usedNonces: new Set(ports.nonceUsed(input.envelope.nonce) ? [input.envelope.nonce] : []),
    });
    if (!checked.ok)
        return rejected(checked.diagnostics[0]?.reasonCode ?? "mutation_rejected");
    const snapshot = ports.resolveYeonjang(input.yeonjangRef);
    if (!snapshot)
        return rejected("yeonjang_ref_not_found");
    if (!actionAllowed(snapshot, input.action))
        return rejected("yeonjang_recovery_action_denied");
    if (!ports.reserveReceipt({ envelope: input.envelope, state: "validating", now: ports.now() }))
        return rejected("mutation_nonce_replayed");
    const initial = {
        mutationId: input.envelope.mutationId,
        state: "draft",
        baseRevision,
        targetRevision: input.envelope.targetRevision,
        reasonCode: null,
    };
    const terminal = await executeCapabilityMutation(initial, {
        validate: async () => ({ ok: true }),
        persist: (expectedRevision) => ports.persistIntent({
            internalInstanceId: snapshot.internalInstanceId,
            action: input.action,
            expectedRevision,
            targetRevision: input.envelope.targetRevision,
        }),
        apply: (_targetRevision, current) => ports.applyAction({ internalInstanceId: snapshot.internalInstanceId, action: input.action }, current),
        verify: async (_targetRevision, current) => ({
            ok: await verifyResultWithPolicy({
                internalInstanceId: snapshot.internalInstanceId,
                action: input.action,
                ports,
                signal: current,
                ...(verificationPolicy ? { policy: verificationPolicy } : {}),
            }),
            reasonCode: "yeonjang_recovery_verification_failed",
        }),
        rollback: (baseRevisionForRollback, current) => ports.rollbackIntent({
            internalInstanceId: snapshot.internalInstanceId,
            baseRevision: baseRevisionForRollback,
        }, current),
    }, signal);
    ports.updateReceipt({
        mutationId: input.envelope.mutationId,
        state: terminal.state,
        reasonCode: terminal.reasonCode,
        now: ports.now(),
    });
    const receipt = projectCapabilityMutationReceipt(terminal);
    return {
        mutationId: receipt.mutationId,
        state: receipt.state,
        reasonCode: receipt.reasonCode,
        allowedActions: receipt.allowedActions,
        revision: terminal.state === "active" ? terminal.targetRevision : terminal.baseRevision,
        yeonjangRef: input.yeonjangRef,
        action: input.action,
        ready: terminal.state === "active",
    };
}
//# sourceMappingURL=yeonjang-recovery-command.js.map