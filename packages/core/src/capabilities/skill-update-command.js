import { executeCapabilityMutation, projectCapabilityMutationReceipt } from "./capability-mutation-state-machine.js";
import { validateMutationEnvelope } from "./capability-security-boundary.js";
function rejected(input) {
    return { mutationId: input.mutationId, state: "rejected", reasonCode: input.reasonCode, allowedActions: [], revision: input.revision, skillRef: input.skillRef ?? null };
}
export async function executeSkillUpdateCommand(input, ports) {
    const now = ports.now();
    const baseRevision = ports.currentRevision();
    if (input.envelope.purpose !== "skill_update")
        return rejected({ mutationId: input.envelope.mutationId, revision: baseRevision, reasonCode: "mutation_purpose_denied", skillRef: input.skillRef });
    if ("sourceKind" in input.change || "requestedPath" in input.change)
        return rejected({ mutationId: input.envelope.mutationId, revision: baseRevision, reasonCode: "skill_source_change_denied", skillRef: input.skillRef });
    const envelopeResult = validateMutationEnvelope({ envelope: input.envelope, requiredScope: "capability:write", currentRevision: baseRevision, now, maxAgeMs: 5 * 60_000, usedNonces: new Set(ports.nonceUsed(input.envelope.nonce) ? [input.envelope.nonce] : []) });
    if (!envelopeResult.ok)
        return rejected({ mutationId: input.envelope.mutationId, revision: baseRevision, reasonCode: envelopeResult.diagnostics[0]?.reasonCode ?? "mutation_rejected", skillRef: input.skillRef });
    const snapshot = ports.resolveSkill(input.skillRef);
    if (!snapshot)
        return rejected({ mutationId: input.envelope.mutationId, revision: baseRevision, reasonCode: "skill_ref_not_found" });
    if (snapshot.sourceKind === "builtin") {
        return rejected({
            mutationId: input.envelope.mutationId,
            revision: baseRevision,
            reasonCode: "skill_builtin_definition_immutable",
            skillRef: input.skillRef,
        });
    }
    if (!ports.reserveReceipt({ envelope: input.envelope, state: "validating", now }))
        return rejected({ mutationId: input.envelope.mutationId, revision: baseRevision, reasonCode: "mutation_nonce_replayed", skillRef: input.skillRef });
    const displayName = (input.change.displayName ?? snapshot.displayName).trim();
    const description = (input.change.description ?? snapshot.description).trim();
    const runtimeStatus = input.change.runtimeStatus ?? snapshot.runtimeStatus;
    const nameMissing = !displayName;
    const nameDuplicated = ports.existingNames().some((entry) => entry.internalSkillId !== snapshot.internalSkillId && entry.displayName.trim().toLocaleLowerCase() === displayName.toLocaleLowerCase());
    const unchanged = !nameMissing && !nameDuplicated && displayName === snapshot.displayName && description === snapshot.description && runtimeStatus === snapshot.runtimeStatus;
    if (unchanged) {
        ports.updateReceipt({ mutationId: input.envelope.mutationId, state: "active", reasonCode: null, now: ports.now() });
        return { mutationId: input.envelope.mutationId, state: "active", reasonCode: null, allowedActions: [], revision: baseRevision, skillRef: input.skillRef };
    }
    const initial = { mutationId: input.envelope.mutationId, state: "draft", baseRevision, targetRevision: input.envelope.targetRevision, reasonCode: null };
    const terminal = await executeCapabilityMutation(initial, {
        validate: async () => nameMissing ? { ok: false, reasonCode: "skill_name_missing" } : nameDuplicated ? { ok: false, reasonCode: "skill_name_duplicated" } : { ok: true },
        persist: async (expectedRevision) => {
            return ports.persist({ internalSkillId: snapshot.internalSkillId, displayName, description, runtimeStatus, expectedRevision, targetRevision: input.envelope.targetRevision });
        },
        apply: async (targetRevision) => ports.apply({ internalSkillId: snapshot.internalSkillId, runtimeStatus, targetRevision }),
        verify: async (targetRevision) => ports.verify({ internalSkillId: snapshot.internalSkillId, displayName, description, runtimeStatus, targetRevision }),
        rollback: async (baseRevisionForRollback) => ports.rollback({ snapshot, baseRevision: baseRevisionForRollback }),
    });
    ports.updateReceipt({ mutationId: input.envelope.mutationId, state: terminal.state, reasonCode: terminal.reasonCode, now: ports.now() });
    const receipt = projectCapabilityMutationReceipt(terminal);
    return { mutationId: receipt.mutationId, state: receipt.state, reasonCode: receipt.reasonCode, allowedActions: receipt.allowedActions, revision: terminal.state === "active" ? terminal.targetRevision : terminal.baseRevision, skillRef: input.skillRef };
}
//# sourceMappingURL=skill-update-command.js.map