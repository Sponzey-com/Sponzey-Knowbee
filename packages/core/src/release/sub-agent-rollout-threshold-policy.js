const THRESHOLD_KEYS = [
    "duplicateFinalAnswerCount",
    "spawnAckP95Ms",
    "hotRegistrySnapshotP95Ms",
    "plannerHotPathP95Ms",
    "firstProgressP95Ms",
    "restartRecoveryP95Ms",
];
const MUTABLE_THRESHOLD_KEYS = THRESHOLD_KEYS.filter((key) => key !== "duplicateFinalAnswerCount");
function snapshotsMatch(left, right) {
    if (!left || typeof left !== "object")
        return false;
    const record = left;
    if (Object.keys(record).length !== THRESHOLD_KEYS.length ||
        Object.keys(record).some((key) => !THRESHOLD_KEYS.includes(key))) {
        return false;
    }
    return THRESHOLD_KEYS.every((key) => record[key] === right[key]);
}
export function validateSubAgentRolloutThresholdPolicy(candidate) {
    if (candidate.schemaVersion !== 1) {
        return { status: "baseline_only", reasonCodes: ["rollout_threshold_schema_unsupported"] };
    }
    if (!candidate.policyId.trim()) {
        return { status: "baseline_only", reasonCodes: ["rollout_threshold_policy_id_required"] };
    }
    if (!Number.isSafeInteger(candidate.policyVersion) || candidate.policyVersion < 1) {
        return { status: "baseline_only", reasonCodes: ["rollout_threshold_policy_version_invalid"] };
    }
    if (candidate.releaseMode !== "limited_beta" && candidate.releaseMode !== "full_enable") {
        return { status: "baseline_only", reasonCodes: ["rollout_threshold_release_mode_invalid"] };
    }
    if (!candidate.thresholds || typeof candidate.thresholds !== "object") {
        return { status: "baseline_only", reasonCodes: ["rollout_threshold_snapshot_required"] };
    }
    const unknownKey = Object.keys(candidate.thresholds).find((key) => !THRESHOLD_KEYS.includes(key));
    if (unknownKey) {
        return {
            status: "baseline_only",
            reasonCodes: [`rollout_threshold_unknown:${unknownKey}`],
        };
    }
    if (candidate.thresholds.duplicateFinalAnswerCount !== 0) {
        return {
            status: "baseline_only",
            reasonCodes: ["rollout_threshold_duplicate_final_must_be_zero"],
        };
    }
    for (const key of MUTABLE_THRESHOLD_KEYS) {
        const value = candidate.thresholds[key];
        if (!Number.isSafeInteger(value) || value < 0) {
            return {
                status: "baseline_only",
                reasonCodes: [`rollout_threshold_invalid:${key}`],
            };
        }
    }
    const thresholds = Object.freeze({ ...candidate.thresholds });
    return {
        status: "valid",
        candidate: Object.freeze({
            ...candidate,
            policyId: candidate.policyId.trim(),
            thresholds,
        }),
    };
}
export function activateSubAgentRolloutThresholdPolicy(input) {
    const validation = validateSubAgentRolloutThresholdPolicy(input.candidate);
    if (validation.status === "baseline_only")
        return validation;
    const receipt = input.authorizationPort.resolve(validation.candidate);
    if (!receipt) {
        return { status: "baseline_only", reasonCodes: ["rollout_threshold_authorization_missing"] };
    }
    if (receipt.schemaVersion !== 1) {
        return {
            status: "baseline_only",
            reasonCodes: ["rollout_threshold_authorization_schema_unsupported"],
        };
    }
    if (receipt.decision !== "approved") {
        return {
            status: "baseline_only",
            reasonCodes: ["rollout_threshold_authorization_not_approved"],
        };
    }
    if (receipt.actorType !== "administrator" || !receipt.actorId.trim()) {
        return {
            status: "baseline_only",
            reasonCodes: ["rollout_threshold_authorization_actor_invalid"],
        };
    }
    if (receipt.scope !== "sub_agent_rollout_thresholds") {
        return {
            status: "baseline_only",
            reasonCodes: ["rollout_threshold_authorization_scope_invalid"],
        };
    }
    if (!receipt.authorizationId.trim() ||
        !Number.isSafeInteger(receipt.approvedAt) ||
        receipt.approvedAt < 0) {
        return {
            status: "baseline_only",
            reasonCodes: ["rollout_threshold_authorization_receipt_invalid"],
        };
    }
    if (receipt.policyId !== validation.candidate.policyId ||
        receipt.policyVersion !== validation.candidate.policyVersion ||
        receipt.releaseMode !== validation.candidate.releaseMode ||
        !snapshotsMatch(receipt.thresholdSnapshot, validation.candidate.thresholds)) {
        return {
            status: "baseline_only",
            reasonCodes: ["rollout_threshold_authorization_binding_mismatch"],
        };
    }
    return {
        status: "active",
        policy: Object.freeze({
            candidate: validation.candidate,
            authorization: Object.freeze({
                ...receipt,
                actorId: receipt.actorId.trim(),
                authorizationId: receipt.authorizationId.trim(),
                thresholdSnapshot: Object.freeze({ ...validation.candidate.thresholds }),
            }),
        }),
    };
}
//# sourceMappingURL=sub-agent-rollout-threshold-policy.js.map