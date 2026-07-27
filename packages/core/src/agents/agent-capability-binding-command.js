import { executeCapabilityMutation, projectCapabilityMutationReceipt, } from "../capabilities/capability-mutation-state-machine.js";
import { validateMutationEnvelope, } from "../capabilities/capability-security-boundary.js";
function purpose(kind, bound) {
    const prefix = kind === "mcp_server" ? "mcp" : kind;
    return `${prefix}_${bound ? "bind" : "unbind"}`;
}
function fingerprint(input) {
    return JSON.stringify([
        input.kind,
        input.agentRef,
        input.capabilityRef,
        input.bound,
        input.targetRevision,
    ]);
}
function rejected(input) {
    return {
        mutationId: input.command.envelope.mutationId,
        kind: input.command.kind,
        state: input.state ?? "rejected",
        reasonCode: input.reasonCode,
        revision: input.revision,
        agentRef: input.command.agentRef,
        capabilityRef: input.command.capabilityRef,
        bound: input.bound ?? false,
        allowedActions: [],
    };
}
export async function executeAgentCapabilityBindingCommand(command, ports) {
    const baseRevision = ports.currentRevision(command.kind);
    const requestFingerprint = fingerprint({
        kind: command.kind,
        agentRef: command.agentRef,
        capabilityRef: command.capabilityRef,
        bound: command.bound,
        targetRevision: command.envelope.targetRevision,
    });
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
    if (command.envelope.purpose !== purpose(command.kind, command.bound))
        return rejected({ command, revision: baseRevision, reasonCode: "mutation_purpose_denied" });
    const checked = validateMutationEnvelope({
        envelope: command.envelope,
        requiredScope: "capability:write",
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
        });
    const capability = ports.resolveCapability(command.kind, command.capabilityRef);
    if (!capability)
        return rejected({ command, revision: baseRevision, reasonCode: "capability_ref_not_found" });
    if (command.bound && !capability.active)
        return rejected({ command, revision: baseRevision, reasonCode: "capability_binding_inactive" });
    const agent = ports.resolveAgent(command.agentRef);
    if (!agent)
        return rejected({ command, revision: baseRevision, reasonCode: "agent_ref_not_found" });
    if (!agent.active)
        return rejected({ command, revision: baseRevision, reasonCode: "agent_binding_inactive" });
    if (!ports.reserveReceipt({
        envelope: command.envelope,
        kind: command.kind,
        requestFingerprint,
        state: "validating",
        now: ports.now(),
    }))
        return rejected({ command, revision: baseRevision, reasonCode: "mutation_nonce_replayed" });
    const previousEnabled = ports.bindingEnabled({
        kind: command.kind,
        internalCapabilityId: capability.internalCapabilityId,
        internalAgentId: agent.internalAgentId,
    });
    if (previousEnabled === command.bound) {
        const receipt = {
            mutationId: command.envelope.mutationId,
            kind: command.kind,
            state: "active",
            reasonCode: null,
            revision: baseRevision,
            agentRef: command.agentRef,
            capabilityRef: command.capabilityRef,
            bound: command.bound,
            allowedActions: [],
        };
        ports.finishReceipt({
            mutationId: receipt.mutationId,
            state: "active",
            reasonCode: null,
            receipt,
            now: ports.now(),
        });
        return receipt;
    }
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
            internalCapabilityId: capability.internalCapabilityId,
            internalAgentId: agent.internalAgentId,
            enabled: command.bound,
            expectedRevision,
            targetRevision: command.envelope.targetRevision,
        }),
        apply: async () => ({ ok: true }),
        verify: async (targetRevision) => ports.verify({
            kind: command.kind,
            internalCapabilityId: capability.internalCapabilityId,
            internalAgentId: agent.internalAgentId,
            enabled: command.bound,
            targetRevision,
        }),
        rollback: async (baseRevisionForRollback) => ports.rollback({
            kind: command.kind,
            internalCapabilityId: capability.internalCapabilityId,
            internalAgentId: agent.internalAgentId,
            enabled: previousEnabled,
            baseRevision: baseRevisionForRollback,
        }),
    });
    const projected = projectCapabilityMutationReceipt(terminal);
    const receipt = {
        mutationId: projected.mutationId,
        kind: command.kind,
        state: projected.state,
        reasonCode: projected.reasonCode,
        revision: terminal.state === "active" ? terminal.targetRevision : terminal.baseRevision,
        agentRef: command.agentRef,
        capabilityRef: command.capabilityRef,
        bound: terminal.state === "active" ? command.bound : previousEnabled,
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
//# sourceMappingURL=agent-capability-binding-command.js.map