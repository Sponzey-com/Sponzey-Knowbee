import { createMcpPublicRef } from "../capabilities/mcp-public-reference.js";
import { createSkillPublicRef } from "../capabilities/skill-public-reference.js";
import { createYeonjangPublicRef } from "../capabilities/yeonjang-public-reference.js";
import { getCapabilityMutationReceiptByNonce, getDb, listAgentCapabilityBindings, listAgentConfigs, listMcpServerCatalogEntries, listSkillCatalogEntries, reserveCapabilityMutationReceipt, updateCapabilityMutationReceipt, upsertAgentCapabilityBinding, } from "../db/index.js";
import { listYeonjangRegistryInstances } from "../yeonjang/registry.js";
import { createAgentPublicRef } from "./agent-public-reference.js";
function publicRef(kind, internalId) {
    if (kind === "skill")
        return createSkillPublicRef(internalId);
    if (kind === "mcp_server")
        return createMcpPublicRef(internalId);
    return createYeonjangPublicRef(internalId);
}
function parseReceipt(value) {
    if (!value)
        return null;
    try {
        return JSON.parse(value);
    }
    catch {
        return null;
    }
}
export function listAgentCapabilityCatalogSources(now = Date.now()) {
    const skills = listSkillCatalogEntries({
        includeArchived: true,
    }).map((row) => ({
        internalId: row.skill_id,
        kind: "skill",
        displayName: row.display_name,
        catalogStatus: row.status,
        runtimeStatus: row.status === "enabled" ? "ready" : "unavailable",
        revision: row.updated_at,
    }));
    const mcpServers = listMcpServerCatalogEntries({
        includeArchived: true,
    }).map((row) => ({
        internalId: row.mcp_server_id,
        kind: "mcp_server",
        displayName: row.display_name,
        catalogStatus: row.status,
        runtimeStatus: row.status === "enabled" ? "unknown" : "unavailable",
        revision: row.updated_at,
    }));
    const yeonjang = listYeonjangRegistryInstances({ now }).map((instance) => ({
        internalId: instance.instanceId,
        kind: "yeonjang",
        displayName: instance.displayName,
        catalogStatus: instance.trustState === "revoked" ? "disabled" : "enabled",
        runtimeStatus: instance.runnableTarget
            ? "ready"
            : instance.state === "degraded" || instance.state === "permission_required"
                ? "degraded"
                : "unavailable",
        revision: instance.lastSeenAt ?? 0,
    }));
    return [...skills, ...mcpServers, ...yeonjang];
}
export function listAgentCapabilityBindingSources() {
    return listAgentCapabilityBindings({ includeArchived: true }).map((row) => ({
        agentId: row.agent_id,
        kind: row.capability_kind,
        catalogId: row.catalog_id,
        status: row.status,
        revision: row.updated_at,
    }));
}
function kindRevision(kind, now) {
    const catalogRevision = listAgentCapabilityCatalogSources(now)
        .filter((item) => item.kind === kind)
        .reduce((revision, item) => Math.max(revision, item.revision), 0);
    const bindingRevision = listAgentCapabilityBindingSources()
        .filter((item) => item.kind === kind)
        .reduce((revision, item) => Math.max(revision, item.revision), 0);
    return Math.max(catalogRevision, bindingRevision);
}
export function resolveInternalAgentId(agentRef) {
    const matches = listAgentConfigs({ includeArchived: true }).filter((row) => createAgentPublicRef(row.agent_id) === agentRef);
    return matches.length === 1 ? (matches[0]?.agent_id ?? null) : null;
}
export function createSqliteAgentCapabilityBindingCommandPorts(input = {}) {
    const now = input.now ?? Date.now;
    const resolveCapability = (kind, capabilityRef) => {
        const matches = listAgentCapabilityCatalogSources(now()).filter((item) => item.kind === kind && publicRef(kind, item.internalId) === capabilityRef);
        if (matches.length !== 1)
            return null;
        const item = matches[0];
        return item
            ? {
                internalCapabilityId: item.internalId,
                active: item.catalogStatus === "enabled" && item.runtimeStatus !== "unavailable",
            }
            : null;
    };
    const writeBinding = (write) => {
        const existing = listAgentCapabilityBindings({
            agentId: write.internalAgentId,
            capabilityKind: write.kind,
            includeArchived: true,
        }).find((row) => row.catalog_id === write.internalCapabilityId);
        upsertAgentCapabilityBinding({
            ...(existing
                ? {
                    bindingId: existing.binding_id,
                    ...(existing.secret_scope_id ? { secretScopeId: existing.secret_scope_id } : {}),
                    enabledToolNames: JSON.parse(existing.enabled_tool_names_json),
                    disabledToolNames: JSON.parse(existing.disabled_tool_names_json),
                    createdAt: existing.created_at,
                }
                : {}),
            agentId: write.internalAgentId,
            capabilityKind: write.kind,
            catalogId: write.internalCapabilityId,
            status: write.enabled ? "enabled" : "disabled",
            updatedAt: write.revision,
        }, { source: "manual", now: write.revision });
    };
    return {
        now,
        currentRevision: (kind) => kindRevision(kind, now()),
        receiptByNonce(nonce) {
            const row = getCapabilityMutationReceiptByNonce(nonce);
            const receipt = row ? parseReceipt(row.receipt_json) : null;
            if (!row?.request_fingerprint || !receipt)
                return null;
            return {
                mutationId: row.mutation_id,
                requestFingerprint: row.request_fingerprint,
                receipt,
            };
        },
        reserveReceipt(reservation) {
            return reserveCapabilityMutationReceipt({
                mutationId: reservation.envelope.mutationId,
                nonce: reservation.envelope.nonce,
                actorRef: reservation.envelope.actorRef,
                scope: reservation.envelope.scope,
                purpose: reservation.envelope.purpose,
                capabilityKind: reservation.kind,
                targetRevision: reservation.envelope.targetRevision,
                state: reservation.state,
                requestFingerprint: reservation.requestFingerprint,
                now: reservation.now,
            });
        },
        finishReceipt(finish) {
            updateCapabilityMutationReceipt({
                mutationId: finish.mutationId,
                state: finish.state,
                reasonCode: finish.reasonCode,
                receiptJson: JSON.stringify(finish.receipt),
                now: finish.now,
            });
        },
        resolveCapability,
        resolveAgent(agentRef) {
            const matches = listAgentConfigs({ includeArchived: true }).filter((row) => createAgentPublicRef(row.agent_id) === agentRef);
            return matches.length === 1 && matches[0]
                ? {
                    internalAgentId: matches[0].agent_id,
                    active: matches[0].status === "enabled",
                }
                : null;
        },
        bindingEnabled(binding) {
            return listAgentCapabilityBindings({
                agentId: binding.internalAgentId,
                capabilityKind: binding.kind,
                includeArchived: true,
            }).some((row) => row.catalog_id === binding.internalCapabilityId && row.status === "enabled");
        },
        persist(persist) {
            let result = {
                ok: false,
                revision: kindRevision(persist.kind, now()),
                reasonCode: "mutation_revision_conflict",
            };
            getDb().transaction(() => {
                const actualRevision = kindRevision(persist.kind, now());
                if (actualRevision !== persist.expectedRevision) {
                    result = { ok: false, revision: actualRevision, reasonCode: "mutation_revision_conflict" };
                    return;
                }
                writeBinding({ ...persist, revision: persist.targetRevision });
                result = { ok: true, revision: persist.targetRevision };
            })();
            return result;
        },
        verify(verify) {
            const binding = listAgentCapabilityBindings({
                agentId: verify.internalAgentId,
                capabilityKind: verify.kind,
                includeArchived: true,
            }).find((row) => row.catalog_id === verify.internalCapabilityId);
            return {
                ok: Boolean(binding &&
                    (binding.status === "enabled") === verify.enabled &&
                    binding.updated_at === verify.targetRevision),
                reasonCode: "agent_capability_binding_verify_failed",
            };
        },
        rollback(rollback) {
            writeBinding({ ...rollback, revision: rollback.baseRevision });
            return { ok: true };
        },
    };
}
export function capabilityPublicRef(kind, internalId) {
    return publicRef(kind, internalId);
}
//# sourceMappingURL=agent-capability-binding-repository.js.map