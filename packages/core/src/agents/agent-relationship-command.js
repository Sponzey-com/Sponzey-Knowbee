import { executeCapabilityMutation, projectCapabilityMutationReceipt, } from "../capabilities/capability-mutation-state-machine.js";
import { validateMutationEnvelope, } from "../capabilities/capability-security-boundary.js";
function fingerprint(command) {
    return JSON.stringify([
        command.kind,
        command.childRef,
        command.parentRef,
        command.envelope.targetRevision,
    ]);
}
function rejected(input) {
    return {
        mutationId: input.command.envelope.mutationId,
        kind: input.command.kind,
        state: input.state ?? "rejected",
        reasonCode: input.reasonCode,
        revision: input.revision,
        childRef: input.command.childRef,
        parentRef: input.command.parentRef,
        allowedActions: [],
    };
}
function transitionValid(input) {
    if (input.kind === "connect")
        return !input.current && input.internalParentAgentId !== null;
    if (input.kind === "disconnect")
        return Boolean(input.current) && input.internalParentAgentId === null;
    return Boolean(input.current &&
        input.internalParentAgentId &&
        input.current.internalParentAgentId !== input.internalParentAgentId);
}
export async function executeAgentRelationshipCommand(command, ports) {
    const baseRevision = ports.currentRevision();
    const requestFingerprint = fingerprint(command);
    const prior = ports.receiptByNonce(command.envelope.nonce);
    if (prior) {
        if (prior.mutationId === command.envelope.mutationId &&
            prior.requestFingerprint === requestFingerprint)
            return prior.receipt;
        return rejected({
            command,
            revision: baseRevision,
            reasonCode: "mutation_nonce_conflict",
            state: "conflict",
        });
    }
    if (command.envelope.purpose !== `relationship_${command.kind}`)
        return rejected({ command, revision: baseRevision, reasonCode: "mutation_purpose_denied" });
    const checked = validateMutationEnvelope({
        envelope: command.envelope,
        requiredScope: "agent_relationship:write",
        currentRevision: baseRevision,
        now: ports.now(),
        maxAgeMs: 5 * 60_000,
        usedNonces: new Set(),
    });
    if (!checked.ok)
        return rejected({
            command,
            revision: baseRevision,
            reasonCode: checked.diagnostics[0]?.reasonCode ?? "mutation_rejected",
            ...(checked.diagnostics.some((item) => item.reasonCode === "mutation_revision_conflict")
                ? { state: "conflict" }
                : {}),
        });
    const child = ports.resolveAgent(command.childRef);
    if (!child)
        return rejected({ command, revision: baseRevision, reasonCode: "child_ref_not_found" });
    if (!child.active || child.root)
        return rejected({ command, revision: baseRevision, reasonCode: "child_relationship_inactive" });
    const parent = command.parentRef ? ports.resolveAgent(command.parentRef) : null;
    if (command.parentRef && !parent)
        return rejected({ command, revision: baseRevision, reasonCode: "parent_ref_not_found" });
    if (parent && !parent.active)
        return rejected({ command, revision: baseRevision, reasonCode: "parent_relationship_inactive" });
    if (parent?.internalAgentId === child.internalAgentId)
        return rejected({ command, revision: baseRevision, reasonCode: "self_parent_blocked" });
    const current = ports.currentRelationship(child.internalAgentId);
    if (!transitionValid({
        kind: command.kind,
        current,
        internalParentAgentId: parent?.internalAgentId ?? null,
    }))
        return rejected({
            command,
            revision: baseRevision,
            reasonCode: "agent_relationship_transition_invalid",
        });
    const validation = ports.validate({
        kind: command.kind,
        internalChildAgentId: child.internalAgentId,
        internalParentAgentId: parent?.internalAgentId ?? null,
        current,
    });
    if (!validation.ok)
        return rejected({
            command,
            revision: baseRevision,
            reasonCode: validation.reasonCode ?? "agent_relationship_invalid",
        });
    if (!ports.reserveReceipt({
        envelope: command.envelope,
        kind: command.kind,
        requestFingerprint,
        state: "validating",
        now: ports.now(),
    }))
        return rejected({ command, revision: baseRevision, reasonCode: "mutation_nonce_replayed" });
    const initial = {
        mutationId: command.envelope.mutationId,
        state: "draft",
        baseRevision,
        targetRevision: command.envelope.targetRevision,
        reasonCode: null,
    };
    const terminal = await executeCapabilityMutation(initial, {
        validate: async () => ({ ok: true }),
        persist: async (expectedRevision) => ports.persist({
            kind: command.kind,
            internalChildAgentId: child.internalAgentId,
            internalParentAgentId: parent?.internalAgentId ?? null,
            current,
            expectedRevision,
            targetRevision: command.envelope.targetRevision,
        }),
        apply: async () => ({ ok: true }),
        verify: async (targetRevision) => ports.verify({
            internalChildAgentId: child.internalAgentId,
            internalParentAgentId: parent?.internalAgentId ?? null,
            targetRevision,
        }),
        rollback: async (baseRevisionForRollback) => ports.rollback({
            internalChildAgentId: child.internalAgentId,
            previous: current,
            baseRevision: baseRevisionForRollback,
        }),
    });
    const projected = projectCapabilityMutationReceipt(terminal);
    const receipt = {
        mutationId: command.envelope.mutationId,
        kind: command.kind,
        state: terminal.state,
        reasonCode: terminal.reasonCode,
        revision: terminal.state === "active" ? terminal.targetRevision : terminal.baseRevision,
        childRef: command.childRef,
        parentRef: command.parentRef,
        allowedActions: projected.allowedActions,
    };
    ports.finishReceipt({
        mutationId: receipt.mutationId,
        state: terminal.state,
        reasonCode: terminal.reasonCode,
        receipt,
        now: ports.now(),
    });
    return receipt;
}
//# sourceMappingURL=agent-relationship-command.js.map