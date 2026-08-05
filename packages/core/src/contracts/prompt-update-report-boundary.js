function present(value) {
    return value.trim().length > 0;
}
function validWriteReceipt(receipt) {
    return present(receipt.sourceRef)
        && present(receipt.sourceVersion)
        && present(receipt.sourceChecksum)
        && Number.isSafeInteger(receipt.writtenAt)
        && receipt.writtenAt >= 0
        && present(receipt.evidenceRef);
}
function uniqueNonEmpty(values) {
    const normalized = values.map((value) => value.trim());
    return normalized.length > 0
        && normalized.every(Boolean)
        && new Set(normalized).size === normalized.length;
}
function validValidationFailure(receipt) {
    return present(receipt.sourceRef)
        && present(receipt.proposedVersion)
        && uniqueNonEmpty(receipt.failedCheckIds)
        && uniqueNonEmpty(receipt.evidenceRefs)
        && Number.isSafeInteger(receipt.failedAt)
        && receipt.failedAt >= 0;
}
function validRollbackCompletion(receipt) {
    return present(receipt.sourceRef)
        && present(receipt.rolledBackFromVersion)
        && present(receipt.rolledBackFromChecksum)
        && present(receipt.restoredVersion)
        && present(receipt.restoredChecksum)
        && Number.isSafeInteger(receipt.rolledBackAt)
        && receipt.rolledBackAt >= 0
        && present(receipt.rollbackSourceRef)
        && present(receipt.verificationRef);
}
export function authorizePromptUpdateReport(input) {
    if (input.requestedClaim !== "source_updated_activation_pending"
        && input.requestedClaim !== "source_updated_runtime_loaded"
        && input.requestedClaim !== "source_update_validation_failed"
        && input.requestedClaim !== "source_rolled_back_to_baseline") {
        return { status: "blocked", reasonCode: "generic_update_claim_forbidden" };
    }
    if (input.requestedClaim === "source_update_validation_failed") {
        if (!input.validationFailure || !validValidationFailure(input.validationFailure)) {
            return { status: "blocked", reasonCode: "validation_failure_evidence_invalid" };
        }
        if (input.activation?.status === "authorized") {
            return { status: "blocked", reasonCode: "report_state_mismatch" };
        }
        if (input.write && (!validWriteReceipt(input.write)
            || input.write.sourceRef !== input.validationFailure.sourceRef
            || input.write.sourceVersion !== input.validationFailure.proposedVersion
            || input.validationFailure.failedAt < input.write.writtenAt)) {
            return { status: "blocked", reasonCode: "validation_failure_evidence_invalid" };
        }
        return {
            status: "authorized",
            claimCode: "source_update_validation_failed",
            sourceRef: input.validationFailure.sourceRef,
            proposedVersion: input.validationFailure.proposedVersion,
            activeNow: false,
            failedCheckIds: [...input.validationFailure.failedCheckIds],
            evidenceRefs: [...input.validationFailure.evidenceRefs],
        };
    }
    if (input.requestedClaim === "source_rolled_back_to_baseline") {
        if (!input.rollback || !validRollbackCompletion(input.rollback)) {
            return { status: "blocked", reasonCode: "rollback_evidence_invalid" };
        }
        if (input.rollback.restoredVersion === input.rollback.rolledBackFromVersion
            || input.rollback.restoredChecksum === input.rollback.rolledBackFromChecksum) {
            return { status: "blocked", reasonCode: "rollback_target_invalid" };
        }
        if (input.write && (!validWriteReceipt(input.write)
            || input.rollback.sourceRef !== input.write.sourceRef
            || input.rollback.rolledBackFromVersion !== input.write.sourceVersion
            || input.rollback.rolledBackFromChecksum !== input.write.sourceChecksum)) {
            return { status: "blocked", reasonCode: "rollback_lineage_mismatch" };
        }
        if (input.activation?.status === "authorized"
            && (input.activation.sourceRef !== input.rollback.sourceRef
                || input.activation.sourceVersion !== input.rollback.rolledBackFromVersion)) {
            return { status: "blocked", reasonCode: "rollback_lineage_mismatch" };
        }
        const earliestRollback = Math.max(input.write?.writtenAt ?? 0, input.activation?.status === "authorized" ? input.activation.activatedAt : 0);
        if (input.rollback.rolledBackAt < earliestRollback) {
            return { status: "blocked", reasonCode: "rollback_time_invalid" };
        }
        return {
            status: "authorized",
            claimCode: "source_rolled_back_to_baseline",
            sourceRef: input.rollback.sourceRef,
            rolledBackFromVersion: input.rollback.rolledBackFromVersion,
            restoredVersion: input.rollback.restoredVersion,
            restoredChecksum: input.rollback.restoredChecksum,
            activeNow: false,
            rollbackSourceRef: input.rollback.rollbackSourceRef,
            evidenceRefs: [
                ...(input.write ? [input.write.evidenceRef] : []),
                input.rollback.verificationRef,
            ],
        };
    }
    if (!input.write || !validWriteReceipt(input.write)) {
        return { status: "blocked", reasonCode: "source_write_evidence_invalid" };
    }
    if (input.requestedClaim === "source_updated_activation_pending") {
        if (input.activation?.status === "authorized") {
            return { status: "blocked", reasonCode: "report_state_mismatch" };
        }
        return {
            status: "authorized",
            claimCode: "source_updated_activation_pending",
            sourceRef: input.write.sourceRef,
            sourceVersion: input.write.sourceVersion,
            activeNow: false,
            evidenceRefs: [input.write.evidenceRef],
        };
    }
    if (!input.activation || input.activation.status !== "authorized") {
        return { status: "blocked", reasonCode: "activation_evidence_missing" };
    }
    if (input.activation.sourceRef !== input.write.sourceRef
        || input.activation.sourceVersion !== input.write.sourceVersion) {
        return { status: "blocked", reasonCode: "activation_lineage_mismatch" };
    }
    if (!Number.isSafeInteger(input.activation.activatedAt)
        || input.activation.activatedAt < input.write.writtenAt) {
        return { status: "blocked", reasonCode: "activation_time_invalid" };
    }
    return {
        status: "authorized",
        claimCode: "source_updated_runtime_loaded",
        sourceRef: input.write.sourceRef,
        sourceVersion: input.write.sourceVersion,
        activeNow: true,
        loaderId: input.activation.loaderId,
        activatedAt: input.activation.activatedAt,
        activationMethod: input.activation.method,
        evidenceRefs: [input.write.evidenceRef, ...input.activation.evidenceRefs],
    };
}
export async function publishAuthorizedPromptUpdateReport(input) {
    if (input.decision.status !== "authorized")
        return input.decision;
    return {
        status: "reported",
        text: await input.renderWithLlm(input.decision),
    };
}
//# sourceMappingURL=prompt-update-report-boundary.js.map