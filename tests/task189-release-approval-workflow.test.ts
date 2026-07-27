import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { REQUIRED_REPRESENTATIVE_FLOW_IDS } from "../packages/core/src/maintenance/performance-baseline.ts"
import { SUB_AGENT_OPERATIONAL_REFERENCE_THRESHOLDS } from "../packages/core/src/release/sub-agent-release-gate.ts"

const require = createRequire(import.meta.url)
type BetterSqlite3Module = typeof import("better-sqlite3")
const BetterSqlite3 = require("../packages/core/node_modules/better-sqlite3") as BetterSqlite3Module
const tempDirs: string[] = []
const ACTIVE_TAB_INFO_AUDIT_CHECKSUM = "a".repeat(64)
const MANUAL_REVIEW_CHECKSUM = `sha256:${"b".repeat(64)}`
const MANUAL_REVIEWER_HASH = `sha256:${"c".repeat(64)}`
const MANUAL_REVIEW_ID_HASH = `sha256:${"d".repeat(64)}`

function createDirectory(prefix: string) {
  const directory = mkdtempSync(join(tmpdir(), prefix))
  tempDirs.push(directory)
  return directory
}

function createReleaseEvidenceDatabase(path: string) {
  const database = new BetterSqlite3(path)
  database.exec(`
    CREATE TABLE release_policy_authorizations (
      sequence_id INTEGER PRIMARY KEY AUTOINCREMENT,
      authorization_id TEXT NOT NULL UNIQUE,
      schema_version INTEGER NOT NULL,
      decision TEXT NOT NULL,
      actor_type TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      authentication_id TEXT NOT NULL,
      scope TEXT NOT NULL,
      policy_id TEXT NOT NULL,
      policy_version INTEGER NOT NULL,
      release_mode TEXT NOT NULL,
      threshold_snapshot_json TEXT NOT NULL,
      decided_at INTEGER NOT NULL
    );
    CREATE TABLE performance_acceptance_authorizations (
      sequence_id INTEGER PRIMARY KEY AUTOINCREMENT,
      authorization_id TEXT NOT NULL UNIQUE,
      schema_version INTEGER NOT NULL,
      decision TEXT NOT NULL,
      actor_type TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      authentication_id TEXT NOT NULL,
      scope TEXT NOT NULL,
      matrix_id TEXT NOT NULL,
      matrix_version INTEGER NOT NULL,
      baseline_version TEXT NOT NULL,
      threshold_snapshot_json TEXT NOT NULL,
      baseline_snapshot_json TEXT,
      decided_at INTEGER NOT NULL
    );
    CREATE TABLE root_runs (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE orchestration_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT,
      source TEXT NOT NULL,
      event_kind TEXT NOT NULL,
      payload_redacted_json TEXT NOT NULL
    );
    CREATE TABLE queue_backpressure_events (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      queue_name TEXT NOT NULL,
      event_kind TEXT NOT NULL,
      run_id TEXT,
      recovery_key TEXT
    );
  `)
  return database
}

function performanceCandidate() {
  const baselineVersion = "performance-baseline:task189"
  return {
    schemaVersion: 1,
    matrixId: "performance-matrix:task189",
    matrixVersion: 1,
    baselineVersion,
    baselineSnapshot: {
      schemaVersion: 1,
      baselineVersion,
      flows: REQUIRED_REPRESENTATIVE_FLOW_IDS.map((flowId) => ({
        flowId,
        latencyP95Ms: 100,
        llmCallCount: 0,
        attemptCount: 1,
      })),
    },
    thresholds: Object.fromEntries(
      REQUIRED_REPRESENTATIVE_FLOW_IDS.map((flowId) => [
        flowId,
        { maxLatencyRegressionRatio: 2, maxLlmCallIncrease: 0, maxAttemptIncrease: 0 },
      ]),
    ),
    releaseApprovalEvidence: releaseApprovalEvidence(),
  }
}

function rolloutCandidate() {
  return {
    schemaVersion: 1,
    policyId: "rollout-policy:task189",
    policyVersion: 1,
    releaseMode: "limited_beta",
    thresholds: { ...SUB_AGENT_OPERATIONAL_REFERENCE_THRESHOLDS },
    releaseApprovalEvidence: releaseApprovalEvidence(),
  }
}

function releaseApprovalEvidence(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "knowbee.release-approval-evidence.v1",
    readiness: {
      status: "blocked",
      blockerCodes: ["live_acceptance_failed"],
    },
    activeTabInfoAuditArtifact: {
      id: "yeonjang:browser-active-tab-info:evidence",
      checksum: ACTIVE_TAB_INFO_AUDIT_CHECKSUM,
      packagePath: "audit/yeonjang/browser-active-tab-info-evidence.json",
    },
    activeTabInfoEvidenceCompleteness: {
      missingSourceCount: 0,
      missingTestCount: 0,
      staleTestCount: 0,
      rejectedSkippedTestCount: 0,
      rejectedUnknownTestCount: 0,
      rejectedPublicRawReportCount: 0,
      failingTestCount: 0,
    },
    ...overrides,
  }
}

function manualReviewProjection() {
  return {
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-live-enable-review-projection.v1",
    method: "browser.active_tab_info",
    status: "accepted",
    visibility: "release_summary",
    reasonCode: "active_tab_info_live_enable_review_accepted",
    reviewIdHash: MANUAL_REVIEW_ID_HASH,
    reviewerIdentityHash: MANUAL_REVIEWER_HASH,
    approvedSurfaceCount: 2,
    evidenceChecksumCount: 1,
    rollbackSurfaceCount: 2,
    expiresAt: "2026-07-23T00:00:00.000Z",
    auditOnlyEvidenceChecksums: [MANUAL_REVIEW_CHECKSUM],
  }
}

function runtimeTransitionProjection() {
  return {
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-runtime-transition.v1",
    method: "browser.active_tab_info",
    visibility: "release_summary",
    state: "review_record_accepted",
    reasonCode: "active_tab_info_live_enable_review_record_accepted",
    transitionOk: true,
    approvedSurfaceCount: 2,
    openSurfaceCount: 0,
  }
}

function activationRequestProjection() {
  return {
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-activation-request.v1",
    method: "browser.active_tab_info",
    status: "activation_request_ready",
    blockingReasonCodes: [],
    activationRequest: {
      manualApprovalReference: "review:browser-active-tab-info-live-enable",
      targetPlatform: "macos",
      operatorIdentityProof: "operator-proof:release-owner",
      rollbackRequirement: "disable_browser_active_tab_info_live_paths",
      explicitEnableScope: ["rust_live_handler", "skill_mapping"],
    },
    executeNow: false,
    addRustDispatchNow: false,
    enableSkillMappingNow: false,
    addProductionBindingNow: false,
    enableDefaultLiveSmokeNow: false,
  }
}

function runtimeMutationPreflightProjection() {
  return {
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-runtime-mutation-preflight.v1",
    method: "browser.active_tab_info",
    status: "mutation_preflight_ready",
    reasonCode: "active_tab_info_runtime_mutation_preflight_ready",
    targetSurfaces: ["rust_live_handler", "skill_mapping"],
    plannedMutationSurfaces: ["rust_live_handler", "skill_mapping"],
    rollbackCommandPlan: [
      "disable:browser.active_tab_info:rust_live_handler",
      "disable:browser.active_tab_info:skill_mapping",
    ],
    postCheckEvidenceRequirements: [
      "active_tab_info_runtime_result_redacted",
      "active_tab_info_product_log_evidence_ref_only",
    ],
    executeNow: false,
    addRustDispatchNow: false,
    enableSkillMappingNow: false,
    addProductionBindingNow: false,
    enableDefaultLiveSmokeNow: false,
  }
}

function runtimeMutationExecutorPlanProjection() {
  return {
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-runtime-mutation-executor-plan.v1",
    method: "browser.active_tab_info",
    state: "planned",
    reasonCode: "active_tab_info_runtime_mutation_executor_plan_ready",
    mutationSurfaces: ["rust_live_handler", "skill_mapping"],
    orderedExecutionSteps: [
      "reconfirm_mutation_surface_lock",
      "apply_runtime_binding_change",
      "collect_post_check_evidence",
      "stop_before_default_live_smoke",
    ],
    rollbackDryRunSummary: "passed",
    postCheckDryRunSummary: "passed",
    executeNow: false,
    addRustDispatchNow: false,
    enableSkillMappingNow: false,
    addProductionBindingNow: false,
    enableDefaultLiveSmokeNow: false,
  }
}

function runtimeMutationDryRunReceiptProjection() {
  return {
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-runtime-mutation-dry-run-receipt.v1",
    method: "browser.active_tab_info",
    status: "dry_run_receipt_ready",
    reasonCode: "active_tab_info_runtime_mutation_dry_run_receipt_ready",
    dryRunReceiptId: "dry-run-receipt:browser.active_tab_info:be8",
    mutationSurfaceCount: 2,
    rollbackDryRunStatus: "passed",
    postCheckDryRunStatus: "passed",
    executeNow: false,
    addRustDispatchNow: false,
    enableSkillMappingNow: false,
    addProductionBindingNow: false,
    enableDefaultLiveSmokeNow: false,
    createLiveExecutionReceiptNow: false,
  }
}

function liveExecutionAuthorizationProjection() {
  return {
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-live-execution-authorization.v1",
    method: "browser.active_tab_info",
    status: "live_execution_authorization_ready",
    reasonCode: "active_tab_info_live_execution_authorization_ready",
    authorization: {
      authorizationRef: "live-execution-authorization:browser.active_tab_info:bc5",
      dryRunReceiptId: "dry-run-receipt:browser.active_tab_info:be8",
      targetSurfaces: ["rust_live_handler", "skill_mapping"],
      rollbackEmergencyCommandAcknowledged: true,
      postExecutionVerificationAcknowledged: true,
      authorizedAt: "2026-07-22T02:00:00.000Z",
      expiresAt: "2026-07-22T02:10:00.000Z",
    },
    executeNow: false,
    addRustDispatchNow: false,
    enableSkillMappingNow: false,
    addProductionBindingNow: false,
    enableDefaultLiveSmokeNow: false,
    createLiveExecutionReceiptNow: false,
  }
}

function liveExecutionReceiptProjection() {
  return {
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-live-execution-receipt.v1",
    method: "browser.active_tab_info",
    status: "live_execution_receipt_ready",
    reasonCode: "active_tab_info_live_execution_receipt_ready",
    receipt: {
      liveExecutionReceiptId: "live-execution-receipt:browser.active_tab_info:b42",
      authorizationRef: "live-execution-authorization:browser.active_tab_info:bc5",
      dryRunReceiptId: "dry-run-receipt:browser.active_tab_info:be8",
      targetInstanceRef: "target-instance:browser.active_tab_info:22d",
      targetSurfaces: ["rust_live_handler", "skill_mapping"],
      runtimeConfigSnapshotId: "runtime-config-snapshot:active-tab-info:001",
      executionWindow: {
        startsAt: "2026-07-22T02:06:00.000Z",
        expiresAt: "2026-07-22T02:09:00.000Z",
      },
      rollbackCommandRef: "rollback-command:active-tab-info:disable-live-paths",
      postExecutionVerificationPlanRef: "post-check-plan:active-tab-info:redacted-result",
    },
    dispatchNow: false,
    addRustDispatchNow: false,
    enableSkillMappingNow: false,
    addProductionBindingNow: false,
    enableDefaultLiveSmokeNow: false,
    markUserGoalSucceededNow: false,
  }
}

function dispatchExecutionPlanProjection() {
  return {
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-dispatch-execution-plan.v1",
    method: "browser.active_tab_info",
    state: "planned",
    reasonCode: "active_tab_info_dispatch_execution_plan_ready",
    liveExecutionReceiptId: "live-execution-receipt:browser.active_tab_info:b42",
    targetSurfaces: ["rust_live_handler", "skill_mapping"],
    orderedDispatchSteps: [
      "reconfirm_live_execution_receipt",
      "reconfirm_target_surface_lock",
      "prepare_rust_dispatch_input",
      "collect_dispatch_result_reference",
      "stop_before_skill_mapping_activation",
    ],
    rollbackSteps: [
      "use_receipt_rollback_command_ref",
      "restore_previous_runtime_binding",
      "record_rollback_reference_only",
    ],
    postCheckSteps: [
      "use_receipt_post_execution_verification_plan_ref",
      "verify_redacted_runtime_result",
      "verify_final_and_product_log_boundaries",
    ],
    dispatchNow: false,
    addRustDispatchNow: false,
    enableSkillMappingNow: false,
    addProductionBindingNow: false,
    enableDefaultLiveSmokeNow: false,
    markUserGoalSucceededNow: false,
  }
}

function dispatchDryRunReceiptProjection() {
  return {
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-dispatch-dry-run-receipt.v1",
    method: "browser.active_tab_info",
    status: "dispatch_dry_run_receipt_ready",
    reasonCode: "active_tab_info_dispatch_dry_run_receipt_ready",
    dispatchDryRunReceiptId: "dispatch-dry-run-receipt:browser.active_tab_info:d92",
    liveExecutionReceiptId: "live-execution-receipt:browser.active_tab_info:b42",
    targetSurfaceCount: 2,
    dispatchAdapterDryRunStatus: "passed",
    rollbackDryRunStatus: "passed",
    postCheckDryRunStatus: "passed",
    dispatchNow: false,
    addRustDispatchNow: false,
    enableSkillMappingNow: false,
    addProductionBindingNow: false,
    enableDefaultLiveSmokeNow: false,
    markUserGoalSucceededNow: false,
  }
}

function dispatchExecutionReceiptProjection() {
  return {
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-dispatch-execution-receipt.v1",
    method: "browser.active_tab_info",
    status: "dispatch_execution_receipt_ready",
    reasonCode: "active_tab_info_dispatch_execution_receipt_ready",
    receipt: {
      dispatchExecutionReceiptId: "dispatch-execution-receipt:browser.active_tab_info:8ba",
      dispatchDryRunReceiptId: "dispatch-dry-run-receipt:browser.active_tab_info:d92",
      liveExecutionReceiptId: "live-execution-receipt:browser.active_tab_info:b42",
      targetSurfaceCount: 2,
      executedAt: "2026-07-22T02:08:00.000Z",
      postDispatchRedactedResultRef: "post-dispatch-result:active-tab-info:redacted:001",
    },
    enableSkillMappingNow: false,
    addProductionBindingNow: false,
    enableDefaultLiveSmokeNow: false,
    markUserGoalSucceededNow: false,
  }
}

function dispatchVerificationAdmissionProjection() {
  return {
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-dispatch-verification-admission.v1",
    method: "browser.active_tab_info",
    status: "verification_admission_ready",
    reasonCode: "active_tab_info_dispatch_verification_admission_ready",
    admission: {
      verificationAdmissionId: "dispatch-verification-admission:browser.active_tab_info:0f9",
      dispatchExecutionReceiptId: "dispatch-execution-receipt:browser.active_tab_info:8ba",
      redactedRuntimeObservationRef: "runtime-observation:active-tab-info:redacted:001",
      verificationChecklistStatus: "passed",
      llmDecisionSummaryRef: "llm-verification-decision:active-tab-info:summary:001",
    },
    admitNow: true,
    enableSkillMappingNow: false,
    addProductionBindingNow: false,
    enableDefaultLiveSmokeNow: false,
    markUserGoalSucceededNow: false,
  }
}

function llmPostCheckDecisionReceiptProjection() {
  return {
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-llm-post-check-decision-receipt.v1",
    method: "browser.active_tab_info",
    status: "llm_post_check_decision_receipt_ready",
    reasonCode: "active_tab_info_llm_post_check_decision_receipt_ready",
    receipt: {
      llmPostCheckDecisionReceiptId: "llm-post-check-decision-receipt:browser.active_tab_info:c09",
      verificationAdmissionId: "dispatch-verification-admission:browser.active_tab_info:0f9",
      dispatchExecutionReceiptId: "dispatch-execution-receipt:browser.active_tab_info:8ba",
      decisionStatus: "satisfied",
      evidenceRefCount: 2,
      decidedAt: "2026-07-22T02:09:00.000Z",
    },
    goalSatisfied: true,
    deliverFinalResponseNow: false,
    enableSkillMappingNow: false,
    addProductionBindingNow: false,
    enableDefaultLiveSmokeNow: false,
    markUserGoalSucceededNow: false,
  }
}

const ACTIVE_TAB_RUNTIME_MUTATION_OUTPUT_PATTERN =
  /final retained acknowledgement completion closeout acknowledgement closure ledger|final_retained_acknowledgement_completion_closeout_acknowledgement_closure_ledger_ready|active_tab_info_final_retained_acknowledgement_completion_closeout_acknowledgement_closure_ledger_ready|yeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedger|final-retained-acknowledgement-completion-closeout-acknowledgement-closure-ledger|finalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerId|ledgerStatus|releaseReadinessNow|publicationReadinessNow|final retained acknowledgement completion closeout acknowledgement ledger|final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_ready|active_tab_info_final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_ready|yeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedger|final-retained-acknowledgement-completion-closeout-acknowledgement-ledger|finalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerId|ledgerStatus|releaseReadinessNow|publicationReadinessNow|operator final retained acknowledgement completion closeout acknowledgement receipt|operator_final_retained_acknowledgement_completion_closeout_acknowledgement_receipt_ready|active_tab_info_operator_final_retained_acknowledgement_completion_closeout_acknowledgement_receipt_ready|yeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementReceipt|operator-final-retained-acknowledgement-completion-closeout-acknowledgement-receipt|operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementReceiptId|receiptStatus|releaseReadinessNow|publicationReadinessNow|final retained acknowledgement completion closeout ledger|final_retained_acknowledgement_completion_closeout_ledger_ready|active_tab_info_final_retained_acknowledgement_completion_closeout_ledger_ready|yeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutLedger|final-retained-acknowledgement-completion-closeout-ledger|finalRetainedAcknowledgementCompletionCloseoutLedgerId|ledgerStatus|releaseReadinessNow|publicationReadinessNow|operator final retained acknowledgement completion closeout receipt|operator_final_retained_acknowledgement_completion_closeout_receipt_ready|active_tab_info_operator_final_retained_acknowledgement_completion_closeout_receipt_ready|yeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutReceipt|operator-final-retained-acknowledgement-completion-closeout-receipt|operatorFinalRetainedAcknowledgementCompletionCloseoutReceiptId|receiptStatus|releaseReadinessNow|publicationReadinessNow|final retained acknowledgement completion ledger|final_retained_acknowledgement_completion_ledger_ready|active_tab_info_final_retained_acknowledgement_completion_ledger_ready|yeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionLedger|final-retained-acknowledgement-completion-ledger|finalRetainedAcknowledgementCompletionLedgerId|ledgerStatus|releaseReadinessNow|publicationReadinessNow|operator final retained acknowledgement completion receipt|operator_final_retained_acknowledgement_completion_receipt_ready|active_tab_info_operator_final_retained_acknowledgement_completion_receipt_ready|yeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionReceipt|operator-final-retained-acknowledgement-completion-receipt|operatorFinalRetainedAcknowledgementCompletionReceiptId|receiptStatus|releaseReadinessNow|publicationReadinessNow|final acknowledgement ledger|final_acknowledgement_ledger_ready|active_tab_info_final_acknowledgement_ledger_ready|yeonjangBrowserActiveTabInfoFinalAcknowledgementLedger|final-acknowledgement-ledger|finalAcknowledgementLedgerId|ledgerStatus|releaseReadinessNow|publicationReadinessNow|operator final acknowledgement receipt|operator_final_acknowledgement_receipt_ready|active_tab_info_operator_final_acknowledgement_receipt_ready|yeonjangBrowserActiveTabInfoOperatorFinalAcknowledgementReceipt|operator-final-acknowledgement-receipt|operatorFinalAcknowledgementReceiptId|receiptStatus|releaseReadinessNow|publicationReadinessNow|final completion ledger|final_completion_ledger_ready|active_tab_info_final_completion_ledger_ready|yeonjangBrowserActiveTabInfoFinalCompletionLedger|final-completion-ledger|finalCompletionLedgerId|ledgerStatus|releaseReadinessNow|publicationReadinessNow|operator final completion receipt|operator_final_completion_receipt_ready|active_tab_info_operator_final_completion_receipt_ready|yeonjangBrowserActiveTabInfoOperatorFinalCompletionReceipt|operator-final-completion-receipt|operatorFinalCompletionReceiptId|receiptStatus|releaseReadinessNow|publicationReadinessNow|final retained completion ledger|final_retained_completion_ledger_ready|active_tab_info_final_retained_completion_ledger_ready|yeonjangBrowserActiveTabInfoFinalRetainedCompletionLedger|final-retained-completion-ledger|finalRetainedCompletionLedgerId|ledgerStatus|releaseReadinessNow|publicationReadinessNow|operator final retained completion receipt|operator_final_retained_completion_receipt_ready|active_tab_info_operator_final_retained_completion_receipt_ready|yeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionReceipt|operator-final-retained-completion-receipt|operatorFinalRetainedCompletionReceiptId|receiptStatus|releaseReadinessNow|publicationReadinessNow|final retained sealed completion ledger|final_retained_sealed_completion_ledger_ready|active_tab_info_final_retained_sealed_completion_ledger_ready|yeonjangBrowserActiveTabInfoFinalRetainedSealedCompletionLedger|final-retained-sealed-completion-ledger|finalRetainedSealedCompletionLedgerId|ledgerStatus|releaseReadinessNow|publicationReadinessNow|operator final retained sealed completion receipt|operator_final_retained_sealed_completion_receipt_ready|active_tab_info_operator_final_retained_sealed_completion_receipt_ready|yeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCompletionReceipt|operator-final-retained-sealed-completion-receipt|operatorFinalRetainedSealedCompletionReceiptId|receiptStatus|releaseReadinessNow|publicationReadinessNow|final retained sealed closeout completion ledger|final_retained_sealed_closeout_completion_ledger_ready|active_tab_info_final_retained_sealed_closeout_completion_ledger_ready|yeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutCompletionLedger|final-retained-sealed-closeout-completion-ledger|finalRetainedSealedCloseoutCompletionLedgerId|ledgerStatus|releaseReadinessNow|publicationReadinessNow|operator final retained sealed closeout completion acknowledgement receipt|operator_final_retained_sealed_closeout_completion_acknowledgement_receipt_ready|active_tab_info_operator_final_retained_sealed_closeout_completion_acknowledgement_receipt_ready|yeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceipt|operator-final-retained-sealed-closeout-completion-acknowledgement-receipt|operatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceiptId|receiptStatus|releaseReadinessNow|publicationReadinessNow|final retained sealed closeout acknowledgement ledger|final_retained_sealed_closeout_acknowledgement_ledger_ready|active_tab_info_final_retained_sealed_closeout_acknowledgement_ledger_ready|yeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutAcknowledgementLedger|final-retained-sealed-closeout-acknowledgement-ledger|finalRetainedSealedCloseoutAcknowledgementLedgerId|ledgerStatus|releaseReadinessNow|publicationReadinessNow|operator final retained sealed closeout acknowledgement receipt|operator_final_retained_sealed_closeout_acknowledgement_receipt_ready|active_tab_info_operator_final_retained_sealed_closeout_acknowledgement_receipt_ready|yeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCloseoutAcknowledgementReceipt|operator-final-retained-sealed-closeout-acknowledgement-receipt|operatorFinalRetainedSealedCloseoutAcknowledgementReceiptId|receiptStatus|releaseReadinessNow|publicationReadinessNow|final retained sealed closeout ledger|final_retained_sealed_closeout_ledger_ready|active_tab_info_final_retained_sealed_closeout_ledger_ready|yeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutLedger|final-retained-sealed-closeout-ledger|finalRetainedSealedCloseoutLedgerId|ledgerStatus|releaseReadinessNow|publicationReadinessNow|operator final retained closeout sealed acknowledgement receipt|operator_final_retained_closeout_sealed_acknowledgement_receipt_ready|active_tab_info_operator_final_retained_closeout_sealed_acknowledgement_receipt_ready|yeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutSealedAcknowledgementReceipt|operator-final-retained-closeout-sealed-acknowledgement-receipt|operatorFinalRetainedCloseoutSealedAcknowledgementReceiptId|receiptStatus|releaseReadinessNow|publicationReadinessNow|final retained closeout sealed ledger|final_retained_closeout_sealed_ledger_ready|active_tab_info_final_retained_closeout_sealed_ledger_ready|yeonjangBrowserActiveTabInfoFinalRetainedCloseoutSealedLedger|final-retained-closeout-sealed-ledger|finalRetainedCloseoutSealedLedgerId|ledgerStatus|releaseReadinessNow|publicationReadinessNow|operator final retained completion closeout acknowledgement receipt|operator_final_retained_completion_closeout_acknowledgement_receipt_ready|active_tab_info_operator_final_retained_completion_closeout_acknowledgement_receipt_ready|yeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionCloseoutAcknowledgementReceipt|operator-final-retained-completion-closeout-acknowledgement-receipt|operatorFinalRetainedCompletionCloseoutAcknowledgementReceiptId|receiptStatus|releaseReadinessNow|publicationReadinessNow|final retained completion closeout ledger|final_retained_completion_closeout_ledger_ready|active_tab_info_final_retained_completion_closeout_ledger_ready|yeonjangBrowserActiveTabInfoFinalRetainedCompletionCloseoutLedger|final-retained-completion-closeout-ledger|finalRetainedCompletionCloseoutLedgerId|ledgerStatus|releaseReadinessNow|publicationReadinessNow|operator final retained closeout completion acknowledgement receipt|operator_final_retained_closeout_completion_acknowledgement_receipt_ready|active_tab_info_operator_final_retained_closeout_completion_acknowledgement_receipt_ready|yeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutCompletionAcknowledgementReceipt|operator-final-retained-closeout-completion-acknowledgement-receipt|operatorFinalRetainedCloseoutCompletionAcknowledgementReceiptId|receiptStatus|releaseReadinessNow|publicationReadinessNow|final retained closeout completion ledger|final_retained_closeout_completion_ledger_ready|active_tab_info_final_retained_closeout_completion_ledger_ready|yeonjangBrowserActiveTabInfoFinalRetainedCloseoutCompletionLedger|final-retained-closeout-completion-ledger|finalRetainedCloseoutCompletionLedgerId|ledgerStatus|releaseReadinessNow|publicationReadinessNow|operator final retained closeout acknowledgement receipt|operator_final_retained_closeout_acknowledgement_receipt_ready|active_tab_info_operator_final_retained_closeout_acknowledgement_receipt_ready|yeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutAcknowledgementReceipt|operator-final-retained-closeout-acknowledgement-receipt|operatorFinalRetainedCloseoutAcknowledgementReceiptId|receiptStatus|releaseReadinessNow|publicationReadinessNow|final retained closeout acknowledgement ledger|final_retained_closeout_acknowledgement_ledger_ready|active_tab_info_final_retained_closeout_acknowledgement_ledger_ready|yeonjangBrowserActiveTabInfoFinalRetainedCloseoutAcknowledgementLedger|final-retained-closeout-acknowledgement-ledger|finalRetainedCloseoutAcknowledgementLedgerId|ledgerStatus|releaseReadinessNow|publicationReadinessNow|operator retained closeout acknowledgement receipt|operator_retained_closeout_acknowledgement_receipt_ready|active_tab_info_operator_retained_closeout_acknowledgement_receipt_ready|yeonjangBrowserActiveTabInfoOperatorRetainedCloseoutAcknowledgementReceipt|operator-retained-closeout-acknowledgement-receipt|operatorRetainedCloseoutAcknowledgementReceiptId|receiptStatus|releaseReadinessNow|publicationReadinessNow|final retained seal closeout ledger|final_retained_seal_closeout_ledger_ready|active_tab_info_final_retained_seal_closeout_ledger_ready|yeonjangBrowserActiveTabInfoFinalRetainedSealCloseoutLedger|final-retained-seal-closeout-ledger|finalRetainedSealCloseoutLedgerId|ledgerStatus|releaseReadinessNow|publicationReadinessNow|operator retained seal acknowledgement receipt|operator_retained_seal_acknowledgement_receipt_ready|active_tab_info_operator_retained_seal_acknowledgement_receipt_ready|yeonjangBrowserActiveTabInfoOperatorRetainedSealAcknowledgementReceipt|operator-retained-seal-acknowledgement-receipt|operatorRetainedSealAcknowledgementReceiptId|receiptStatus|releaseReadinessNow|publicationReadinessNow|final retained ledger acknowledgement seal|final_retained_ledger_acknowledgement_seal_ready|active_tab_info_final_retained_ledger_acknowledgement_seal_ready|yeonjangBrowserActiveTabInfoFinalRetainedLedgerAcknowledgementSeal|final-retained-ledger-acknowledgement-seal|finalRetainedLedgerAcknowledgementSealId|sealStatus|releaseReadinessNow|publicationReadinessNow|operator retained ledger acknowledgement receipt|operator_retained_ledger_acknowledgement_receipt_ready|active_tab_info_operator_retained_ledger_acknowledgement_receipt_ready|yeonjangBrowserActiveTabInfoOperatorRetainedLedgerAcknowledgementReceipt|operator-retained-ledger-acknowledgement-receipt|operatorRetainedLedgerAcknowledgementReceiptId|receiptStatus|releaseReadinessNow|publicationReadinessNow|final retained completion acknowledgement ledger|final_retained_completion_acknowledgement_ledger_ready|active_tab_info_final_retained_completion_acknowledgement_ledger_ready|yeonjangBrowserActiveTabInfoFinalRetainedCompletionAcknowledgementLedger|final-retained-completion-acknowledgement-ledger|finalRetainedCompletionAcknowledgementLedgerId|ledgerStatus|releaseReadinessNow|publicationReadinessNow|operator retained completion acknowledgement receipt|operator_retained_completion_acknowledgement_receipt_ready|active_tab_info_operator_retained_completion_acknowledgement_receipt_ready|yeonjangBrowserActiveTabInfoOperatorRetainedCompletionAcknowledgementReceipt|operator-retained-completion-acknowledgement-receipt|operatorRetainedCompletionAcknowledgementReceiptId|receiptStatus|releaseReadinessNow|publicationReadinessNow|final retained completion index|final_retained_completion_index_ready|active_tab_info_final_retained_completion_index_ready|yeonjangBrowserActiveTabInfoFinalRetainedCompletionIndex|final-retained-completion-index|finalRetainedCompletionIndexId|indexStatus|releaseReadinessNow|publicationReadinessNow|operator final retained acknowledgement receipt|operator_final_retained_acknowledgement_receipt_ready|active_tab_info_operator_final_retained_acknowledgement_receipt_ready|yeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementReceipt|operator-final-retained-acknowledgement-receipt|operatorFinalRetainedAcknowledgementReceiptId|receiptStatus|releaseReadinessNow|publicationReadinessNow|final retained acknowledgement ledger|final_retained_acknowledgement_ledger_ready|active_tab_info_final_retained_acknowledgement_ledger_ready|yeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementLedger|final-retained-acknowledgement-ledger|finalRetainedAcknowledgementLedgerId|ledgerStatus|releaseReadinessNow|publicationReadinessNow|operator retained transfer index acknowledgement receipt|operator_retained_transfer_index_acknowledgement_receipt_ready|active_tab_info_operator_retained_transfer_index_acknowledgement_receipt_ready|yeonjangBrowserActiveTabInfoOperatorRetainedTransferIndexAcknowledgementReceipt|operator-retained-transfer-index-acknowledgement-receipt|operatorRetainedTransferIndexAcknowledgementReceiptId|receiptStatus|releaseReadinessNow|publicationReadinessNow|final retained transfer index|final_retained_transfer_index_ready|active_tab_info_final_retained_transfer_index_ready|yeonjangBrowserActiveTabInfoFinalRetainedTransferIndex|final-retained-transfer-index|finalRetainedTransferIndexId|indexStatus|releaseReadinessNow|publicationReadinessNow|operator post-transfer archive acknowledgement receipt|operator_post_transfer_archive_acknowledgement_receipt_ready|active_tab_info_operator_post_transfer_archive_acknowledgement_receipt_ready|yeonjangBrowserActiveTabInfoOperatorPostTransferArchiveAcknowledgementReceipt|operator-post-transfer-archive-acknowledgement-receipt|operatorPostTransferArchiveAcknowledgementReceiptId|receiptStatus|releaseReadinessNow|publicationReadinessNow|final post-transfer archive pointer|final_post_transfer_archive_pointer_ready|active_tab_info_final_post_transfer_archive_pointer_ready|yeonjangBrowserActiveTabInfoFinalPostTransferArchivePointer|final-post-transfer-archive-pointer|finalPostTransferArchivePointerId|pointerStatus|releaseReadinessNow|publicationReadinessNow|operator final transfer acknowledgement receipt|operator_final_transfer_acknowledgement_receipt_ready|active_tab_info_operator_final_transfer_acknowledgement_receipt_ready|yeonjangBrowserActiveTabInfoOperatorFinalTransferAcknowledgementReceipt|operator-final-transfer-acknowledgement-receipt|operatorFinalTransferAcknowledgementReceiptId|receiptStatus|releaseReadinessNow|publicationReadinessNow|final transfer closeout ledger|final_transfer_closeout_ledger_ready|active_tab_info_final_transfer_closeout_ledger_ready|yeonjangBrowserActiveTabInfoFinalTransferCloseoutLedger|final-transfer-closeout-ledger|finalTransferCloseoutLedgerId|ledgerStatus|releaseReadinessNow|publicationReadinessNow|operator final handoff receipt|operator_final_handoff_receipt_ready|active_tab_info_operator_final_handoff_receipt_ready|yeonjangBrowserActiveTabInfoOperatorFinalHandoffReceipt|operator-final-handoff-receipt|operatorFinalHandoffReceiptId|receiptStatus|releaseReadinessNow|publicationReadinessNow|final handoff closure marker|final_handoff_closure_marker_ready|active_tab_info_final_handoff_closure_marker_ready|yeonjangBrowserActiveTabInfoFinalHandoffClosureMarker|final-handoff-closure-marker|finalHandoffClosureMarkerId|markerStatus|releaseReadinessNow|publicationReadinessNow|operator final retention acknowledgement receipt|operator_final_retention_acknowledgement_receipt_ready|active_tab_info_operator_final_retention_acknowledgement_receipt_ready|yeonjangBrowserActiveTabInfoOperatorFinalRetentionAcknowledgementReceipt|operator-final-retention-acknowledgement-receipt|operatorFinalRetentionAcknowledgementReceiptId|receiptStatus|releaseReadinessNow|publicationReadinessNow|final retention closure ledger|final_retention_closure_ledger_ready|active_tab_info_final_retention_closure_ledger_ready|yeonjangBrowserActiveTabInfoFinalRetentionClosureLedger|final-retention-closure-ledger|finalRetentionClosureLedgerId|ledgerStatus|releaseReadinessNow|publicationReadinessNow|operator final index retention receipt|operator_final_index_retention_receipt_ready|active_tab_info_operator_final_index_retention_receipt_ready|yeonjangBrowserActiveTabInfoOperatorFinalIndexRetentionReceipt|operator-final-index-retention-receipt|operatorFinalIndexRetentionReceiptId|receiptStatus|releaseReadinessNow|publicationReadinessNow|final operator closeout index|final_operator_closeout_index_ready|active_tab_info_final_operator_closeout_index_ready|yeonjangBrowserActiveTabInfoFinalOperatorCloseoutIndex|final-operator-closeout-index|finalOperatorCloseoutIndexId|indexStatus|releaseReadinessNow|publicationReadinessNow|operator final closeout acknowledgement receipt|operator_final_closeout_acknowledgement_receipt_ready|active_tab_info_operator_final_closeout_acknowledgement_receipt_ready|yeonjangBrowserActiveTabInfoOperatorFinalCloseoutAcknowledgementReceipt|operator-final-closeout-acknowledgement-receipt|operatorFinalCloseoutAcknowledgementReceiptId|receiptStatus|releaseReadinessNow|publicationReadinessNow|final sealed archive closeout ledger|final_sealed_archive_closeout_ledger_ready|active_tab_info_final_sealed_archive_closeout_ledger_ready|yeonjangBrowserActiveTabInfoFinalSealedArchiveCloseoutLedger|final-sealed-archive-closeout-ledger|finalSealedArchiveCloseoutLedgerId|ledgerStatus|releaseReadinessNow|publicationReadinessNow|operator final sealed archive receipt|operator_final_sealed_archive_receipt_ready|active_tab_info_operator_final_sealed_archive_receipt_ready|yeonjangBrowserActiveTabInfoOperatorFinalSealedArchiveReceipt|operator-final-sealed-archive-receipt|operatorFinalSealedArchiveReceiptId|receiptStatus|releaseReadinessNow|publicationReadinessNow|final sealed archive handoff completion index|final_sealed_archive_handoff_completion_index_ready|active_tab_info_final_sealed_archive_handoff_completion_index_ready|yeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffCompletionIndex|final-sealed-archive-handoff-completion-index|finalSealedArchiveHandoffCompletionIndexId|indexStatus|releaseReadinessNow|publicationReadinessNow|operator sealed archive handoff receipt|operator_sealed_archive_handoff_receipt_ready|active_tab_info_operator_sealed_archive_handoff_receipt_ready|yeonjangBrowserActiveTabInfoOperatorSealedArchiveHandoffReceipt|operator-sealed-archive-handoff-receipt|operatorSealedArchiveHandoffReceiptId|receiptStatus|releaseReadinessNow|publicationReadinessNow|operator completion archive acknowledgement|operator_completion_archive_acknowledgement_ready|active_tab_info_operator_completion_archive_acknowledgement_ready|yeonjangBrowserActiveTabInfoOperatorCompletionArchiveAcknowledgement|operator-completion-archive-acknowledgement|operatorCompletionArchiveAcknowledgementId|acknowledgementStatus|final operator archive completion marker|final_operator_archive_completion_marker_ready|active_tab_info_final_operator_archive_completion_marker_ready|yeonjangBrowserActiveTabInfoFinalOperatorArchiveCompletionMarker|final-operator-archive-completion-marker|finalOperatorArchiveCompletionMarkerId|markerStatus|operator archival completion acknowledgement receipt|operator_archival_completion_acknowledgement_receipt_ready|active_tab_info_operator_archival_completion_acknowledgement_receipt_ready|yeonjangBrowserActiveTabInfoOperatorArchivalCompletionAcknowledgementReceipt|operator-archival-completion-acknowledgement-receipt|operatorArchivalCompletionAcknowledgementReceiptId|receiptStatus|final archival completion index|final_archival_completion_index_ready|active_tab_info_final_archival_completion_index_ready|yeonjangBrowserActiveTabInfoFinalArchivalCompletionIndex|final-archival-completion-index|finalArchivalCompletionIndexId|indexStatus|operator archived release acknowledgement|operator_archived_release_acknowledgement_ready|active_tab_info_operator_archived_release_acknowledgement_ready|yeonjangBrowserActiveTabInfoOperatorArchivedReleaseAcknowledgement|operator-archived-release-acknowledgement|operatorArchivedReleaseAcknowledgementId|acknowledgementStatus|final archived release closure marker|final_archived_release_closure_marker_ready|active_tab_info_final_archived_release_closure_marker_ready|yeonjangBrowserActiveTabInfoFinalArchivedReleaseClosureMarker|final-archived-release-closure-marker|finalArchivedReleaseClosureMarkerId|markerStatus|operator archive index retention receipt|operator_archive_index_retention_receipt_ready|active_tab_info_operator_archive_index_retention_receipt_ready|yeonjangBrowserActiveTabInfoOperatorArchiveIndexRetentionReceipt|operator-archive-index-retention-receipt|operatorArchiveIndexRetentionReceiptId|receiptStatus|final release archive index pointer|final_release_archive_index_pointer_ready|active_tab_info_final_release_archive_index_pointer_ready|yeonjangBrowserActiveTabInfoFinalReleaseArchiveIndexPointer|final-release-archive-index-pointer|finalReleaseArchiveIndexPointerId|pointerStatus|operator release archive completion notice|operator_release_archive_completion_notice_ready|active_tab_info_operator_release_archive_completion_notice_ready|yeonjangBrowserActiveTabInfoOperatorReleaseArchiveCompletionNotice|operator-release-archive-completion-notice|operatorReleaseArchiveCompletionNoticeId|noticeStatus|final audit release closure ledger|final_audit_release_closure_ledger_ready|active_tab_info_final_audit_release_closure_ledger_ready|yeonjangBrowserActiveTabInfoFinalAuditReleaseClosureLedger|final-audit-release-closure-ledger|finalAuditReleaseClosureLedgerId|ledgerStatus|final audit release handoff receipt|final_audit_release_handoff_receipt_ready|active_tab_info_final_audit_release_handoff_receipt_ready|yeonjangBrowserActiveTabInfoFinalAuditReleaseHandoffReceipt|final-audit-release-handoff-receipt|finalAuditReleaseHandoffReceiptId|receiptStatus|final archival pointer|final_archival_pointer_ready|active_tab_info_final_archival_pointer_ready|yeonjangBrowserActiveTabInfoFinalArchivalPointer|final-archival-pointer|finalArchivalPointerId|archivalPointerStatus|operator-readable closeout summary|operator_readable_closeout_summary_ready|active_tab_info_operator_readable_closeout_summary_ready|yeonjangBrowserActiveTabInfoOperatorReadableCloseoutSummary|operator-readable-closeout-summary|operatorReadableCloseoutSummaryId|summaryStatus|operator completion notice|operator_completion_notice_ready|active_tab_info_operator_completion_notice_ready|yeonjangBrowserActiveTabInfoOperatorCompletionNotice|operator-completion-notice|operatorCompletionNoticeId|noticeStatus|final audit handoff bundle|final_audit_handoff_bundle_ready|active_tab_info_final_audit_handoff_bundle_ready|yeonjangBrowserActiveTabInfoFinalAuditHandoffBundle|final-audit-handoff-bundle|finalAuditHandoffBundleId|handoffStatus|final closeout ledger|final_closeout_ledger_ready|active_tab_info_final_closeout_ledger_ready|yeonjangBrowserActiveTabInfoFinalCloseoutLedger|final-closeout-ledger|finalCloseoutLedgerId|ledgerStatus|operator closeout note|operator_closeout_note_ready|active_tab_info_operator_closeout_note_ready|yeonjangBrowserActiveTabInfoOperatorCloseoutNote|operator-closeout-note|operatorCloseoutNoteId|closeoutStatus|terminal delivery receipt|terminal_delivery_receipt_ready|active_tab_info_terminal_delivery_receipt_ready|yeonjangBrowserActiveTabInfoTerminalDeliveryReceipt|terminal-delivery-receipt|terminalDeliveryReceiptId|deliveryStatus|runtime mutation|terminal report projection|terminal_report_projection_ready|active_tab_info_terminal_report_projection_ready|yeonjangBrowserActiveTabInfoTerminalReportProjection|terminal-report-projection|terminalReportProjectionId|completion audit summary|completion_audit_summary_ready|active_tab_info_completion_audit_summary_ready|yeonjangBrowserActiveTabInfoCompletionAuditSummary|completion-audit-summary|completionAuditSummaryId|user goal closeout receipt|user_goal_closeout_receipt_ready|active_tab_info_user_goal_closeout_receipt_ready|yeonjangBrowserActiveTabInfoUserGoalCloseoutReceipt|user-goal-closeout-receipt|userGoalCloseoutReceiptId|releaseReadinessNow|publicationReadinessNow|final response delivery gate|final_response_delivery_gate_ready|active_tab_info_final_response_delivery_gate_ready|yeonjangBrowserActiveTabInfoFinalResponseDeliveryGate|final-response-delivery-gate|finalDeliveryGateId|LLM post-check decision receipt|llm_post_check_decision_receipt_ready|active_tab_info_llm_post_check_decision_receipt_ready|yeonjangBrowserActiveTabInfoLlmPostCheckDecisionReceipt|llm-post-check-decision-receipt|llmPostCheckDecisionReceiptId|goalSatisfied|deliverFinalResponseNow|dispatch verification admission|verification_admission_ready|active_tab_info_dispatch_verification_admission_ready|yeonjangBrowserActiveTabInfoDispatchVerificationAdmission|dispatch-verification-admission|verificationAdmissionId|redactedRuntimeObservationRef|llmDecisionSummaryRef|admitNow|dispatch execution receipt|dispatch_execution_receipt_ready|active_tab_info_dispatch_execution_receipt_ready|yeonjangBrowserActiveTabInfoDispatchExecutionReceipt|dispatch-execution-receipt|dispatchExecutionReceiptId|postDispatchRedactedResultRef|dispatch dry-run|dispatch_dry_run_receipt_ready|active_tab_info_dispatch_dry_run_receipt_ready|yeonjangBrowserActiveTabInfoDispatchDryRunReceipt|dispatch-dry-run-receipt|dispatchDryRunReceiptId|dispatchAdapterDryRunStatus|dispatch execution|dispatch_execution_plan_ready|active_tab_info_dispatch_execution_plan_ready|yeonjangBrowserActiveTabInfoDispatchExecutionPlan|orderedDispatchSteps|rollbackSteps|postCheckSteps|prepare_rust_dispatch_input|live execution|live_execution_receipt_ready|active_tab_info_live_execution_receipt_ready|yeonjangBrowserActiveTabInfoLiveExecutionReceipt|live-execution-receipt|dispatchNow|markUserGoalSucceededNow|target-instance:browser.active_tab_info|runtime-config-snapshot|live_execution_authorization_ready|active_tab_info_live_execution_authorization_ready|yeonjangBrowserActiveTabInfoLiveExecutionAuthorization|live-execution-authorization|operator-live-proof|dry_run_receipt_ready|runtime_mutation_dry_run_receipt_ready|yeonjangBrowserActiveTabInfoRuntimeMutationDryRunReceipt|mutation_preflight_ready|runtime_mutation_executor_plan_ready|yeonjangBrowserActiveTabInfoRuntimeMutationPreflight|yeonjangBrowserActiveTabInfoRuntimeMutationExecutorPlan|createLiveExecutionReceiptNow|addRustDispatchNow|enableSkillMappingNow|addProductionBindingNow|enableDefaultLiveSmokeNow/iu

const OPERATOR_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_CLOSEOUT_ACKNOWLEDGEMENT_CLOSURE_LEDGER_RECEIPT_FORBIDDEN_PATTERN =
  /operator final retained acknowledgement completion closeout acknowledgement closure ledger receipt|operator_final_retained_acknowledgement_completion_closeout_acknowledgement_closure_ledger_receipt_ready|active_tab_info_operator_final_retained_acknowledgement_completion_closeout_acknowledgement_closure_ledger_receipt_ready|yeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerReceipt|operator-final-retained-acknowledgement-completion-closeout-acknowledgement-closure-ledger-receipt|operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerReceiptId|receiptStatus|releaseReadinessNow|publicationReadinessNow/iu

const CLEANUP_TASK_PLAN_SUMMARY_FORBIDDEN_PATTERN =
  /evidence chain cleanup task plan summary|active_tab_info_release_evidence_chain_cleanup_task_plan_summary_ready|yeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupTaskPlanSummary|summaryStatus|cleanupTaskCount|requiresSeparateCommit|executeDeletionNow|modifyPackageNow/iu

const CLEANUP_PR_CHECKLIST_FORBIDDEN_PATTERN =
  /evidence chain cleanup PR checklist|active_tab_info_release_evidence_chain_cleanup_pr_checklist_ready|yeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrChecklist|checklistStatus|requiredReviewSteps|requiredTestCommands|rollbackNotes|open_cleanup_pr_after_manual_review/iu

const CLEANUP_PR_REVIEW_RECEIPT_FORBIDDEN_PATTERN =
  /evidence chain cleanup PR review receipt|active_tab_info_release_evidence_chain_cleanup_pr_review_receipt_accepted|yeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupPrReviewReceipt|receiptStatus|reviewDecision|reviewedChecklistStatus|prepare_cleanup_branch_after_review/iu

const CLEANUP_BRANCH_PREPARATION_PLAN_FORBIDDEN_PATTERN =
  /evidence chain cleanup branch preparation plan|active_tab_info_release_evidence_chain_cleanup_branch_preparation_plan_ready|yeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchPreparationPlan|planStatus|reviewedReceiptStatus|requiredBranchSteps|requiredVerificationCommands|createBranchNow|create_separate_cleanup_branch_manually|cleanup_branch_preparation_plan_projection|cleanup_branch_preparation_plan_status|cleanup_branch_preparation_plan_reviewed_receipt_status|cleanup_branch_preparation_plan_required_branch_steps|cleanup_branch_preparation_plan_required_verification_commands|cleanup_branch_preparation_plan_create_branch_flag|sanitized_cleanup_branch_preparation_ref/iu

const CLEANUP_BRANCH_EXECUTION_ADMISSION_FORBIDDEN_PATTERN =
  /evidence chain cleanup branch execution admission|active_tab_info_release_evidence_chain_cleanup_branch_execution_admission_accepted|yeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupBranchExecutionAdmission|admissionStatus|reviewedPlanStatus|admissionDecision|requiredExecutionBoundaries|runGitNow|prepare_cleanup_deletion_candidate_after_branch_admission|cleanup_branch_execution_admission_projection|cleanup_branch_execution_admission_status|cleanup_branch_execution_admission_reviewed_plan_status|cleanup_branch_execution_admission_required_boundaries|cleanup_branch_execution_admission_run_git_flag|sanitized_cleanup_branch_execution_admission_ref/iu

const CLEANUP_DELETION_CANDIDATE_PLAN_FORBIDDEN_PATTERN =
  /evidence chain cleanup deletion candidate plan|active_tab_info_release_evidence_chain_cleanup_deletion_candidate_plan_ready|yeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionCandidatePlan|candidatePlanStatus|reviewedAdmissionStatus|candidateCount|candidateRefs|requiredDeletionReviewSteps|requiredVerificationCommands|deleteCodeNow|review_cleanup_deletion_candidate_plan|cleanup_deletion_candidate_plan_projection|cleanup_deletion_candidate_plan_status|cleanup_deletion_candidate_plan_count|cleanup_deletion_candidate_plan_candidate_refs|cleanup_deletion_candidate_plan_required_review_steps|cleanup_deletion_candidate_plan_required_verification_commands|cleanup_deletion_candidate_plan_delete_flag/iu

const CLEANUP_DELETION_REVIEW_RECEIPT_FORBIDDEN_PATTERN =
  /evidence chain cleanup deletion review receipt|active_tab_info_release_evidence_chain_cleanup_deletion_review_receipt_accepted|yeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionReviewReceipt|receiptStatus|reviewedCandidatePlanStatus|reviewDecision|manual_cleanup_deletion_review_accepted|nextAllowedAction|prepare_cleanup_deletion_execution_admission_after_review_receipt|deleteCodeNow|runGitNow|modifyPackageNow|createBranchNow|releaseReadinessNow|enableSkillMappingNow|addProductionBindingNow|cleanup_deletion_review_receipt_projection|cleanup_deletion_review_receipt_status|cleanup_deletion_review_receipt_review_decision|cleanup_deletion_review_receipt_reviewed_candidate_plan_status|cleanup_deletion_review_receipt_ref|cleanup_deletion_review_receipt_execution_admission_flag/iu

const CLEANUP_DELETION_EXECUTION_ADMISSION_FORBIDDEN_PATTERN =
  /evidence chain cleanup deletion execution admission|active_tab_info_release_evidence_chain_cleanup_deletion_execution_admission_accepted|yeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionExecutionAdmission|admissionStatus|reviewedReceiptStatus|admissionDecision|manual_cleanup_deletion_execution_admitted|executionAdmissionId|nextAllowedAction|prepare_cleanup_deletion_dry_run_after_execution_admission|deleteCodeNow|runGitNow|modifyPackageNow|createBranchNow|releaseReadinessNow|enableSkillMappingNow|addProductionBindingNow|cleanup_deletion_execution_admission_projection|cleanup_deletion_execution_admission_status|cleanup_deletion_execution_admission_reviewed_receipt_status|cleanup_deletion_execution_admission_decision|cleanup_deletion_execution_admission_ref|cleanup_deletion_execution_admission_dry_run_flag/iu

const CLEANUP_DELETION_DRY_RUN_RECEIPT_FORBIDDEN_PATTERN =
  /evidence chain cleanup deletion dry-run receipt|active_tab_info_release_evidence_chain_cleanup_deletion_dry_run_receipt_ready|yeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionDryRunReceipt|dryRunStatus|reviewedAdmissionStatus|dryRunReceiptId|candidateCount|requiredVerificationCommandCount|rollbackNoteCount|nextAllowedAction|review_cleanup_deletion_dry_run_receipt|deleteCodeNow|runGitNow|modifyPackageNow|createBranchNow|releaseReadinessNow|enableSkillMappingNow|addProductionBindingNow|cleanup_deletion_dry_run_receipt_projection|cleanup_deletion_dry_run_receipt_status|cleanup_deletion_dry_run_receipt_reviewed_admission_status|cleanup_deletion_dry_run_receipt_id|cleanup_deletion_dry_run_receipt_candidate_count|cleanup_deletion_dry_run_receipt_required_verification_command_count|cleanup_deletion_dry_run_receipt_rollback_note_count|cleanup_deletion_dry_run_receipt_review_flag/iu

const CLEANUP_DELETION_DRY_RUN_REVIEW_ACKNOWLEDGEMENT_RECEIPT_FORBIDDEN_PATTERN =
  /evidence chain cleanup deletion dry-run review acknowledgement receipt|active_tab_info_release_evidence_chain_cleanup_deletion_dry_run_review_acknowledgement_receipt_accepted|yeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupDeletionDryRunReviewAcknowledgementReceipt|receiptStatus|reviewedDryRunStatus|operatorCleanupDeletionDryRunReviewAcknowledgementReceiptId|nextAllowedAction|retain_cleanup_deletion_dry_run_review_acknowledgement_for_audit|deleteCodeNow|runGitNow|modifyPackageNow|createBranchNow|releaseReadinessNow|enableSkillMappingNow|addProductionBindingNow|cleanup_deletion_dry_run_review_acknowledgement_receipt_projection|cleanup_deletion_dry_run_review_acknowledgement_receipt_status|cleanup_deletion_dry_run_review_acknowledgement_receipt_reviewed_dry_run_status|cleanup_deletion_dry_run_review_acknowledgement_receipt_id|cleanup_deletion_dry_run_review_acknowledgement_receipt_next_action|cleanup_deletion_dry_run_review_acknowledgement_receipt_audit_retention_flag/iu

function authorizeArguments(input: {
  databasePath: string
  candidatePath: string
  scope: "performance" | "rollout"
  authorizationId: string
}) {
  return [
    resolve("scripts/authorize-release-readiness.mjs"),
    "--database",
    input.databasePath,
    "--candidate",
    input.candidatePath,
    "--scope",
    input.scope,
    "--decision",
    "approved",
    "--authorization-id",
    input.authorizationId,
  ]
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const directory = tempDirs.pop()
    if (directory) rmSync(directory, { recursive: true, force: true })
  }
})

describe("task189 trusted release approval workflow", () => {
  it("records explicit candidates under the local OS principal without caller-supplied roles", () => {
    const directory = createDirectory("knowbee-task189-authorize-")
    const databasePath = join(directory, "release.db")
    const performancePath = join(directory, "performance.json")
    const rolloutPath = join(directory, "rollout.json")
    createReleaseEvidenceDatabase(databasePath).close()
    writeFileSync(performancePath, JSON.stringify(performanceCandidate()), "utf8")
    writeFileSync(rolloutPath, JSON.stringify(rolloutCandidate()), "utf8")

    const performance = spawnSync(
      process.execPath,
      authorizeArguments({
        databasePath,
        candidatePath: performancePath,
        scope: "performance",
        authorizationId: "performance-authorization:task189",
      }),
      { cwd: resolve("."), encoding: "utf8" },
    )
    const rollout = spawnSync(
      process.execPath,
      authorizeArguments({
        databasePath,
        candidatePath: rolloutPath,
        scope: "rollout",
        authorizationId: "rollout-authorization:task189",
      }),
      { cwd: resolve("."), encoding: "utf8" },
    )

    expect(performance.status, performance.stderr).toBe(0)
    expect(rollout.status, rollout.stderr).toBe(0)
    expect(performance.stdout).toContain("Authorization recorded: performance v1 (approved)")
    expect(rollout.stdout).toContain("Authorization recorded: rollout v1 (approved)")
    for (const output of [performance.stdout, rollout.stdout]) {
      expect(output).toContain(
        `activeTabInfoArtifact=yeonjang:browser-active-tab-info:evidence checksum=${ACTIVE_TAB_INFO_AUDIT_CHECKSUM} packagePath=audit/yeonjang/browser-active-tab-info-evidence.json`,
      )
      expect(output).toContain(
        "counts=missingSources=0,missingTests=0,staleTests=0,rejectedSkipped=0,rejectedUnknown=0,rejectedPublicRawReports=0,failingTests=0",
      )
      expect(output).toContain("readiness=blocked blockers=live_acceptance_failed")
    }
    expect(`${performance.stdout}${rollout.stdout}`).not.toMatch(
      /thresholds|baselineSnapshot|stdout|stderr|raw output|https?:\/\/|\/private\/|\/Users\//iu,
    )
    expect(`${performance.stdout}${rollout.stdout}`).not.toMatch(
      CLEANUP_TASK_PLAN_SUMMARY_FORBIDDEN_PATTERN,
    )
    expect(`${performance.stdout}${rollout.stdout}`).not.toMatch(
      CLEANUP_PR_CHECKLIST_FORBIDDEN_PATTERN,
    )
    expect(`${performance.stdout}${rollout.stdout}`).not.toMatch(
      CLEANUP_PR_REVIEW_RECEIPT_FORBIDDEN_PATTERN,
    )
    expect(`${performance.stdout}${rollout.stdout}`).not.toMatch(
      CLEANUP_BRANCH_PREPARATION_PLAN_FORBIDDEN_PATTERN,
    )
    expect(`${performance.stdout}${rollout.stdout}`).not.toMatch(
      CLEANUP_BRANCH_EXECUTION_ADMISSION_FORBIDDEN_PATTERN,
    )
    expect(`${performance.stdout}${rollout.stdout}`).not.toMatch(
      CLEANUP_DELETION_CANDIDATE_PLAN_FORBIDDEN_PATTERN,
    )
    expect(`${performance.stdout}${rollout.stdout}`).not.toMatch(
      CLEANUP_DELETION_REVIEW_RECEIPT_FORBIDDEN_PATTERN,
    )
    expect(`${performance.stdout}${rollout.stdout}`).not.toMatch(
      CLEANUP_DELETION_EXECUTION_ADMISSION_FORBIDDEN_PATTERN,
    )

    const database = new BetterSqlite3(databasePath, { readonly: true })
    try {
      const records = database
        .prepare(
          `SELECT actor_type AS actorType, actor_id AS actorId,
                  authentication_id AS authenticationId
           FROM performance_acceptance_authorizations
           UNION ALL
           SELECT actor_type, actor_id, authentication_id
           FROM release_policy_authorizations`,
        )
        .all() as Array<{ actorType: string; actorId: string; authenticationId: string }>
      expect(records).toHaveLength(2)
      expect(records.every((record) => record.actorType === "administrator")).toBe(true)
      expect(records.every((record) => record.actorId.startsWith("local-os-user:"))).toBe(true)
      expect(records.every((record) => record.authenticationId.startsWith("local-os:"))).toBe(true)
    } finally {
      database.close()
    }
  })

  it("rejects duplicate authorization IDs and unsafe candidate files without leaking paths", () => {
    const directory = createDirectory("knowbee-task189-reject-")
    const databasePath = join(directory, "release.db")
    const candidatePath = join(directory, "rollout.json")
    const linkPath = join(directory, "rollout-link.json")
    createReleaseEvidenceDatabase(databasePath).close()
    writeFileSync(candidatePath, JSON.stringify(rolloutCandidate()), "utf8")
    symlinkSync(candidatePath, linkPath)
    const arguments_ = authorizeArguments({
      databasePath,
      candidatePath,
      scope: "rollout",
      authorizationId: "rollout-authorization:duplicate",
    })

    expect(spawnSync(process.execPath, arguments_, { encoding: "utf8" }).status).toBe(0)
    const duplicate = spawnSync(process.execPath, arguments_, { encoding: "utf8" })
    const unsafe = spawnSync(
      process.execPath,
      authorizeArguments({
        databasePath,
        candidatePath: linkPath,
        scope: "rollout",
        authorizationId: "rollout-authorization:unsafe",
      }),
      { encoding: "utf8" },
    )

    expect(duplicate.status).not.toBe(0)
    expect(duplicate.stderr.trim()).toBe("release_authorization_id_duplicate")
    expect(unsafe.status).not.toBe(0)
    expect(unsafe.stderr.trim()).toBe("authorization_candidate_path_unsafe")
  })

  it("requires active tab info evidence summary in approval input and rejects raw audit data", () => {
    const directory = createDirectory("knowbee-task189-release-evidence-")
    const databasePath = join(directory, "release.db")
    const missingEvidencePath = join(directory, "missing-evidence.json")
    const rawEvidencePath = join(directory, "raw-evidence.json")
    createReleaseEvidenceDatabase(databasePath).close()
    const { releaseApprovalEvidence: _ignored, ...missingEvidence } = rolloutCandidate()
    writeFileSync(missingEvidencePath, JSON.stringify(missingEvidence), "utf8")
    writeFileSync(
      rawEvidencePath,
      JSON.stringify({
        ...rolloutCandidate(),
        releaseApprovalEvidence: releaseApprovalEvidence({
          rawAuditJson: { stdout: "raw runner output", url: "https://internal.example" },
        }),
      }),
      "utf8",
    )

    const missing = spawnSync(
      process.execPath,
      authorizeArguments({
        databasePath,
        candidatePath: missingEvidencePath,
        scope: "rollout",
        authorizationId: "rollout-authorization:missing-active-tab-info-evidence",
      }),
      { encoding: "utf8" },
    )
    const raw = spawnSync(
      process.execPath,
      authorizeArguments({
        databasePath,
        candidatePath: rawEvidencePath,
        scope: "rollout",
        authorizationId: "rollout-authorization:raw-active-tab-info-evidence",
      }),
      { encoding: "utf8" },
    )

    expect(missing.status).not.toBe(0)
    expect(missing.stderr.trim()).toBe("authorization_release_approval_evidence_required")
    expect(raw.status).not.toBe(0)
    expect(raw.stderr.trim()).toBe("authorization_release_approval_evidence_raw_data")
    expect(`${missing.stderr}${raw.stderr}`).not.toMatch(/https?:\/\/|\/private\/|\/Users\//iu)
  })

  it("prepares approval candidates from release dry-run evidence without logging raw candidate details", () => {
    const directory = createDirectory("knowbee-task189-prepare-approval-candidate-")
    const databasePath = join(directory, "release.db")
    const baseCandidatePath = join(directory, "rollout-base.json")
    const dryRunPath = join(directory, "release-dry-run.json")
    const preparedPath = join(directory, "rollout-prepared.json")
    createReleaseEvidenceDatabase(databasePath).close()
    const { releaseApprovalEvidence: _ignored, ...baseCandidate } = rolloutCandidate()
    writeFileSync(baseCandidatePath, JSON.stringify(baseCandidate), "utf8")
    writeFileSync(
      dryRunPath,
      JSON.stringify({
        dryRun: true,
        releaseApprovalEvidence: releaseApprovalEvidence(),
      }),
      "utf8",
    )

    const prepared = spawnSync(
      process.execPath,
      [
        resolve("scripts/prepare-release-approval-candidate.mjs"),
        "--candidate",
        baseCandidatePath,
        "--release-dry-run",
        dryRunPath,
        "--output",
        preparedPath,
      ],
      { cwd: resolve("."), encoding: "utf8" },
    )

    expect(prepared.status, prepared.stderr).toBe(0)
    expect(prepared.stdout).toContain("Approval candidate prepared:")
    expect(prepared.stdout).toContain("output=rollout-prepared.json")
    expect(prepared.stdout).toContain(
      `activeTabInfoArtifact=yeonjang:browser-active-tab-info:evidence checksum=${ACTIVE_TAB_INFO_AUDIT_CHECKSUM}`,
    )
    expect(prepared.stdout).toContain(
      "counts=missingSources=0,missingTests=0,staleTests=0,rejectedSkipped=0,rejectedUnknown=0,rejectedPublicRawReports=0,failingTests=0",
    )
    expect(prepared.stdout).not.toMatch(
      /thresholds|baselineSnapshot|stdout|stderr|raw output|https?:\/\/|\/private\/|\/Users\//iu,
    )
    expect(prepared.stdout).not.toMatch(CLEANUP_TASK_PLAN_SUMMARY_FORBIDDEN_PATTERN)
    expect(prepared.stdout).not.toMatch(CLEANUP_PR_CHECKLIST_FORBIDDEN_PATTERN)
    expect(prepared.stdout).not.toMatch(CLEANUP_PR_REVIEW_RECEIPT_FORBIDDEN_PATTERN)
    expect(prepared.stdout).not.toMatch(CLEANUP_BRANCH_PREPARATION_PLAN_FORBIDDEN_PATTERN)
    expect(prepared.stdout).not.toMatch(CLEANUP_BRANCH_EXECUTION_ADMISSION_FORBIDDEN_PATTERN)
    expect(prepared.stdout).not.toMatch(CLEANUP_DELETION_CANDIDATE_PLAN_FORBIDDEN_PATTERN)
    expect(prepared.stdout).not.toMatch(CLEANUP_DELETION_REVIEW_RECEIPT_FORBIDDEN_PATTERN)
    expect(prepared.stdout).not.toMatch(CLEANUP_DELETION_EXECUTION_ADMISSION_FORBIDDEN_PATTERN)
    expect(prepared.stdout).not.toMatch(CLEANUP_DELETION_DRY_RUN_RECEIPT_FORBIDDEN_PATTERN)
    expect(prepared.stdout).not.toMatch(CLEANUP_DELETION_DRY_RUN_REVIEW_ACKNOWLEDGEMENT_RECEIPT_FORBIDDEN_PATTERN)
    const candidate = JSON.parse(readFileSync(preparedPath, "utf8")) as {
      releaseApprovalEvidence?: unknown
    }
    expect(candidate.releaseApprovalEvidence).toMatchObject(releaseApprovalEvidence())

    const authorized = spawnSync(
      process.execPath,
      authorizeArguments({
        databasePath,
        candidatePath: preparedPath,
        scope: "rollout",
        authorizationId: "rollout-authorization:prepared-candidate",
      }),
      { cwd: resolve("."), encoding: "utf8" },
    )
    expect(authorized.status, authorized.stderr).toBe(0)
    expect(authorized.stdout).toContain("Authorization recorded: rollout v1 (approved)")
    expect(authorized.stdout).toContain(
      `activeTabInfoArtifact=yeonjang:browser-active-tab-info:evidence checksum=${ACTIVE_TAB_INFO_AUDIT_CHECKSUM}`,
    )
    expect(`${authorized.stdout}${authorized.stderr}`).not.toMatch(
      CLEANUP_PR_CHECKLIST_FORBIDDEN_PATTERN,
    )
    expect(`${authorized.stdout}${authorized.stderr}`).not.toMatch(
      CLEANUP_PR_REVIEW_RECEIPT_FORBIDDEN_PATTERN,
    )
    expect(`${authorized.stdout}${authorized.stderr}`).not.toMatch(
      CLEANUP_BRANCH_PREPARATION_PLAN_FORBIDDEN_PATTERN,
    )
    expect(`${authorized.stdout}${authorized.stderr}`).not.toMatch(
      CLEANUP_BRANCH_EXECUTION_ADMISSION_FORBIDDEN_PATTERN,
    )
    expect(`${authorized.stdout}${authorized.stderr}`).not.toMatch(
      CLEANUP_DELETION_CANDIDATE_PLAN_FORBIDDEN_PATTERN,
    )
    expect(`${authorized.stdout}${authorized.stderr}`).not.toMatch(
      CLEANUP_DELETION_REVIEW_RECEIPT_FORBIDDEN_PATTERN,
    )
    expect(`${authorized.stdout}${authorized.stderr}`).not.toMatch(
      CLEANUP_DELETION_EXECUTION_ADMISSION_FORBIDDEN_PATTERN,
    )
  })

  it("does not copy or print manual review projection details from release dry-run JSON", () => {
    const directory = createDirectory("knowbee-task189-manual-review-cli-policy-")
    const databasePath = join(directory, "release.db")
    const baseCandidatePath = join(directory, "rollout-base.json")
    const dryRunPath = join(directory, "release-dry-run.json")
    const preparedPath = join(directory, "rollout-prepared.json")
    createReleaseEvidenceDatabase(databasePath).close()
    const { releaseApprovalEvidence: _ignored, ...baseCandidate } = rolloutCandidate()
    writeFileSync(baseCandidatePath, JSON.stringify(baseCandidate), "utf8")
    writeFileSync(
      dryRunPath,
      JSON.stringify({
        dryRun: true,
        releaseApprovalEvidence: releaseApprovalEvidence(),
        manifest: {
          yeonjangBrowserActiveTabInfoLiveEnableReview: manualReviewProjection(),
          yeonjangBrowserActiveTabInfoRuntimeTransition: runtimeTransitionProjection(),
          yeonjangBrowserActiveTabInfoActivationRequest: activationRequestProjection(),
          yeonjangBrowserActiveTabInfoRuntimeMutationPreflight: runtimeMutationPreflightProjection(),
          yeonjangBrowserActiveTabInfoRuntimeMutationExecutorPlan:
            runtimeMutationExecutorPlanProjection(),
          yeonjangBrowserActiveTabInfoRuntimeMutationDryRunReceipt:
            runtimeMutationDryRunReceiptProjection(),
          yeonjangBrowserActiveTabInfoLiveExecutionAuthorization:
            liveExecutionAuthorizationProjection(),
          yeonjangBrowserActiveTabInfoLiveExecutionReceipt:
            liveExecutionReceiptProjection(),
          yeonjangBrowserActiveTabInfoDispatchExecutionPlan:
            dispatchExecutionPlanProjection(),
          yeonjangBrowserActiveTabInfoDispatchDryRunReceipt:
            dispatchDryRunReceiptProjection(),
          yeonjangBrowserActiveTabInfoDispatchExecutionReceipt:
            dispatchExecutionReceiptProjection(),
          yeonjangBrowserActiveTabInfoDispatchVerificationAdmission:
            dispatchVerificationAdmissionProjection(),
          yeonjangBrowserActiveTabInfoLlmPostCheckDecisionReceipt:
            llmPostCheckDecisionReceiptProjection(),
        },
      }),
      "utf8",
    )

    const prepared = spawnSync(
      process.execPath,
      [
        resolve("scripts/prepare-release-approval-candidate.mjs"),
        "--candidate",
        baseCandidatePath,
        "--release-dry-run",
        dryRunPath,
        "--output",
        preparedPath,
      ],
      { cwd: resolve("."), encoding: "utf8" },
    )

    expect(prepared.status, prepared.stderr).toBe(0)
    expect(`${prepared.stdout}${prepared.stderr}`).not.toMatch(
      /activation request|yeonjangBrowserActiveTabInfoActivationRequest|executeNow|runtime transition|yeonjangBrowserActiveTabInfoRuntimeTransition|manual review|reviewIdHash|reviewerIdentityHash|expiresAt|auditOnlyEvidenceChecksums/iu,
    )
    expect(`${prepared.stdout}${prepared.stderr}`).not.toMatch(
      ACTIVE_TAB_RUNTIME_MUTATION_OUTPUT_PATTERN,
    )
    expect(`${prepared.stdout}${prepared.stderr}`).not.toMatch(
      OPERATOR_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_CLOSEOUT_ACKNOWLEDGEMENT_CLOSURE_LEDGER_RECEIPT_FORBIDDEN_PATTERN,
    )
    expect(`${prepared.stdout}${prepared.stderr}`).not.toMatch(
      CLEANUP_TASK_PLAN_SUMMARY_FORBIDDEN_PATTERN,
    )
    expect(`${prepared.stdout}${prepared.stderr}`).not.toMatch(
      CLEANUP_PR_CHECKLIST_FORBIDDEN_PATTERN,
    )
    expect(`${prepared.stdout}${prepared.stderr}`).not.toMatch(
      CLEANUP_PR_REVIEW_RECEIPT_FORBIDDEN_PATTERN,
    )
    expect(`${prepared.stdout}${prepared.stderr}`).not.toMatch(
      CLEANUP_BRANCH_PREPARATION_PLAN_FORBIDDEN_PATTERN,
    )
    expect(`${prepared.stdout}${prepared.stderr}`).not.toMatch(
      CLEANUP_BRANCH_EXECUTION_ADMISSION_FORBIDDEN_PATTERN,
    )
    expect(`${prepared.stdout}${prepared.stderr}`).not.toMatch(
      CLEANUP_DELETION_CANDIDATE_PLAN_FORBIDDEN_PATTERN,
    )
    expect(`${prepared.stdout}${prepared.stderr}`).not.toMatch(
      CLEANUP_DELETION_REVIEW_RECEIPT_FORBIDDEN_PATTERN,
    )
    expect(`${prepared.stdout}${prepared.stderr}`).not.toMatch(
      CLEANUP_DELETION_EXECUTION_ADMISSION_FORBIDDEN_PATTERN,
    )
    expect(`${prepared.stdout}${prepared.stderr}`).not.toContain(MANUAL_REVIEW_CHECKSUM)
    expect(`${prepared.stdout}${prepared.stderr}`).not.toContain(MANUAL_REVIEWER_HASH)
    expect(`${prepared.stdout}${prepared.stderr}`).not.toContain(MANUAL_REVIEW_ID_HASH)

    const candidate = JSON.parse(readFileSync(preparedPath, "utf8")) as Record<string, unknown>
    expect(candidate.releaseApprovalEvidence).toMatchObject(releaseApprovalEvidence())
    expect(candidate).not.toHaveProperty("yeonjangBrowserActiveTabInfoLiveEnableReview")
    expect(candidate).not.toHaveProperty("yeonjangBrowserActiveTabInfoRuntimeTransition")
    expect(candidate).not.toHaveProperty("yeonjangBrowserActiveTabInfoActivationRequest")
    expect(candidate).not.toHaveProperty("yeonjangBrowserActiveTabInfoRuntimeMutationPreflight")
    expect(candidate).not.toHaveProperty("yeonjangBrowserActiveTabInfoRuntimeMutationExecutorPlan")
    expect(candidate).not.toHaveProperty("yeonjangBrowserActiveTabInfoRuntimeMutationDryRunReceipt")
    expect(candidate).not.toHaveProperty("yeonjangBrowserActiveTabInfoLiveExecutionAuthorization")
    expect(candidate).not.toHaveProperty("yeonjangBrowserActiveTabInfoLiveExecutionReceipt")
    expect(candidate).not.toHaveProperty("yeonjangBrowserActiveTabInfoDispatchExecutionPlan")
    expect(candidate).not.toHaveProperty("yeonjangBrowserActiveTabInfoDispatchDryRunReceipt")
    expect(candidate).not.toHaveProperty("yeonjangBrowserActiveTabInfoDispatchExecutionReceipt")
    expect(candidate).not.toHaveProperty("yeonjangBrowserActiveTabInfoDispatchVerificationAdmission")
    expect(candidate).not.toHaveProperty("yeonjangBrowserActiveTabInfoLlmPostCheckDecisionReceipt")
    expect(JSON.stringify(candidate)).not.toMatch(
      /activation request|yeonjangBrowserActiveTabInfoActivationRequest|executeNow|activation_request_ready/iu,
    )
    expect(JSON.stringify(candidate)).not.toMatch(ACTIVE_TAB_RUNTIME_MUTATION_OUTPUT_PATTERN)
    expect(JSON.stringify(candidate)).not.toMatch(
      OPERATOR_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_CLOSEOUT_ACKNOWLEDGEMENT_CLOSURE_LEDGER_RECEIPT_FORBIDDEN_PATTERN,
    )
    expect(JSON.stringify(candidate)).not.toMatch(CLEANUP_TASK_PLAN_SUMMARY_FORBIDDEN_PATTERN)
    expect(JSON.stringify(candidate)).not.toMatch(CLEANUP_PR_CHECKLIST_FORBIDDEN_PATTERN)
    expect(JSON.stringify(candidate)).not.toMatch(CLEANUP_PR_REVIEW_RECEIPT_FORBIDDEN_PATTERN)
    expect(JSON.stringify(candidate)).not.toMatch(CLEANUP_BRANCH_PREPARATION_PLAN_FORBIDDEN_PATTERN)
    expect(JSON.stringify(candidate)).not.toMatch(CLEANUP_BRANCH_EXECUTION_ADMISSION_FORBIDDEN_PATTERN)
    expect(JSON.stringify(candidate)).not.toMatch(CLEANUP_DELETION_CANDIDATE_PLAN_FORBIDDEN_PATTERN)
    expect(JSON.stringify(candidate)).not.toMatch(CLEANUP_DELETION_REVIEW_RECEIPT_FORBIDDEN_PATTERN)
    expect(JSON.stringify(candidate)).not.toMatch(CLEANUP_DELETION_EXECUTION_ADMISSION_FORBIDDEN_PATTERN)
    expect(JSON.stringify(candidate)).not.toMatch(CLEANUP_DELETION_DRY_RUN_RECEIPT_FORBIDDEN_PATTERN)
    expect(JSON.stringify(candidate)).not.toMatch(CLEANUP_DELETION_DRY_RUN_REVIEW_ACKNOWLEDGEMENT_RECEIPT_FORBIDDEN_PATTERN)
    expect(JSON.stringify(candidate)).not.toContain(MANUAL_REVIEW_CHECKSUM)
    expect(JSON.stringify(candidate)).not.toContain(MANUAL_REVIEWER_HASH)
    expect(JSON.stringify(candidate)).not.toContain(MANUAL_REVIEW_ID_HASH)

    const authorized = spawnSync(
      process.execPath,
      authorizeArguments({
        databasePath,
        candidatePath: preparedPath,
        scope: "rollout",
        authorizationId: "rollout-authorization:manual-review-cli-policy",
      }),
      { cwd: resolve("."), encoding: "utf8" },
    )
    expect(authorized.status, authorized.stderr).toBe(0)
    expect(`${authorized.stdout}${authorized.stderr}`).not.toMatch(
      /activation request|yeonjangBrowserActiveTabInfoActivationRequest|executeNow|runtime transition|yeonjangBrowserActiveTabInfoRuntimeTransition|manual review|reviewIdHash|reviewerIdentityHash|expiresAt|auditOnlyEvidenceChecksums/iu,
    )
    expect(`${authorized.stdout}${authorized.stderr}`).not.toMatch(
      ACTIVE_TAB_RUNTIME_MUTATION_OUTPUT_PATTERN,
    )
    expect(`${authorized.stdout}${authorized.stderr}`).not.toMatch(
      OPERATOR_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_CLOSEOUT_ACKNOWLEDGEMENT_CLOSURE_LEDGER_RECEIPT_FORBIDDEN_PATTERN,
    )
    expect(`${authorized.stdout}${authorized.stderr}`).not.toMatch(
      CLEANUP_TASK_PLAN_SUMMARY_FORBIDDEN_PATTERN,
    )
    expect(`${authorized.stdout}${authorized.stderr}`).not.toMatch(
      CLEANUP_PR_CHECKLIST_FORBIDDEN_PATTERN,
    )
    expect(`${authorized.stdout}${authorized.stderr}`).not.toMatch(
      CLEANUP_PR_REVIEW_RECEIPT_FORBIDDEN_PATTERN,
    )
    expect(`${authorized.stdout}${authorized.stderr}`).not.toMatch(
      CLEANUP_BRANCH_PREPARATION_PLAN_FORBIDDEN_PATTERN,
    )
    expect(`${authorized.stdout}${authorized.stderr}`).not.toMatch(
      CLEANUP_BRANCH_EXECUTION_ADMISSION_FORBIDDEN_PATTERN,
    )
    expect(`${authorized.stdout}${authorized.stderr}`).not.toMatch(
      CLEANUP_DELETION_CANDIDATE_PLAN_FORBIDDEN_PATTERN,
    )
    expect(`${authorized.stdout}${authorized.stderr}`).not.toMatch(
      CLEANUP_DELETION_REVIEW_RECEIPT_FORBIDDEN_PATTERN,
    )
    expect(`${authorized.stdout}${authorized.stderr}`).not.toMatch(
      CLEANUP_DELETION_EXECUTION_ADMISSION_FORBIDDEN_PATTERN,
    )
    expect(`${authorized.stdout}${authorized.stderr}`).not.toContain(MANUAL_REVIEW_CHECKSUM)
    expect(`${authorized.stdout}${authorized.stderr}`).not.toContain(MANUAL_REVIEWER_HASH)
    expect(`${authorized.stdout}${authorized.stderr}`).not.toContain(MANUAL_REVIEW_ID_HASH)
  })

  it("fails approval candidate preparation with reason codes only for unsafe evidence inputs", () => {
    const directory = createDirectory("knowbee-task189-prepare-failure-")
    const baseCandidatePath = join(directory, "rollout-base.json")
    const missingEvidencePath = join(directory, "missing-release-evidence.json")
    const invalidChecksumPath = join(directory, "invalid-checksum.json")
    const inconsistentReadinessPath = join(directory, "inconsistent-readiness.json")
    const rawEvidencePath = join(directory, "raw-release-evidence.json")
    const validEvidencePath = join(directory, "valid-release-evidence.json")
    const existingOutputPath = join(directory, "existing-output.json")
    writeFileSync(baseCandidatePath, JSON.stringify(rolloutCandidate()), "utf8")
    writeFileSync(missingEvidencePath, JSON.stringify({ dryRun: true }), "utf8")
    writeFileSync(
      invalidChecksumPath,
      JSON.stringify({
        dryRun: true,
        releaseApprovalEvidence: releaseApprovalEvidence({
          activeTabInfoAuditArtifact: {
            id: "yeonjang:browser-active-tab-info:evidence",
            checksum: "not-a-checksum",
            packagePath: "audit/yeonjang/browser-active-tab-info-evidence.json",
          },
        }),
      }),
      "utf8",
    )
    writeFileSync(
      inconsistentReadinessPath,
      JSON.stringify({
        dryRun: true,
        releaseApprovalEvidence: releaseApprovalEvidence({
          readiness: { status: "ready", blockerCodes: ["live_acceptance_failed"] },
        }),
      }),
      "utf8",
    )
    writeFileSync(
      rawEvidencePath,
      JSON.stringify({
        dryRun: true,
        releaseApprovalEvidence: releaseApprovalEvidence({
          rawAuditJson: { stderr: "raw error", url: "https://internal.example" },
        }),
      }),
      "utf8",
    )
    writeFileSync(
      validEvidencePath,
      JSON.stringify({ dryRun: true, releaseApprovalEvidence: releaseApprovalEvidence() }),
      "utf8",
    )
    writeFileSync(existingOutputPath, "already exists\n", "utf8")

    const runPrepare = (releaseDryRunPath: string, outputPath = join(directory, "prepared.json")) =>
      spawnSync(
        process.execPath,
        [
          resolve("scripts/prepare-release-approval-candidate.mjs"),
          "--candidate",
          baseCandidatePath,
          "--release-dry-run",
          releaseDryRunPath,
          "--output",
          outputPath,
        ],
        { cwd: resolve("."), encoding: "utf8" },
      )

    const missing = runPrepare(missingEvidencePath)
    const invalidChecksum = runPrepare(invalidChecksumPath)
    const inconsistent = runPrepare(inconsistentReadinessPath)
    const raw = runPrepare(rawEvidencePath)
    const existing = runPrepare(validEvidencePath, existingOutputPath)

    expect(missing.status).not.toBe(0)
    expect(missing.stderr.trim()).toBe("release_approval_evidence_required")
    expect(invalidChecksum.status).not.toBe(0)
    expect(invalidChecksum.stderr.trim()).toBe("release_approval_evidence_invalid")
    expect(inconsistent.status).not.toBe(0)
    expect(inconsistent.stderr.trim()).toBe("release_approval_evidence_invalid")
    expect(raw.status).not.toBe(0)
    expect(raw.stderr.trim()).toBe("release_approval_evidence_raw_data")
    expect(existing.status).not.toBe(0)
    expect(existing.stderr.trim()).toBe("approval_candidate_output_exists")
    expect(
      [
        missing.stderr,
        invalidChecksum.stderr,
        inconsistent.stderr,
        raw.stderr,
        existing.stderr,
        missing.stdout,
        invalidChecksum.stdout,
        inconsistent.stdout,
        raw.stdout,
        existing.stdout,
      ].join("\n"),
    ).not.toMatch(
      /rollout-base|missing-release-evidence|invalid-checksum|inconsistent-readiness|raw-release-evidence|stdout|stderr|raw error|https?:\/\/|thresholds|baselineSnapshot|\/private\/|\/Users\//iu,
    )
  })

  it("requires and reads an explicit rollout database together with exact performance evidence", () => {
    const directory = createDirectory("knowbee-task189-release-")
    const databasePath = join(directory, "release.db")
    const performancePath = join(directory, "performance.json")
    const rolloutPath = join(directory, "rollout.json")
    const database = createReleaseEvidenceDatabase(databasePath)
    for (const flowId of REQUIRED_REPRESENTATIVE_FLOW_IDS) {
      database
        .prepare("INSERT INTO root_runs VALUES (?, 'completed', 100, 200)")
        .run(`run:${flowId}`)
    }
    database.close()
    writeFileSync(performancePath, JSON.stringify(performanceCandidate()), "utf8")
    writeFileSync(rolloutPath, JSON.stringify(rolloutCandidate()), "utf8")
    for (const input of [
      {
        databasePath,
        candidatePath: performancePath,
        scope: "performance" as const,
        authorizationId: "performance-authorization:task189-release",
      },
      {
        databasePath,
        candidatePath: rolloutPath,
        scope: "rollout" as const,
        authorizationId: "rollout-authorization:task189-release",
      },
    ]) {
      const result = spawnSync(process.execPath, authorizeArguments(input), { encoding: "utf8" })
      expect(result.status, result.stderr).toBe(0)
    }

    const script = resolve("scripts/release-package.mjs")
    const rolloutSelector = [
      "--rollout-policy-id",
      rolloutCandidate().policyId,
      "--rollout-policy-version",
      "1",
      "--rollout-policy-mode",
      "limited_beta",
    ]
    const missingDatabase = spawnSync(process.execPath, [script, "--dry-run", ...rolloutSelector], {
      cwd: resolve("."),
      encoding: "utf8",
    })
    expect(missingDatabase.status).not.toBe(0)
    expect(missingDatabase.stderr).toContain("rollout_policy_database_required")

    const performance = performanceCandidate()
    const selected = spawnSync(
      process.execPath,
      [
        script,
        "--dry-run",
        "--json",
        "--rollout-database",
        databasePath,
        ...rolloutSelector,
        "--database",
        databasePath,
        "--matrix-id",
        performance.matrixId,
        "--matrix-version",
        "1",
        "--baseline-version",
        performance.baselineVersion,
        ...REQUIRED_REPRESENTATIVE_FLOW_IDS.flatMap((flowId) => [
          "--run",
          `${flowId}=run:${flowId}`,
        ]),
      ],
      { cwd: resolve("."), encoding: "utf8", env: { ...process.env } },
    )
    expect(selected.status, selected.stderr).toBe(0)
    const result = JSON.parse(selected.stdout) as {
      readiness: { blockerCodes: string[] }
      manifest: {
        performanceEvidence: { acceptance: { status: string } }
        subAgentReleaseGate: { checks: Array<{ id: string; status: string }> }
      }
    }
    expect(result.manifest.performanceEvidence.acceptance.status).toBe("accepted")
    expect(result.manifest.subAgentReleaseGate.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "performance_acceptance", status: "passed" }),
        expect.objectContaining({ id: "benchmark_threshold", status: "passed" }),
      ]),
    )
    expect(result.readiness.blockerCodes).toContain("live_acceptance_failed")

    const standardDryRun = spawnSync(
      process.execPath,
      [
        resolve("scripts/run-release-dry-run-rehearsal.mjs"),
        "--json",
        "--rollout-database",
        databasePath,
        ...rolloutSelector,
        "--database",
        databasePath,
        "--matrix-id",
        performance.matrixId,
        "--matrix-version",
        "1",
        "--baseline-version",
        performance.baselineVersion,
        ...REQUIRED_REPRESENTATIVE_FLOW_IDS.flatMap((flowId) => [
          "--run",
          `${flowId}=run:${flowId}`,
        ]),
      ],
      {
        cwd: resolve("."),
        encoding: "utf8",
        env: { ...process.env },
        maxBuffer: 16 * 1024 * 1024,
      },
    )
    expect(standardDryRun.status, standardDryRun.stderr).toBe(0)
    const standardResult = JSON.parse(standardDryRun.stdout) as {
      readiness: { blockerCodes: string[] }
      manifest: { operationalRehearsalEvidence: { status: string } }
    }
    expect(standardResult.manifest.operationalRehearsalEvidence.status).toBe("passed")
    expect(standardResult.readiness.blockerCodes).toEqual([
      "yeonjang_active_tab_info_release_gate_failed",
      "live_acceptance_failed",
    ])
  })

  it("exposes the administrator command as the standard package workflow", () => {
    const packageJson = require("../package.json") as { scripts?: Record<string, string> }
    expect(packageJson.scripts?.["release:authorize"]).toBe(
      "node scripts/authorize-release-readiness.mjs",
    )
    expect(packageJson.scripts?.["release:prepare-approval-candidate"]).toBe(
      "node scripts/prepare-release-approval-candidate.mjs",
    )
  })
})
