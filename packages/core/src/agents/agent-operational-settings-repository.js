import { toCanonicalJson } from "../contracts/index.js";
import { compareAndUpdateAgentOperationalSettings, getAgentOperationalSettingsMutationReceiptByNonce, listAgentConfigs, reserveAgentOperationalSettingsMutationReceipt, updateAgentOperationalSettingsMutationReceipt, } from "../db/index.js";
import { createAgentPublicRef } from "./agent-public-reference.js";
function parseAgentConfig(value) {
    try {
        return JSON.parse(value);
    }
    catch {
        return null;
    }
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
function toState(config) {
    return {
        internalAgentId: config.agentId,
        active: config.status === "enabled",
        root: config.agentType === "knowbee",
        revision: config.profileVersion,
        ...(config.modelProfile ? { modelProfile: structuredClone(config.modelProfile) } : {}),
        memoryPolicy: structuredClone(config.memoryPolicy),
        permissionProfile: structuredClone(config.capabilityPolicy.permissionProfile),
    };
}
function sameSettings(left, right) {
    return (left.internalAgentId === right.internalAgentId &&
        left.revision === right.revision &&
        toCanonicalJson(left.modelProfile ?? null) === toCanonicalJson(right.modelProfile ?? null) &&
        toCanonicalJson(left.memoryPolicy) === toCanonicalJson(right.memoryPolicy) &&
        toCanonicalJson(left.permissionProfile) === toCanonicalJson(right.permissionProfile));
}
export function createSqliteAgentOperationalSettingsCommandPorts(input) {
    const now = input.now ?? Date.now;
    const rootAgentId = input.config.orchestration.knowbee?.agentId ?? "agent:knowbee";
    const configByInternalId = (agentId) => {
        if (agentId === rootAgentId && input.config.orchestration.knowbee)
            return input.config.orchestration.knowbee;
        const row = listAgentConfigs({ includeArchived: true }).find((candidate) => candidate.agent_id === agentId);
        return row ? parseAgentConfig(row.config_json) : null;
    };
    const internalIdForRef = (agentRef) => {
        if (createAgentPublicRef(rootAgentId) === agentRef)
            return rootAgentId;
        const matches = listAgentConfigs({ includeArchived: true }).filter((row) => createAgentPublicRef(row.agent_id) === agentRef);
        return matches.length === 1 && matches[0] ? matches[0].agent_id : null;
    };
    return {
        now,
        receiptByNonce(nonce) {
            const row = getAgentOperationalSettingsMutationReceiptByNonce(nonce);
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
            return reserveAgentOperationalSettingsMutationReceipt({
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
            updateAgentOperationalSettingsMutationReceipt({
                mutationId: finish.mutationId,
                state: finish.state,
                reasonCode: finish.reasonCode,
                receiptJson: JSON.stringify(finish.receipt),
                now: finish.now,
            });
        },
        current(agentRef) {
            const agentId = internalIdForRef(agentRef);
            const config = agentId ? configByInternalId(agentId) : null;
            return config ? toState(config) : null;
        },
        persist(persist) {
            const result = compareAndUpdateAgentOperationalSettings({
                agentId: persist.current.internalAgentId,
                expectedRevision: persist.expectedRevision,
                targetRevision: persist.targetRevision,
                ...(persist.next.modelProfile ? { modelProfile: persist.next.modelProfile } : {}),
                memoryPolicy: persist.next.memoryPolicy,
                permissionProfile: persist.next.permissionProfile,
                now: now(),
            });
            return result === "updated"
                ? { ok: true, revision: persist.targetRevision }
                : {
                    ok: false,
                    revision: configByInternalId(persist.current.internalAgentId)?.profileVersion ?? 0,
                    reasonCode: result === "revision_conflict" ? "agent_revision_conflict" : result,
                };
        },
        verify(verification) {
            const config = configByInternalId(verification.internalAgentId);
            const actual = config ? toState(config) : null;
            return {
                ok: Boolean(actual && sameSettings(actual, verification.expected)),
                reasonCode: "agent_operational_settings_verify_failed",
            };
        },
        rollback(rollback) {
            const result = compareAndUpdateAgentOperationalSettings({
                agentId: rollback.previous.internalAgentId,
                expectedRevision: rollback.failedRevision,
                targetRevision: rollback.previous.revision,
                ...(rollback.previous.modelProfile ? { modelProfile: rollback.previous.modelProfile } : {}),
                memoryPolicy: rollback.previous.memoryPolicy,
                permissionProfile: rollback.previous.permissionProfile,
                now: now(),
            });
            return {
                ok: result === "updated",
                ...(result === "updated" ? {} : { reasonCode: `agent_settings_rollback_${result}` }),
            };
        },
    };
}
//# sourceMappingURL=agent-operational-settings-repository.js.map