import { randomUUID } from "node:crypto";
import { SUB_AGENT_CONTRACT_SCHEMA_VERSION, } from "../contracts/sub-agent-orchestration.js";
import { AgentNameNamespaceError, compareAndUpdateAgentIdentity, getAgentIdentityMutationReceiptByNonce, listAgentCapabilityBindings, listAgentRelationships, saveAgentIdentityMutationReceipt, upsertAgentConfig, } from "../db/index.js";
import { createAgentRegistryService } from "../orchestration/registry.js";
import { createAgentPublicRef } from "./agent-public-reference.js";
function parseReceipt(value) {
    try {
        return JSON.parse(value);
    }
    catch {
        return null;
    }
}
function defaultSubAgent(input) {
    const owner = { ownerType: "sub_agent", ownerId: input.agentId };
    return {
        schemaVersion: SUB_AGENT_CONTRACT_SCHEMA_VERSION,
        agentType: "sub_agent",
        agentId: input.agentId,
        agentName: input.name,
        status: "enabled",
        role: input.role,
        personality: "Follow the assigned role precisely and report results concisely.",
        specialtyTags: [],
        avoidTasks: [],
        memoryPolicy: {
            owner,
            visibility: "private",
            readScopes: [owner],
            writeScope: owner,
            retentionPolicy: "long_term",
            writebackReviewRequired: true,
        },
        capabilityPolicy: {
            permissionProfile: {
                profileId: `permission:${input.agentId}`,
                riskCeiling: "safe",
                approvalRequiredFrom: "external",
                allowExternalNetwork: false,
                allowFilesystemWrite: false,
                allowShellExecution: false,
                allowScreenControl: false,
                allowedPaths: [],
            },
            skillMcpAllowlist: {
                enabledSkillIds: [],
                enabledMcpServerIds: [],
                enabledToolNames: [],
                disabledToolNames: [],
                secretScopeId: input.agentId,
            },
            rateLimit: { maxConcurrentCalls: 1 },
        },
        profileVersion: 1,
        createdAt: input.now,
        updatedAt: input.now,
        teamIds: [],
        delegation: { enabled: false, maxParallelSessions: 1 },
    };
}
export function createSqliteAgentIdentityCommandRepository(input) {
    const registry = createAgentRegistryService({ config: input.config });
    const now = input.now ?? Date.now;
    const configs = () => registry.list();
    const internalIdForRef = (agentRef) => configs().find((candidate) => createAgentPublicRef(candidate.agentId) === agentRef)?.agentId;
    const toRecord = (config) => ({
        agentRef: createAgentPublicRef(config.agentId),
        agentType: config.agentType,
        name: config.agentName,
        role: config.role,
        status: config.status,
        revision: config.profileVersion,
        activeChildCount: listAgentRelationships().filter((edge) => edge.parent_agent_id === config.agentId && edge.status === "active").length,
        activeBindingCount: listAgentCapabilityBindings({ includeArchived: false }).filter((binding) => binding.agent_id === config.agentId && binding.status === "enabled").length,
    });
    return {
        receiptByNonce(nonce) {
            const row = getAgentIdentityMutationReceiptByNonce(nonce);
            return row ? parseReceipt(row.receipt_json) : null;
        },
        recordByRef(agentRef) {
            const agentId = internalIdForRef(agentRef);
            const config = agentId ? registry.get(agentId) : undefined;
            return config ? toRecord(config) : null;
        },
        recordByNormalizedName(normalizedName) {
            const config = configs().find((candidate) => candidate.agentName.normalize("NFKC").trim().toLocaleLowerCase() === normalizedName);
            return config ? toRecord(config) : null;
        },
        create(createInput) {
            const agentId = `agent:${(input.createId ?? randomUUID)()}`;
            try {
                upsertAgentConfig(defaultSubAgent({ agentId, name: createInput.name, role: createInput.role, now: now() }), { source: "manual", now: now() });
            }
            catch (error) {
                if (error instanceof AgentNameNamespaceError)
                    return { reasonCode: error.details.reasonCode };
                return { reasonCode: "agent_persistence_failed" };
            }
            const stored = registry.get(agentId);
            return stored ? toRecord(stored) : { reasonCode: "agent_mutation_verification_failed" };
        },
        compareAndUpdate(updateInput) {
            const agentId = internalIdForRef(updateInput.agentRef);
            if (!agentId)
                return { reasonCode: "agent_ref_not_found" };
            try {
                const result = compareAndUpdateAgentIdentity({
                    agentId,
                    expectedRevision: updateInput.baseRevision,
                    agentName: updateInput.name,
                    role: updateInput.role,
                    now: now(),
                });
                if (result !== "updated")
                    return {
                        reasonCode: result === "revision_conflict" ? "agent_revision_conflict" : "agent_ref_not_found",
                    };
            }
            catch (error) {
                if (error instanceof AgentNameNamespaceError)
                    return { reasonCode: error.details.reasonCode };
                return { reasonCode: "agent_persistence_failed" };
            }
            const stored = registry.get(agentId);
            return stored ? toRecord(stored) : { reasonCode: "agent_mutation_verification_failed" };
        },
        compareAndArchive(archiveInput) {
            const agentId = internalIdForRef(archiveInput.agentRef);
            if (!agentId)
                return { reasonCode: "agent_ref_not_found" };
            const result = compareAndUpdateAgentIdentity({
                agentId,
                expectedRevision: archiveInput.baseRevision,
                archive: true,
                now: now(),
            });
            if (result !== "updated")
                return {
                    reasonCode: result === "revision_conflict" ? "agent_revision_conflict" : "agent_ref_not_found",
                };
            const stored = registry.get(agentId);
            return stored ? toRecord(stored) : { reasonCode: "agent_mutation_verification_failed" };
        },
        saveReceipt(receipt) {
            saveAgentIdentityMutationReceipt({
                mutationId: receipt.mutationId,
                nonce: receipt.nonce,
                requestSignature: receipt.requestSignature,
                mutationKind: receipt.kind,
                state: receipt.state,
                receiptJson: JSON.stringify(receipt),
                now: now(),
            });
        },
    };
}
//# sourceMappingURL=agent-identity-command-repository.js.map