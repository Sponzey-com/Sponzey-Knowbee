import { executeCapabilityMutation, projectCapabilityMutationReceipt } from "./capability-mutation-state-machine.js";
import { validateMutationEnvelope } from "./capability-security-boundary.js";
import { evaluateSkillSourceValidation } from "./skill-source-validation.js";
function rejected(input) {
    return { mutationId: input.mutationId, state: "rejected", reasonCode: input.reasonCode, allowedActions: [], revision: input.revision, skillRef: null };
}
export async function executeSkillCreateCommand(input, ports) {
    const now = ports.now();
    const baseRevision = ports.currentRevision();
    if (input.envelope.purpose !== "skill_create")
        return rejected({ mutationId: input.envelope.mutationId, revision: baseRevision, reasonCode: "mutation_purpose_denied" });
    const envelopeResult = validateMutationEnvelope({ envelope: input.envelope, requiredScope: "capability:write", currentRevision: baseRevision, now, maxAgeMs: 5 * 60_000, usedNonces: new Set(ports.nonceUsed(input.envelope.nonce) ? [input.envelope.nonce] : []) });
    if (!envelopeResult.ok)
        return rejected({ mutationId: input.envelope.mutationId, revision: baseRevision, reasonCode: envelopeResult.diagnostics[0]?.reasonCode ?? "mutation_rejected" });
    if (input.draft.sourceKind === "builtin") {
        return rejected({
            mutationId: input.envelope.mutationId,
            revision: baseRevision,
            reasonCode: "skill_builtin_definition_immutable",
        });
    }
    if (!ports.reserveReceipt({ envelope: input.envelope, state: "validating", now }))
        return rejected({ mutationId: input.envelope.mutationId, revision: baseRevision, reasonCode: "mutation_nonce_replayed" });
    const inspection = ports.inspectSource({ requestedPath: input.draft.requestedPath ?? "" });
    const validation = evaluateSkillSourceValidation({ displayName: input.draft.displayName, sourceKind: input.draft.sourceKind, existingNames: ports.existingNames(), evidenceReasonCodes: inspection.reasonCodes });
    if (!validation.ready) {
        const reasonCode = validation.reasonCodes[0] ?? "skill_source_invalid";
        ports.updateReceipt({ mutationId: input.envelope.mutationId, state: "failed", reasonCode, now: ports.now() });
        return { mutationId: input.envelope.mutationId, state: "failed", reasonCode, allowedActions: [], revision: baseRevision, skillRef: null };
    }
    const internalSkillId = ports.createInternalSkillId();
    const initial = { mutationId: input.envelope.mutationId, state: "draft", baseRevision, targetRevision: input.envelope.targetRevision, reasonCode: null };
    const terminal = await executeCapabilityMutation(initial, {
        validate: async () => ({ ok: true }),
        persist: async (expectedRevision) => {
            return ports.persist({ internalSkillId, skillKind: "instruction_skill", draft: { ...input.draft, displayName: validation.displayName }, ...(inspection.canonicalPath ? { canonicalPath: inspection.canonicalPath } : {}), expectedRevision, targetRevision: input.envelope.targetRevision });
        },
        apply: async (targetRevision) => ports.apply({ internalSkillId, targetRevision }),
        verify: async (targetRevision) => ports.verify({ internalSkillId, targetRevision }),
        rollback: async (rollbackRevision) => ports.rollback({ internalSkillId, baseRevision: rollbackRevision }),
    });
    ports.updateReceipt({ mutationId: input.envelope.mutationId, state: terminal.state, reasonCode: terminal.reasonCode, now: ports.now() });
    const receipt = projectCapabilityMutationReceipt(terminal);
    return { mutationId: receipt.mutationId, state: receipt.state, reasonCode: receipt.reasonCode, allowedActions: receipt.allowedActions, revision: terminal.state === "active" ? terminal.targetRevision : terminal.baseRevision, skillRef: terminal.state === "active" ? ports.publicRefForSkillId(internalSkillId) : null };
}
//# sourceMappingURL=skill-create-command.js.map