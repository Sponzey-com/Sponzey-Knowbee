import { executeCapabilityMutation, projectCapabilityMutationReceipt, } from "./capability-mutation-state-machine.js";
import { validateMutationEnvelope } from "./capability-security-boundary.js";
export async function executeYeonjangBindingCommand(input, ports) {
    const baseRevision = ports.currentRevision();
    const rejected = (reasonCode, bound = false) => ({
        mutationId: input.envelope.mutationId,
        state: "rejected",
        reasonCode,
        allowedActions: [],
        revision: baseRevision,
        yeonjangRef: input.yeonjangRef,
        agentRef: input.agentRef,
        bound,
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
    const yeonjang = ports.resolveYeonjang(input.yeonjangRef);
    if (!yeonjang)
        return rejected("yeonjang_ref_not_found");
    const agent = ports.resolveAgent(input.agentRef);
    if (!agent)
        return rejected("agent_ref_not_found");
    if (!yeonjang.scopeAllowed || !agent.scopeAllowed)
        return rejected("mutation_scope_denied");
    if (input.action === "bind" && !yeonjang.runnable)
        return rejected("yeonjang_binding_unavailable");
    if (!ports.reserveReceipt({ envelope: input.envelope, state: "validating", now: ports.now() }))
        return rejected("mutation_nonce_replayed");
    const previousEnabled = ports.bindingEnabled({
        internalInstanceId: yeonjang.internalInstanceId,
        internalAgentId: agent.internalAgentId,
    });
    const enabled = input.action === "bind";
    if (previousEnabled === enabled) {
        ports.updateReceipt({
            mutationId: input.envelope.mutationId,
            state: "active",
            reasonCode: null,
            now: ports.now(),
        });
        return {
            mutationId: input.envelope.mutationId,
            state: "active",
            reasonCode: null,
            allowedActions: [],
            revision: baseRevision,
            yeonjangRef: input.yeonjangRef,
            agentRef: input.agentRef,
            bound: enabled,
        };
    }
    const initial = {
        mutationId: input.envelope.mutationId,
        state: "draft",
        baseRevision,
        targetRevision: input.envelope.targetRevision,
        reasonCode: null,
    };
    const terminal = await executeCapabilityMutation(initial, {
        validate: async () => ({ ok: true }),
        persist: async (expectedRevision) => ports.persist({
            internalInstanceId: yeonjang.internalInstanceId,
            internalAgentId: agent.internalAgentId,
            enabled,
            expectedRevision,
            targetRevision: input.envelope.targetRevision,
        }),
        apply: async () => ({ ok: true }),
        verify: async (targetRevision) => ports.verify({
            internalInstanceId: yeonjang.internalInstanceId,
            internalAgentId: agent.internalAgentId,
            enabled,
            targetRevision,
        }),
        rollback: async (baseRevisionForRollback) => ports.rollback({
            internalInstanceId: yeonjang.internalInstanceId,
            internalAgentId: agent.internalAgentId,
            enabled: previousEnabled,
            baseRevision: baseRevisionForRollback,
        }),
    });
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
        agentRef: input.agentRef,
        bound: terminal.state === "active" ? enabled : previousEnabled,
    };
}
//# sourceMappingURL=yeonjang-binding-command.js.map