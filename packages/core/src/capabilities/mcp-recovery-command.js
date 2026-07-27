import { executeCapabilityMutation, projectCapabilityMutationReceipt, } from "./capability-mutation-state-machine.js";
import { validateMutationEnvelope } from "./capability-security-boundary.js";
export async function executeMcpRecoveryCommand(input, ports, signal = new AbortController().signal) {
    const baseRevision = ports.currentRevision();
    const rejected = (reasonCode) => ({
        mutationId: input.envelope.mutationId,
        state: "rejected",
        reasonCode,
        allowedActions: [],
        revision: baseRevision,
        mcpRef: input.mcpRef,
        ready: false,
        toolCount: 0,
    });
    if (input.envelope.purpose !== "mcp_recover")
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
    if (!ports.reserveReceipt({ envelope: input.envelope, state: "validating", now: ports.now() }))
        return rejected("mutation_nonce_replayed");
    let toolCount = 0;
    const initial = {
        mutationId: input.envelope.mutationId,
        state: "draft",
        baseRevision,
        targetRevision: input.envelope.targetRevision,
        reasonCode: null,
    };
    const terminal = await executeCapabilityMutation(initial, {
        validate: (current) => ports.inspect(snapshot, current),
        persist: (expectedRevision) => ports.persistRevision({
            internalMcpId: snapshot.internalMcpId,
            expectedRevision,
            targetRevision: input.envelope.targetRevision,
        }),
        apply: (targetRevision, current) => ports.applyTarget({ internalMcpId: snapshot.internalMcpId, targetRevision }, current),
        verify: async (targetRevision, current) => {
            const result = await ports.verifyTarget({ internalMcpId: snapshot.internalMcpId, targetRevision }, current);
            toolCount = result.toolCount;
            return result;
        },
        rollback: (baseRevisionForRollback, current) => ports.rollbackTarget({ internalMcpId: snapshot.internalMcpId, baseRevision: baseRevisionForRollback }, current),
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
        mcpRef: input.mcpRef,
        ready: terminal.state === "active",
        toolCount: terminal.state === "active" ? toolCount : 0,
    };
}
//# sourceMappingURL=mcp-recovery-command.js.map