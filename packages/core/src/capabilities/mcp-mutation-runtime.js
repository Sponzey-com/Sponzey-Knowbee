import { executeMcpLifecycleCommand, } from "./mcp-lifecycle-command.js";
import { executeMcpCreateCommand, executeMcpUpdateCommand, } from "./mcp-mutation-command.js";
import { mergeMcpProtectedUpdate } from "./mcp-protected-update.js";
import { executeMcpRecoveryCommand } from "./mcp-recovery-command.js";
export function createMcpMutationRuntime(input) {
    const common = {
        now: input.receipts.now,
        currentRevision: input.store.currentRevision,
        nonceUsed: input.receipts.nonceUsed,
        reserveReceipt: input.receipts.reserveReceipt,
        updateReceipt: input.receipts.updateReceipt,
    };
    const rollbackOperation = async (persisted, active, signal) => {
        if (!persisted || !active)
            return { ok: false, reasonCode: "mcp_rollback_snapshot_missing" };
        const restored = input.store.rollback(persisted);
        if (!restored.ok)
            return restored;
        return input.runtime.rollback(active, signal);
    };
    return Object.freeze({
        currentRevision: input.store.currentRevision,
        executeCreate: async ({ envelope, draft, signal, }) => {
            let persisted;
            let active;
            return executeMcpCreateCommand({ envelope, draft }, {
                ...common,
                existingNames: () => input.store.listKnownIdentities().map((entry) => entry.displayName),
                existingPublicRefs: () => input.store
                    .listKnownIdentities()
                    .map((entry) => input.publicRefForMcpId(entry.internalMcpId)),
                createInternalMcpId: input.createInternalMcpId,
                publicRefForMcpId: input.publicRefForMcpId,
                inspectConnection: (normalized, currentSignal) => input.inspection.inspect(normalized, currentSignal),
                persist: async ({ internalMcpId, draft: normalized, expectedRevision, targetRevision, }) => {
                    const result = input.store.persist({
                        mode: "create",
                        internalMcpId,
                        draft: normalized,
                        expectedRevision,
                        targetRevision,
                    });
                    persisted = result.rollbackSnapshot;
                    return result;
                },
                apply: async ({ targetRevision }, currentSignal) => {
                    active = input.runtime.capture();
                    return input.runtime.apply({ configuration: input.store.runtimeConfigurationSnapshot(), targetRevision }, currentSignal);
                },
                verify: (verification, currentSignal) => input.runtime.verify(verification, currentSignal),
                rollback: (_rollback, currentSignal) => rollbackOperation(persisted, active, currentSignal),
            }, signal);
        },
        executeUpdate: async ({ envelope, mcpRef, draft, signal, }) => {
            let persisted;
            let active;
            const resolve = (candidate) => {
                const matches = input.store
                    .listEntries()
                    .filter((entry) => input.publicRefForMcpId(entry.internalMcpId) === candidate);
                if (matches.length !== 1)
                    return null;
                const entry = matches[0];
                if (!entry)
                    return null;
                return {
                    internalMcpId: entry.internalMcpId,
                    mcpRef: candidate,
                    draft: entry.draft,
                    revision: input.store.currentRevision(),
                };
            };
            return executeMcpUpdateCommand({ envelope, mcpRef, draft }, {
                ...common,
                resolveMcp: resolve,
                existingNames: () => input.store.listKnownIdentities(),
                inspectConnection: (normalized, currentSignal) => input.inspection.inspect(normalized, currentSignal),
                persist: async ({ snapshot, draft: normalized, expectedRevision, targetRevision }) => {
                    const result = input.store.persist({
                        mode: "update",
                        internalMcpId: snapshot.internalMcpId,
                        draft: normalized,
                        expectedRevision,
                        targetRevision,
                    });
                    persisted = result.rollbackSnapshot;
                    return result;
                },
                apply: async ({ targetRevision }, currentSignal) => {
                    active = input.runtime.capture();
                    return input.runtime.apply({ configuration: input.store.runtimeConfigurationSnapshot(), targetRevision }, currentSignal);
                },
                verify: (verification, currentSignal) => input.runtime.verify(verification, currentSignal),
                rollback: (_rollback, currentSignal) => rollbackOperation(persisted, active, currentSignal),
            }, signal);
        },
        executeProtectedUpdate: async ({ envelope, mcpRef, change, signal, }) => {
            const entry = input.store
                .listEntries()
                .find((candidate) => input.publicRefForMcpId(candidate.internalMcpId) === mcpRef);
            if (!entry)
                return {
                    mutationId: envelope.mutationId,
                    state: "rejected",
                    reasonCode: "mcp_ref_not_found",
                    allowedActions: [],
                    revision: input.store.currentRevision(),
                    mcpRef,
                };
            const merged = mergeMcpProtectedUpdate(entry.draft, change);
            if (!merged.valid || !merged.draft)
                return {
                    mutationId: envelope.mutationId,
                    state: "rejected",
                    reasonCode: merged.reasonCodes[0] ?? "mcp_update_change_invalid",
                    allowedActions: [],
                    revision: input.store.currentRevision(),
                    mcpRef,
                };
            let persisted;
            let active;
            return executeMcpUpdateCommand({ envelope, mcpRef, draft: merged.draft }, {
                ...common,
                resolveMcp: (candidate) => candidate === mcpRef
                    ? {
                        internalMcpId: entry.internalMcpId,
                        mcpRef,
                        draft: entry.draft,
                        revision: input.store.currentRevision(),
                    }
                    : null,
                existingNames: () => input.store.listKnownIdentities(),
                inspectConnection: (normalized, currentSignal) => input.inspection.inspect(normalized, currentSignal),
                persist: async ({ snapshot, draft: normalized, expectedRevision, targetRevision }) => {
                    const result = input.store.persist({
                        mode: "update",
                        internalMcpId: snapshot.internalMcpId,
                        draft: normalized,
                        expectedRevision,
                        targetRevision,
                    });
                    persisted = result.rollbackSnapshot;
                    return result;
                },
                apply: async ({ targetRevision }, currentSignal) => {
                    active = input.runtime.capture();
                    return input.runtime.apply({ configuration: input.store.runtimeConfigurationSnapshot(), targetRevision }, currentSignal);
                },
                verify: (verification, currentSignal) => input.runtime.verify(verification, currentSignal),
                rollback: (_rollback, currentSignal) => rollbackOperation(persisted, active, currentSignal),
            }, signal);
        },
        inspectExisting: async ({ mcpRef, signal, }) => {
            const entry = input.store
                .listEntries()
                .find((candidate) => input.publicRefForMcpId(candidate.internalMcpId) === mcpRef);
            if (!entry)
                return {
                    state: "not_found",
                    ready: false,
                    reasonCode: "mcp_ref_not_found",
                    observedAt: input.receipts.now(),
                };
            const currentSignal = signal ?? new AbortController().signal;
            if (currentSignal.aborted)
                return {
                    state: "cancelled",
                    ready: false,
                    reasonCode: "mcp_probe_cancelled",
                    observedAt: input.receipts.now(),
                };
            const result = await input.inspection.inspect(entry.draft, currentSignal);
            if (currentSignal.aborted)
                return {
                    state: "cancelled",
                    ready: false,
                    reasonCode: "mcp_probe_cancelled",
                    observedAt: input.receipts.now(),
                };
            return result.ok
                ? { state: "ready", ready: true, reasonCode: null, observedAt: input.receipts.now() }
                : {
                    state: "failed",
                    ready: false,
                    reasonCode: result.reasonCode ?? "mcp_connection_probe_failed",
                    observedAt: input.receipts.now(),
                };
        },
        executeLifecycle: async ({ envelope, mcpRef, action, signal, }) => {
            let persisted;
            let active;
            const currentSignal = signal ?? new AbortController().signal;
            return executeMcpLifecycleCommand({ envelope, mcpRef, action }, {
                ...common,
                resolveMcp: (candidate) => {
                    const entry = input.store
                        .listEntries()
                        .find((item) => input.publicRefForMcpId(item.internalMcpId) === candidate);
                    return entry
                        ? {
                            internalMcpId: entry.internalMcpId,
                            mcpRef: candidate,
                            displayName: entry.draft.displayName,
                            status: entry.status ?? "enabled",
                            draft: entry.draft,
                            revision: input.store.currentRevision(),
                        }
                        : null;
                },
                boundAgentNames: (internalMcpId) => input.boundAgentNames?.(internalMcpId) ?? [],
                inspect: (snapshot, current) => input.inspection.inspect(snapshot.draft, current),
                persist: async ({ snapshot, action: requestedAction, expectedRevision, targetRevision, }) => {
                    const result = input.store.persistLifecycle({
                        internalMcpId: snapshot.internalMcpId,
                        action: requestedAction,
                        expectedRevision,
                        targetRevision,
                    });
                    persisted = result.rollbackSnapshot;
                    return result;
                },
                apply: async ({ targetRevision }, current) => {
                    active = input.runtime.capture();
                    return input.runtime.apply({ configuration: input.store.runtimeConfigurationSnapshot(), targetRevision }, current);
                },
                verify: ({ snapshot, action: requestedAction, targetRevision }, current) => input.runtime.verifyLifecycle({ internalMcpId: snapshot.internalMcpId, action: requestedAction, targetRevision }, current),
                rollback: async (_rollback, current) => {
                    const result = await rollbackOperation(persisted, active, current);
                    return result.ok ? result : { ok: false, reasonCode: "mcp_lifecycle_rollback_failed" };
                },
            }, currentSignal);
        },
        executeRecovery: async ({ envelope, mcpRef, signal, }) => {
            let persisted;
            let active;
            const currentSignal = signal ?? new AbortController().signal;
            return executeMcpRecoveryCommand({ envelope, mcpRef }, {
                ...common,
                resolveMcp: (candidate) => {
                    const entry = input.store
                        .listEntries()
                        .find((item) => input.publicRefForMcpId(item.internalMcpId) === candidate);
                    return entry
                        ? {
                            internalMcpId: entry.internalMcpId,
                            mcpRef: candidate,
                            revision: input.store.currentRevision(),
                        }
                        : null;
                },
                inspect: async (snapshot, current) => {
                    const entry = input.store
                        .listEntries()
                        .find((item) => item.internalMcpId === snapshot.internalMcpId);
                    return entry
                        ? input.inspection.inspect(entry.draft, current)
                        : { ok: false, reasonCode: "mcp_ref_not_found" };
                },
                persistRevision: async ({ internalMcpId, expectedRevision, targetRevision }) => {
                    const result = input.store.persistRecovery({
                        internalMcpId,
                        expectedRevision,
                        targetRevision,
                    });
                    persisted = result.rollbackSnapshot;
                    return result;
                },
                applyTarget: async ({ internalMcpId, targetRevision }, current) => {
                    active = input.runtime.captureTarget(internalMcpId);
                    return input.runtime.applyTarget({
                        internalMcpId,
                        configuration: input.store.runtimeConfigurationSnapshot(),
                        targetRevision,
                    }, current);
                },
                verifyTarget: (verification, current) => input.runtime.verifyTarget(verification, current),
                rollbackTarget: async (_rollback, current) => {
                    if (!persisted || !active)
                        return { ok: false, reasonCode: "mcp_recovery_rollback_snapshot_missing" };
                    const restored = input.store.rollback(persisted);
                    if (!restored.ok)
                        return { ok: false, reasonCode: "mcp_recovery_rollback_failed" };
                    const runtimeRestored = await input.runtime.rollbackTarget(active, current);
                    return runtimeRestored.ok
                        ? runtimeRestored
                        : { ok: false, reasonCode: "mcp_recovery_rollback_failed" };
                },
            }, currentSignal);
        },
    });
}
//# sourceMappingURL=mcp-mutation-runtime.js.map