import { executeCapabilityMutation, projectCapabilityMutationReceipt, } from "./capability-mutation-state-machine.js";
import { validateMutationEnvelope } from "./capability-security-boundary.js";
export async function executeMcpLifecycleCommand(input, ports, signal = new AbortController().signal) {
    const baseRevision = ports.currentRevision();
    const rejected = (reasonCode, impact = { bindingCount: 0, agentNames: [] }) => ({
        mutationId: input.envelope.mutationId,
        state: "rejected",
        reasonCode,
        allowedActions: [],
        revision: baseRevision,
        mcpRef: input.mcpRef,
        status: "disabled",
        deleted: false,
        impact,
    });
    if (input.envelope.purpose !== `mcp_${input.action}`)
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
    const snapshot = ports.resolveMcp(input.mcpRef);
    if (!snapshot)
        return rejected("mcp_ref_not_found");
    const agentNames = [...ports.boundAgentNames(snapshot.internalMcpId)]
        .map((name) => name.trim())
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right));
    const impact = { bindingCount: agentNames.length, agentNames };
    if (input.action === "delete" && impact.bindingCount > 0)
        return rejected("mcp_delete_in_use", impact);
    const targetStatus = input.action === "delete" ? "deleted" : input.action === "enable" ? "enabled" : "disabled";
    if ((input.action === "enable" && snapshot.status === "enabled") ||
        (input.action === "disable" && snapshot.status === "disabled"))
        return {
            mutationId: input.envelope.mutationId,
            state: "active",
            reasonCode: null,
            allowedActions: [],
            revision: baseRevision,
            mcpRef: input.mcpRef,
            status: targetStatus,
            deleted: false,
            impact,
        };
    if (!ports.reserveReceipt({ envelope: input.envelope, state: "validating", now: ports.now() }))
        return rejected("mutation_nonce_replayed", impact);
    const initial = {
        mutationId: input.envelope.mutationId,
        state: "draft",
        baseRevision,
        targetRevision: input.envelope.targetRevision,
        reasonCode: null,
    };
    const terminal = await executeCapabilityMutation(initial, {
        validate: async () => input.action === "enable" ? ports.inspect(snapshot, signal) : { ok: true },
        persist: async (expectedRevision) => ports.persist({
            snapshot,
            action: input.action,
            expectedRevision,
            targetRevision: input.envelope.targetRevision,
        }),
        apply: async (targetRevision) => ports.apply({ snapshot, action: input.action, targetRevision }, signal),
        verify: async (targetRevision) => ports.verify({ snapshot, action: input.action, targetRevision }, signal),
        rollback: async (baseRevisionForRollback) => ports.rollback({ snapshot, baseRevision: baseRevisionForRollback }, signal),
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
        mcpRef: input.mcpRef,
        status: terminal.state === "active" ? targetStatus : snapshot.status,
        deleted: terminal.state === "active" && input.action === "delete",
        impact,
    };
}
//# sourceMappingURL=mcp-lifecycle-command.js.map