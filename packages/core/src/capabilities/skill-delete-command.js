import { executeCapabilityMutation, projectCapabilityMutationReceipt } from "./capability-mutation-state-machine.js";
import { validateMutationEnvelope } from "./capability-security-boundary.js";
export async function executeSkillDeleteCommand(input, ports) {
    const now = ports.now();
    const baseRevision = ports.currentRevision();
    const base = (reasonCode, impact = { bindingCount: 0, agentNames: [] }) => ({ mutationId: input.envelope.mutationId, state: "rejected", reasonCode, allowedActions: [], revision: baseRevision, skillRef: input.skillRef, deleted: false, impact });
    if (input.envelope.purpose !== "skill_delete")
        return base("mutation_purpose_denied");
    const envelopeResult = validateMutationEnvelope({ envelope: input.envelope, requiredScope: "capability:write", currentRevision: baseRevision, now, maxAgeMs: 5 * 60_000, usedNonces: new Set(ports.nonceUsed(input.envelope.nonce) ? [input.envelope.nonce] : []) });
    if (!envelopeResult.ok)
        return base(envelopeResult.diagnostics[0]?.reasonCode ?? "mutation_rejected");
    const snapshot = ports.resolveSkill(input.skillRef);
    if (!snapshot)
        return base("skill_ref_not_found");
    if (snapshot.sourceKind === "builtin") {
        return base("skill_builtin_definition_immutable");
    }
    const agentNames = [...ports.boundAgentNames(snapshot.internalSkillId)].map((name) => name.trim()).filter(Boolean).sort((a, b) => a.localeCompare(b));
    const impact = { bindingCount: agentNames.length, agentNames };
    if (impact.bindingCount > 0)
        return base("skill_delete_in_use", impact);
    if (!ports.reserveReceipt({ envelope: input.envelope, state: "validating", now }))
        return base("mutation_nonce_replayed");
    const initial = { mutationId: input.envelope.mutationId, state: "draft", baseRevision, targetRevision: input.envelope.targetRevision, reasonCode: null };
    const terminal = await executeCapabilityMutation(initial, {
        validate: async () => ({ ok: true }),
        persist: async (expectedRevision) => ports.persistArchive({ snapshot, expectedRevision, targetRevision: input.envelope.targetRevision }),
        apply: async () => ({ ok: true }),
        verify: async (targetRevision) => ports.verifyArchived({ internalSkillId: snapshot.internalSkillId, targetRevision }),
        rollback: async (baseRevisionForRollback) => ports.rollback({ snapshot, baseRevision: baseRevisionForRollback }),
    });
    ports.updateReceipt({ mutationId: input.envelope.mutationId, state: terminal.state, reasonCode: terminal.reasonCode, now: ports.now() });
    const receipt = projectCapabilityMutationReceipt(terminal);
    return { mutationId: receipt.mutationId, state: receipt.state, reasonCode: receipt.reasonCode, allowedActions: receipt.allowedActions, revision: terminal.state === "active" ? terminal.targetRevision : terminal.baseRevision, skillRef: input.skillRef, deleted: terminal.state === "active", impact };
}
//# sourceMappingURL=skill-delete-command.js.map