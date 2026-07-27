import { createHash } from "node:crypto";
const SAFE_OPERATOR_EXECUTION_ADMISSION_REF = /^cleanup-deletion-execution-admission:active-tab-info:operator:[a-z0-9][a-z0-9:-]{0,96}$/u;
function buildExecutionAdmissionId(admissionRef) {
    return `cleanup-deletion-execution-admission:active-tab-info:sha256:${createHash("sha256").update(admissionRef).digest("hex")}`;
}
function blocked(input) {
    return {
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-deletion-execution-admission.v1",
        method: "browser.active_tab_info",
        admissionStatus: "blocked",
        reasonCode: input.reasonCode,
        reviewedReceiptStatus: input.reviewedReceiptStatus,
        admissionDecision: "complete_cleanup_deletion_review_receipt",
        nextAllowedAction: input.nextAllowedAction,
        runGitNow: false,
        deleteCodeNow: false,
        modifyPackageNow: false,
        createBranchNow: false,
        releaseReadinessNow: false,
        enableSkillMappingNow: false,
        addProductionBindingNow: false,
    };
}
export function buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionExecutionAdmission(input) {
    if (input.cleanupDeletionReviewReceipt.receiptStatus !== "accepted" ||
        input.cleanupDeletionReviewReceipt.nextAllowedAction !==
            "prepare_cleanup_deletion_execution_admission_after_review_receipt") {
        return blocked({
            reasonCode: "active_tab_info_release_evidence_chain_cleanup_deletion_execution_admission_review_receipt_not_accepted",
            reviewedReceiptStatus: input.cleanupDeletionReviewReceipt.receiptStatus,
            nextAllowedAction: "complete_cleanup_deletion_review_receipt",
        });
    }
    const admissionRef = input.operatorExecutionAdmissionRef?.trim() ?? "";
    if (admissionRef.length === 0) {
        return blocked({
            reasonCode: "active_tab_info_release_evidence_chain_cleanup_deletion_execution_admission_missing_admission_ref",
            reviewedReceiptStatus: "accepted",
            nextAllowedAction: "provide_cleanup_deletion_execution_admission_ref",
        });
    }
    if (!SAFE_OPERATOR_EXECUTION_ADMISSION_REF.test(admissionRef)) {
        return blocked({
            reasonCode: "active_tab_info_release_evidence_chain_cleanup_deletion_execution_admission_admission_ref_invalid",
            reviewedReceiptStatus: "accepted",
            nextAllowedAction: "provide_cleanup_deletion_execution_admission_ref",
        });
    }
    return {
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-deletion-execution-admission.v1",
        method: "browser.active_tab_info",
        admissionStatus: "accepted",
        reasonCode: "active_tab_info_release_evidence_chain_cleanup_deletion_execution_admission_accepted",
        reviewedReceiptStatus: "accepted",
        executionAdmissionId: buildExecutionAdmissionId(admissionRef),
        admissionDecision: "manual_cleanup_deletion_execution_admitted",
        nextAllowedAction: "prepare_cleanup_deletion_dry_run_after_execution_admission",
        runGitNow: false,
        deleteCodeNow: false,
        modifyPackageNow: false,
        createBranchNow: false,
        releaseReadinessNow: false,
        enableSkillMappingNow: false,
        addProductionBindingNow: false,
    };
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-deletion-execution-admission.js.map