import { executeCapabilityMutation, projectCapabilityMutationReceipt, } from "./capability-mutation-state-machine.js";
import { validateMutationEnvelope, } from "./capability-security-boundary.js";
import { validateMcpConnectionDraft, } from "./mcp-connection-validation.js";
function rejected(input) {
    return {
        mutationId: input.envelope.mutationId,
        state: "rejected",
        reasonCode: input.reasonCode,
        allowedActions: [],
        revision: input.revision,
        mcpRef: input.mcpRef ?? null,
    };
}
function validateEnvelope(input) {
    if (input.envelope.purpose !== input.expectedPurpose)
        return "mutation_purpose_denied";
    const result = validateMutationEnvelope({
        envelope: input.envelope,
        requiredScope: "capability:write",
        currentRevision: input.revision,
        now: input.now,
        maxAgeMs: 5 * 60_000,
        usedNonces: new Set(input.nonceUsed ? [input.envelope.nonce] : []),
    });
    return result.ok ? null : result.diagnostics[0]?.reasonCode ?? "mutation_rejected";
}
function normalizedDraftOrReason(input, existingNames, ownName) {
    const validation = validateMcpConnectionDraft(input);
    if (!validation.valid || !validation.draft) {
        return { reasonCode: validation.reasonCodes[0] ?? "mcp_draft_invalid" };
    }
    const normalizedName = validation.draft.displayName.toLocaleLowerCase();
    if (existingNames.some((name) => name.toLocaleLowerCase() === normalizedName && name !== ownName)) {
        return { reasonCode: "mcp_name_duplicated" };
    }
    return { draft: validation.draft };
}
function sameDraft(left, right) {
    return left.displayName === right.displayName
        && left.transport === right.transport
        && left.command === right.command
        && left.cwd === right.cwd
        && left.required === right.required
        && left.args.length === right.args.length
        && left.args.every((value, index) => value === right.args[index]);
}
export async function executeMcpCreateCommand(input, ports, signal = new AbortController().signal) {
    const now = ports.now();
    const baseRevision = ports.currentRevision();
    const envelopeReason = validateEnvelope({
        envelope: input.envelope,
        expectedPurpose: "mcp_create",
        revision: baseRevision,
        now,
        nonceUsed: ports.nonceUsed(input.envelope.nonce),
    });
    if (envelopeReason)
        return rejected({ envelope: input.envelope, revision: baseRevision, reasonCode: envelopeReason });
    const normalized = normalizedDraftOrReason(input.draft, ports.existingNames());
    if ("reasonCode" in normalized)
        return rejected({ envelope: input.envelope, revision: baseRevision, reasonCode: normalized.reasonCode });
    const internalMcpId = ports.createInternalMcpId();
    const mcpRef = ports.publicRefForMcpId(internalMcpId);
    if (ports.existingPublicRefs().includes(mcpRef)) {
        return rejected({ envelope: input.envelope, revision: baseRevision, reasonCode: "mcp_public_ref_collision" });
    }
    if (!ports.reserveReceipt({ envelope: input.envelope, state: "validating", now })) {
        return rejected({ envelope: input.envelope, revision: baseRevision, reasonCode: "mutation_nonce_replayed" });
    }
    let effectiveDraft = normalized.draft;
    const initial = {
        mutationId: input.envelope.mutationId,
        state: "draft",
        baseRevision,
        targetRevision: input.envelope.targetRevision,
        reasonCode: null,
    };
    const terminal = await executeCapabilityMutation(initial, {
        validate: async (currentSignal) => {
            const inspection = await ports.inspectConnection(effectiveDraft, currentSignal);
            if (inspection.ok && inspection.draft)
                effectiveDraft = inspection.draft;
            return inspection;
        },
        persist: async (expectedRevision, currentSignal) => ports.persist({
            internalMcpId,
            draft: effectiveDraft,
            expectedRevision,
            targetRevision: input.envelope.targetRevision,
        }, currentSignal),
        apply: async (targetRevision, currentSignal) => ports.apply({ internalMcpId, draft: effectiveDraft, targetRevision }, currentSignal),
        verify: async (targetRevision, currentSignal) => ports.verify({ internalMcpId, targetRevision }, currentSignal),
        rollback: async (baseRevisionForRollback, currentSignal) => ports.rollback({ internalMcpId, baseRevision: baseRevisionForRollback }, currentSignal),
    }, signal);
    ports.updateReceipt({ mutationId: input.envelope.mutationId, state: terminal.state, reasonCode: terminal.reasonCode, now: ports.now() });
    const receipt = projectCapabilityMutationReceipt(terminal);
    return {
        mutationId: receipt.mutationId,
        state: receipt.state,
        reasonCode: receipt.reasonCode,
        allowedActions: receipt.allowedActions,
        revision: terminal.state === "active" ? terminal.targetRevision : terminal.baseRevision,
        mcpRef: terminal.state === "active" ? mcpRef : null,
    };
}
export async function executeMcpUpdateCommand(input, ports, signal = new AbortController().signal) {
    const now = ports.now();
    const baseRevision = ports.currentRevision();
    const envelopeReason = validateEnvelope({
        envelope: input.envelope,
        expectedPurpose: "mcp_update",
        revision: baseRevision,
        now,
        nonceUsed: ports.nonceUsed(input.envelope.nonce),
    });
    if (envelopeReason)
        return rejected({ envelope: input.envelope, revision: baseRevision, reasonCode: envelopeReason, mcpRef: input.mcpRef });
    const snapshot = ports.resolveMcp(input.mcpRef);
    if (!snapshot)
        return rejected({ envelope: input.envelope, revision: baseRevision, reasonCode: "mcp_ref_not_found", mcpRef: input.mcpRef });
    const normalized = normalizedDraftOrReason(input.draft, ports.existingNames().filter((item) => item.internalMcpId !== snapshot.internalMcpId).map((item) => item.displayName));
    if ("reasonCode" in normalized)
        return rejected({ envelope: input.envelope, revision: baseRevision, reasonCode: normalized.reasonCode, mcpRef: input.mcpRef });
    if (sameDraft(snapshot.draft, normalized.draft)) {
        return { mutationId: input.envelope.mutationId, state: "active", reasonCode: null, allowedActions: [], revision: baseRevision, mcpRef: input.mcpRef };
    }
    if (!ports.reserveReceipt({ envelope: input.envelope, state: "validating", now })) {
        return rejected({ envelope: input.envelope, revision: baseRevision, reasonCode: "mutation_nonce_replayed", mcpRef: input.mcpRef });
    }
    const initial = {
        mutationId: input.envelope.mutationId,
        state: "draft",
        baseRevision,
        targetRevision: input.envelope.targetRevision,
        reasonCode: null,
    };
    let effectiveDraft = normalized.draft;
    const terminal = await executeCapabilityMutation(initial, {
        validate: async (currentSignal) => {
            const inspection = await ports.inspectConnection(effectiveDraft, currentSignal);
            if (inspection.ok && inspection.draft)
                effectiveDraft = inspection.draft;
            return inspection;
        },
        persist: async (expectedRevision, currentSignal) => ports.persist({ snapshot, draft: effectiveDraft, expectedRevision, targetRevision: input.envelope.targetRevision }, currentSignal),
        apply: async (targetRevision, currentSignal) => ports.apply({ internalMcpId: snapshot.internalMcpId, draft: effectiveDraft, targetRevision }, currentSignal),
        verify: async (targetRevision, currentSignal) => ports.verify({ internalMcpId: snapshot.internalMcpId, targetRevision }, currentSignal),
        rollback: async (baseRevisionForRollback, currentSignal) => ports.rollback({ snapshot, baseRevision: baseRevisionForRollback }, currentSignal),
    }, signal);
    ports.updateReceipt({ mutationId: input.envelope.mutationId, state: terminal.state, reasonCode: terminal.reasonCode, now: ports.now() });
    const receipt = projectCapabilityMutationReceipt(terminal);
    return {
        mutationId: receipt.mutationId,
        state: receipt.state,
        reasonCode: receipt.reasonCode,
        allowedActions: receipt.allowedActions,
        revision: terminal.state === "active" ? terminal.targetRevision : terminal.baseRevision,
        mcpRef: input.mcpRef,
    };
}
//# sourceMappingURL=mcp-mutation-command.js.map