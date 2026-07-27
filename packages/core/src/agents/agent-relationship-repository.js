import { createHash } from "node:crypto";
import { DEFAULT_KNOWBEE_AGENT_NAME, resolveAgentConfigAgentName, } from "../contracts/sub-agent-orchestration.js";
import { getAgentRelationshipMutationReceiptByNonce, getDb, listAgentConfigs, listAgentRelationships, reserveAgentRelationshipMutationReceipt, updateAgentRelationshipMutationReceipt, upsertAgentRelationship, } from "../db/index.js";
import { createAgentHierarchyService, } from "../orchestration/hierarchy.js";
import { createAgentPublicRef } from "./agent-public-reference.js";
import { buildAgentRelationshipProjection, } from "./agent-relationship-projection.js";
const RELATIONSHIP_PUBLIC_REF_NAMESPACE = "knowbee:agent-relationship:v1:";
export function createAgentRelationshipPublicRef(edgeId) {
    if (!edgeId.trim())
        throw new Error("agent_relationship_public_ref_source_invalid");
    const digest = createHash("sha256")
        .update(RELATIONSHIP_PUBLIC_REF_NAMESPACE)
        .update(edgeId)
        .digest("hex")
        .slice(0, 24);
    return `relationship_v1_${digest}`;
}
export function buildSqliteAgentRelationshipProjection(input) {
    const root = input.config.orchestration.knowbee;
    const rootAgentId = root?.agentId ?? "agent:knowbee";
    const names = new Map();
    for (const row of listAgentConfigs({ includeArchived: true })) {
        try {
            const config = JSON.parse(row.config_json);
            names.set(row.agent_id, resolveAgentConfigAgentName(config));
        }
        catch {
            names.set(row.agent_id, "");
        }
    }
    const rootName = root ? resolveAgentConfigAgentName(root) : DEFAULT_KNOWBEE_AGENT_NAME;
    names.set(rootAgentId, rootName);
    return buildAgentRelationshipProjection({
        rootAgentId,
        rootName,
        relationships: listAgentRelationships().map((row) => ({
            internalEdgeId: row.edge_id,
            parentAgentId: row.parent_agent_id,
            parentName: names.get(row.parent_agent_id) ?? "",
            childAgentId: row.child_agent_id,
            childName: names.get(row.child_agent_id) ?? "",
            status: row.status,
            sortOrder: row.sort_order,
            revision: row.updated_at,
        })),
        observedAt: input.observedAt ?? Date.now(),
        publicRefForAgent: createAgentPublicRef,
        publicRefForRelationship: createAgentRelationshipPublicRef,
    });
}
function graphRevision() {
    return listAgentRelationships().reduce((revision, relationship) => Math.max(revision, relationship.updated_at), 0);
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
export function createSqliteAgentRelationshipCommandPorts(input) {
    const now = input.now ?? Date.now;
    const rootAgentId = input.config.orchestration.knowbee?.agentId ?? "agent:knowbee";
    const hierarchy = () => createAgentHierarchyService({ config: input.config, storage: input.storage, now });
    const currentRelationship = (internalChildAgentId) => {
        const matches = listAgentRelationships({ childAgentId: internalChildAgentId, status: "active" });
        if (matches.length !== 1)
            return null;
        const row = matches[0];
        return row
            ? {
                internalEdgeId: row.edge_id,
                internalParentAgentId: row.parent_agent_id,
                active: true,
                sortOrder: row.sort_order,
            }
            : null;
    };
    const writeRelationship = (write) => {
        const edgeId = write.current?.internalEdgeId ?? `relationship:${write.internalChildAgentId}`;
        const existing = listAgentRelationships().find((row) => row.edge_id === edgeId);
        const relationship = {
            edgeId,
            parentAgentId: write.internalParentAgentId ?? write.current?.internalParentAgentId ?? rootAgentId,
            childAgentId: write.internalChildAgentId,
            relationshipType: "parent_child",
            status: write.internalParentAgentId ? "active" : "disabled",
            sortOrder: write.current?.sortOrder ?? existing?.sort_order ?? 0,
            createdAt: existing?.created_at ?? write.revision,
            updatedAt: write.revision,
        };
        upsertAgentRelationship(relationship, { now: write.revision });
    };
    return {
        now,
        currentRevision: graphRevision,
        receiptByNonce(nonce) {
            const row = getAgentRelationshipMutationReceiptByNonce(nonce);
            const receipt = row ? parseReceipt(row.receipt_json) : null;
            if (!row || !receipt)
                return null;
            return {
                mutationId: row.mutation_id,
                requestFingerprint: row.request_fingerprint,
                receipt,
            };
        },
        reserveReceipt(reservation) {
            return reserveAgentRelationshipMutationReceipt({
                mutationId: reservation.envelope.mutationId,
                nonce: reservation.envelope.nonce,
                actorRef: reservation.envelope.actorRef,
                scope: reservation.envelope.scope,
                purpose: reservation.envelope.purpose,
                mutationKind: reservation.kind,
                targetRevision: reservation.envelope.targetRevision,
                state: reservation.state,
                requestFingerprint: reservation.requestFingerprint,
                now: reservation.now,
            });
        },
        finishReceipt(finish) {
            updateAgentRelationshipMutationReceipt({
                mutationId: finish.mutationId,
                state: finish.state,
                reasonCode: finish.reasonCode,
                receiptJson: JSON.stringify(finish.receipt),
                now: finish.now,
            });
        },
        resolveAgent(agentRef) {
            if (createAgentPublicRef(rootAgentId) === agentRef)
                return { internalAgentId: rootAgentId, active: true, root: true };
            const matches = listAgentConfigs({ includeArchived: true }).filter((row) => createAgentPublicRef(row.agent_id) === agentRef);
            return matches.length === 1 && matches[0]
                ? {
                    internalAgentId: matches[0].agent_id,
                    active: matches[0].status === "enabled",
                    root: false,
                }
                : null;
        },
        currentRelationship,
        validate(validation) {
            if (validation.kind === "disconnect")
                return { ok: true };
            const result = hierarchy().validate({
                edgeId: validation.current?.internalEdgeId ?? `relationship:${validation.internalChildAgentId}`,
                parentAgentId: validation.internalParentAgentId,
                childAgentId: validation.internalChildAgentId,
                relationshipType: "parent_child",
                status: "active",
                sortOrder: validation.current?.sortOrder ?? 0,
            });
            return {
                ok: result.ok,
                ...(result.diagnostics[0]?.reasonCode
                    ? { reasonCode: result.diagnostics[0].reasonCode }
                    : {}),
            };
        },
        persist(persist) {
            let result = {
                ok: false,
                revision: graphRevision(),
                reasonCode: "mutation_revision_conflict",
            };
            getDb().transaction(() => {
                const actualRevision = graphRevision();
                if (actualRevision !== persist.expectedRevision) {
                    result = { ok: false, revision: actualRevision, reasonCode: "mutation_revision_conflict" };
                    return;
                }
                writeRelationship({ ...persist, revision: persist.targetRevision });
                result = { ok: true, revision: persist.targetRevision };
            })();
            return result;
        },
        verify(verification) {
            const current = currentRelationship(verification.internalChildAgentId);
            const row = listAgentRelationships({ childAgentId: verification.internalChildAgentId }).find((relationship) => relationship.updated_at === verification.targetRevision);
            return {
                ok: verification.internalParentAgentId
                    ? current?.internalParentAgentId === verification.internalParentAgentId && Boolean(row)
                    : current === null && Boolean(row?.status === "disabled"),
                reasonCode: "agent_relationship_verify_failed",
            };
        },
        rollback(rollback) {
            const current = currentRelationship(rollback.internalChildAgentId);
            writeRelationship({
                internalChildAgentId: rollback.internalChildAgentId,
                internalParentAgentId: rollback.previous?.internalParentAgentId ?? null,
                current: rollback.previous ?? current,
                revision: rollback.baseRevision,
            });
            return { ok: true };
        },
    };
}
//# sourceMappingURL=agent-relationship-repository.js.map