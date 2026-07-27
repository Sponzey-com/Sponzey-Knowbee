import { createHash } from "node:crypto";
const SAFE_OPERATOR_ACKNOWLEDGEMENT_REF = /^cleanup-deletion-dry-run-acknowledgement:active-tab-info:sanitized:[a-z0-9][a-z0-9:-]{0,96}$/u;
const SAFE_PRODUCT_LOG_EVIDENCE_REF = /^product-log:active-tab-info:evidence:[a-z0-9][a-z0-9:-]{0,96}$/u;
const SAFE_OPERATOR_REVIEW_ACKNOWLEDGEMENT_REF = /^cleanup-deletion-dry-run-review-acknowledgement:active-tab-info:sanitized:[a-z0-9][a-z0-9:-]{0,96}$/u;
function buildReceiptId(input) {
    return `operator-cleanup-deletion-dry-run-review-acknowledgement-receipt:active-tab-info:sha256:${createHash("sha256").update(JSON.stringify(input)).digest("hex")}`;
}
function blocked(input) {
    return {
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-deletion-dry-run-review-acknowledgement-receipt.v1",
        method: "browser.active_tab_info",
        receiptStatus: "blocked",
        reasonCode: input.reasonCode,
        reviewedDryRunStatus: input.reviewedDryRunStatus,
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
export function buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionDryRunReviewAcknowledgementReceipt(input) {
    const dryRunReceipt = input.cleanupDeletionDryRunReceipt;
    if (dryRunReceipt.dryRunStatus !== "ready" ||
        dryRunReceipt.reasonCode !==
            "active_tab_info_release_evidence_chain_cleanup_deletion_dry_run_receipt_ready" ||
        dryRunReceipt.nextAllowedAction !== "review_cleanup_deletion_dry_run_receipt" ||
        dryRunReceipt.dryRunReceiptId === undefined) {
        return blocked({
            reasonCode: "active_tab_info_release_evidence_chain_cleanup_deletion_dry_run_review_acknowledgement_receipt_dry_run_not_ready",
            reviewedDryRunStatus: dryRunReceipt.dryRunStatus,
            nextAllowedAction: "complete_cleanup_deletion_dry_run_receipt",
        });
    }
    const operatorAcknowledgementRef = input.sanitizedOperatorAcknowledgementRef?.trim() ?? "";
    if (operatorAcknowledgementRef.length === 0) {
        return blocked({
            reasonCode: "active_tab_info_release_evidence_chain_cleanup_deletion_dry_run_review_acknowledgement_receipt_missing_operator_acknowledgement_ref",
            reviewedDryRunStatus: "ready",
            nextAllowedAction: "provide_operator_cleanup_deletion_dry_run_acknowledgement_ref",
        });
    }
    if (!SAFE_OPERATOR_ACKNOWLEDGEMENT_REF.test(operatorAcknowledgementRef)) {
        return blocked({
            reasonCode: "active_tab_info_release_evidence_chain_cleanup_deletion_dry_run_review_acknowledgement_receipt_operator_acknowledgement_ref_invalid",
            reviewedDryRunStatus: "ready",
            nextAllowedAction: "provide_operator_cleanup_deletion_dry_run_acknowledgement_ref",
        });
    }
    const productLogEvidenceRef = input.productLogEvidenceRef?.trim() ?? "";
    if (productLogEvidenceRef.length === 0) {
        return blocked({
            reasonCode: "active_tab_info_release_evidence_chain_cleanup_deletion_dry_run_review_acknowledgement_receipt_missing_product_log_evidence_ref",
            reviewedDryRunStatus: "ready",
            nextAllowedAction: "provide_cleanup_deletion_dry_run_product_log_evidence_ref",
        });
    }
    if (!SAFE_PRODUCT_LOG_EVIDENCE_REF.test(productLogEvidenceRef)) {
        return blocked({
            reasonCode: "active_tab_info_release_evidence_chain_cleanup_deletion_dry_run_review_acknowledgement_receipt_product_log_evidence_ref_invalid",
            reviewedDryRunStatus: "ready",
            nextAllowedAction: "provide_cleanup_deletion_dry_run_product_log_evidence_ref",
        });
    }
    const operatorReviewAcknowledgementRef = input.operatorReviewAcknowledgementRef?.trim() ?? "";
    if (operatorReviewAcknowledgementRef.length === 0) {
        return blocked({
            reasonCode: "active_tab_info_release_evidence_chain_cleanup_deletion_dry_run_review_acknowledgement_receipt_missing_operator_review_acknowledgement_ref",
            reviewedDryRunStatus: "ready",
            nextAllowedAction: "provide_cleanup_deletion_dry_run_operator_review_acknowledgement_ref",
        });
    }
    if (!SAFE_OPERATOR_REVIEW_ACKNOWLEDGEMENT_REF.test(operatorReviewAcknowledgementRef)) {
        return blocked({
            reasonCode: "active_tab_info_release_evidence_chain_cleanup_deletion_dry_run_review_acknowledgement_receipt_operator_review_acknowledgement_ref_invalid",
            reviewedDryRunStatus: "ready",
            nextAllowedAction: "provide_cleanup_deletion_dry_run_operator_review_acknowledgement_ref",
        });
    }
    return {
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-deletion-dry-run-review-acknowledgement-receipt.v1",
        method: "browser.active_tab_info",
        receiptStatus: "accepted",
        reasonCode: "active_tab_info_release_evidence_chain_cleanup_deletion_dry_run_review_acknowledgement_receipt_accepted",
        reviewedDryRunStatus: "ready",
        operatorCleanupDeletionDryRunReviewAcknowledgementReceiptId: buildReceiptId({
            dryRunReceiptId: dryRunReceipt.dryRunReceiptId,
            operatorAcknowledgementRef,
            productLogEvidenceRef,
            operatorReviewAcknowledgementRef,
        }),
        nextAllowedAction: "retain_cleanup_deletion_dry_run_review_acknowledgement_for_audit",
        runGitNow: false,
        deleteCodeNow: false,
        modifyPackageNow: false,
        createBranchNow: false,
        releaseReadinessNow: false,
        enableSkillMappingNow: false,
        addProductionBindingNow: false,
    };
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-deletion-dry-run-review-acknowledgement-receipt.js.map