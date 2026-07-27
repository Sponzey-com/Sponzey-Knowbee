import { type SubAgentBenchmarkReleaseGateSummary } from "../benchmarks/sub-agent-benchmarks.js";
import type { PersistedChannelSmokeRunResult } from "../channels/smoke-runner.js";
import { type MigrationPreflightReport } from "../config/backup-rehearsal.js";
import { type RuntimePaths } from "../config/paths.js";
import { type KnowbeeConfig } from "../config/types.js";
import { type PlanDriftReleaseNoteEvidence } from "../diagnostics/plan-drift.js";
import type { LivePerformanceEvidenceSource } from "../maintenance/live-performance-evidence.js";
import { type PromptSourceMetadata } from "../memory/knowbee-md.js";
import type { ExtensionLiveSmokeSummary } from "../runs/extension-live-smoke.js";
import { type WebRetrievalLiveSmokeSummary, type WebRetrievalReleaseGateSummary } from "../runs/web-retrieval-smoke.js";
import type { YeonjangLiveSmokeSummary } from "../runs/yeonjang-live-smoke.js";
import { type FeatureFlagMode } from "../runtime/rollout-safety.js";
import { type ChannelLiveEvidenceRejection } from "./channel-live-acceptance-evidence.js";
import { type ConversationProcessReleaseCandidate, type ConversationProcessReleaseEvidence } from "./conversation-process-release-evidence.js";
import { type EnterpriseTopologyReleaseReadinessSummary } from "./enterprise-topology-release-gate.js";
import { type ExtensionLiveEvidenceRejection } from "./extension-live-acceptance-evidence.js";
import { type LiveAcceptanceAdmissionResult, type LiveAcceptanceCapability, type LiveAcceptanceEvidence, type ReleaseAudience } from "./live-acceptance-admission.js";
import { type LivePerformanceAcceptanceRunSelector } from "./live-performance-acceptance-collection.js";
import { type MemoryCompactionReleaseGateSummary } from "./memory-compaction-gate.js";
import { type OperationalRehearsalEvidenceInput, type OperationalRehearsalEvidenceSummary } from "./operational-rehearsal-evidence.js";
import type { PerformanceAcceptanceAuthorizationRepository, PerformanceAcceptanceMatrixSelector } from "./performance-acceptance-authorization.js";
import { type ReleasePerformanceSummary } from "./performance-gate.js";
import { type ReleasePolicyAuthorizationRepository, type ReleaseRolloutPolicySelector } from "./release-policy-authorization.js";
import { type SubAgentReleaseReadinessSummary } from "./sub-agent-release-gate.js";
import { type UiModeReleaseGateSummary } from "./ui-mode-gate.js";
import { type WebLiveEvidenceRejection } from "./web-live-acceptance-evidence.js";
import { type YeonjangLiveEvidenceRejection } from "./yeonjang-live-acceptance-evidence.js";
import { type VerifiedYeonjangAcceptanceEvidenceInput, type VerifiedYeonjangEvidenceRejection } from "./yeonjang-verified-acceptance-evidence.js";
import { type YeonjangPlatformAcceptanceMatrix, type YeonjangPlatformCapabilityReceipt, type YeonjangPlatformDeterministicReceipt, type YeonjangPlatformLiveRecord } from "./yeonjang-platform-acceptance.js";
import { type YeonjangBrowserActiveTabInfoReleaseGateSummary } from "./yeonjang-browser-active-tab-info-release-gate-summary.js";
import { type YeonjangBrowserActiveTabInfoReleaseGateModuleEvidence, type YeonjangBrowserActiveTabInfoReleaseGateRepositoryEvidencePort, type YeonjangBrowserActiveTabInfoReleaseGateTestEvidence } from "./yeonjang-browser-active-tab-info-release-gate-evidence-collector.js";
import { type YeonjangMultiInstanceReleaseGateSummary, type YeonjangProfileSmokeEvidence } from "./yeonjang-multi-instance-gate.js";
import { type YeonjangBrowserActiveTabInfoLiveEnableReviewProjection } from "./yeonjang-browser-active-tab-info-live-enable-review.js";
import { type YeonjangBrowserActiveTabInfoLiveEnableProjection } from "./yeonjang-browser-active-tab-info-live-enable-state-machine.js";
import { type YeonjangBrowserActiveTabInfoLiveEnablePrerequisitesProjection } from "./yeonjang-browser-active-tab-info-live-enable-prerequisites.js";
export type ReleaseTargetPlatform = "macos" | "windows" | "linux";
export type ReleaseArtifactKind = "gateway_node_bundle" | "webui_static" | "yeonjang_macos_app" | "yeonjang_windows_exe" | "yeonjang_linux_binary" | "yeonjang_script" | "yeonjang_protocol" | "db_migration" | "prompt_seed" | "release_runbook" | "admin_diagnostic_bundle" | "active_tab_info_audit_bundle";
export type ReleaseArtifactStatus = "present" | "missing_required" | "missing_optional";
export type ReleaseArtifactAudience = "release_package" | "audit_only" | "external_signer";
export type ReleaseArtifactRedactionPolicy = "sanitized" | "source_contract" | "raw_by_design";
export type ReleaseArtifactRetentionPolicy = "release_lifecycle" | "operator_cleanup";
export interface ReleaseArtifactHandlingPolicy {
    purpose: string;
    audience: ReleaseArtifactAudience;
    redaction: ReleaseArtifactRedactionPolicy;
    retention: ReleaseArtifactRetentionPolicy;
    rawDataAllowed: boolean;
}
export interface ReleaseArtifactDefinition {
    id: string;
    kind: ReleaseArtifactKind;
    sourcePath: string;
    packagePath: string;
    required: boolean;
    platform?: ReleaseTargetPlatform;
    description: string;
    handling: ReleaseArtifactHandlingPolicy;
}
export interface ReleaseArtifact extends ReleaseArtifactDefinition {
    status: ReleaseArtifactStatus;
    sizeBytes: number | null;
    checksum: string | null;
}
export interface ReleaseManifest {
    kind: "knowbee.release.package";
    version: 2;
    releaseVersion: string;
    appVersion: string;
    gitTag: string | null;
    gitCommit: string | null;
    createdAt: string;
    rootDir: string;
    targetPlatforms: ReleaseTargetPlatform[];
    artifacts: ReleaseArtifact[];
    requiredMissing: string[];
    checksums: Array<{
        id: string;
        checksum: string;
        packagePath: string;
    }>;
    backupInventory: {
        included: number;
        excluded: number;
        promptSources: number;
        logicalCoverage: string[];
    };
    updatePreflight: ReleaseUpdatePreflightReport;
    migrationPreflight: Pick<MigrationPreflightReport, "ok" | "risk" | "currentSchemaVersion" | "latestSchemaVersion" | "pendingVersions">;
    featureFlags: ReleaseFeatureFlagState[];
    rolloutEvidence: ReleaseRolloutEvidenceSummary;
    planEvidence: PlanDriftReleaseNoteEvidence;
    webRetrievalEvidence: WebRetrievalReleaseGateSummary;
    uiModeEvidence: UiModeReleaseGateSummary;
    yeonjangMultiInstanceEvidence: YeonjangMultiInstanceReleaseGateSummary;
    memoryCompactionEvidence: MemoryCompactionReleaseGateSummary;
    operationalRehearsalEvidence: OperationalRehearsalEvidenceSummary;
    performanceEvidence: ReleasePerformanceSummary;
    benchmarkEvidence: SubAgentBenchmarkReleaseGateSummary;
    subAgentReleaseGate: SubAgentReleaseReadinessSummary;
    enterpriseTopologyReleaseGate: EnterpriseTopologyReleaseReadinessSummary;
    orchestrationEvidence: ReleaseOrchestrationEvidenceSummary;
    liveAcceptance: LiveAcceptanceAdmissionResult;
    channelLiveAcceptanceProduction: {
        acceptedCount: number;
        rejected: ChannelLiveEvidenceRejection[];
    };
    conversationProcessEvidence: ConversationProcessReleaseEvidence;
    webLiveAcceptanceProduction: {
        acceptedCount: number;
        rejected: WebLiveEvidenceRejection[];
    };
    extensionLiveAcceptanceProduction: {
        acceptedCounts: {
            skill: number;
            mcp: number;
        };
        rejected: ExtensionLiveEvidenceRejection[];
    };
    yeonjangLiveAcceptanceProduction: {
        acceptedCount: number;
        rejected: YeonjangLiveEvidenceRejection[];
    };
    yeonjangVerifiedAcceptanceProduction: {
        acceptedCount: number;
        rejected: VerifiedYeonjangEvidenceRejection[];
    };
    yeonjangPlatformAcceptance: YeonjangPlatformAcceptanceMatrix;
    yeonjangBrowserActiveTabInfoReleaseGate: YeonjangBrowserActiveTabInfoReleaseGateSummary;
    yeonjangBrowserActiveTabInfoEvidenceCompleteness: YeonjangBrowserActiveTabInfoEvidenceCompleteness;
    yeonjangBrowserActiveTabInfoAuditArtifact: ReleaseGeneratedAuditArtifact;
    yeonjangBrowserActiveTabInfoLiveEnableReview: YeonjangBrowserActiveTabInfoLiveEnableReviewProjection;
    yeonjangBrowserActiveTabInfoRuntimeTransition: YeonjangBrowserActiveTabInfoLiveEnableProjection;
    yeonjangBrowserActiveTabInfoLiveEnablePrerequisites: YeonjangBrowserActiveTabInfoLiveEnablePrerequisitesProjection;
    releaseNotes: ReleaseNoteSummary;
    pipeline: ReleasePipelinePlan;
    rollback: ReleaseRollbackRunbook;
    cleanInstallChecklist: ReleaseChecklistItem[];
}
export interface YeonjangBrowserActiveTabInfoEvidenceCompleteness {
    schemaVersion: "yeonjang-browser-active-tab-info-evidence-completeness-v1";
    visibility: "release_summary";
    missingSourceCount: number;
    missingTestCount: number;
    staleTestCount: number;
    rejectedSkippedTestCount: number;
    rejectedUnknownTestCount: number;
    rejectedPublicRawReportCount: number;
    failingTestCount: number;
    auditDetailVisibility: "audit_only";
    auditDetailPaths: {
        missingSourcePaths: string[];
        missingTestPaths: string[];
        staleTestPaths: string[];
        rejectedSkippedTestPaths: string[];
        rejectedUnknownTestPaths: string[];
        rejectedPublicRawReportPaths: string[];
        failingTestPaths: string[];
    };
}
export interface ReleaseGeneratedAuditArtifact {
    id: "yeonjang:browser-active-tab-info:evidence";
    kind: "active_tab_info_audit_bundle";
    packagePath: "audit/yeonjang/browser-active-tab-info-evidence.json";
    audience: "audit_only";
    redaction: "sanitized";
    rawDataAllowed: false;
    sizeBytes: number;
    checksum: string;
}
export interface ReleasePipelineStep {
    id: string;
    title: string;
    command: string[];
    required: boolean;
    smoke: boolean;
    description: string;
}
export interface ReleaseFeatureFlagState {
    featureKey: string;
    mode: FeatureFlagMode;
    compatibilityMode: boolean;
    source: "default" | "db";
}
export type ReleaseOrchestrationEvidenceStatus = "passed" | "warning" | "failed";
export interface ReleaseOrchestrationEvidenceCheck {
    id: "feature_flag_off_parity" | "no_agent_fallback" | "runtime_flag_default";
    status: ReleaseOrchestrationEvidenceStatus;
    summary: string;
    detail: Record<string, unknown>;
}
export interface ReleaseOrchestrationEvidenceSummary {
    kind: "knowbee.release.orchestration";
    generatedAt: string;
    gateStatus: ReleaseOrchestrationEvidenceStatus;
    checks: ReleaseOrchestrationEvidenceCheck[];
    warnings: string[];
    blockingFailures: string[];
}
export interface ReleaseRolloutEvidenceSummary {
    mismatchCount: number;
    warningCount: number;
    blockedCount: number;
    latest: Array<{
        featureKey: string;
        stage: string;
        status: string;
        summary: string;
    }>;
}
export interface ReleasePipelinePlan {
    dryRunSafe: true;
    order: string[];
    steps: ReleasePipelineStep[];
}
export interface ReleaseRollbackRunbook {
    id: "release-rollback-runbook";
    title: string;
    stopBeforeRollback: string[];
    restoreTargets: string[];
    steps: string[];
    verification: string[];
    retryForbiddenWhen: string[];
}
export interface ReleaseChecklistItem {
    id: string;
    required: boolean;
    description: string;
}
export interface ReleaseNoteSummary {
    featureFlagDefaults: string[];
    migrationCautions: string[];
    rollbackProcedure: string[];
    knownLimitations: string[];
}
export interface ReleaseUpdatePreflightCheck {
    id: string;
    ok: boolean;
    required: boolean;
    message: string;
}
export interface ReleaseUpdatePreflightReport {
    ok: boolean;
    checks: ReleaseUpdatePreflightCheck[];
}
export interface ReleaseManifestOptions {
    rootDir?: string;
    outputDir?: string;
    releaseVersion?: string;
    gitTag?: string | null;
    gitCommit?: string | null;
    targetPlatforms?: ReleaseTargetPlatform[];
    now?: Date;
    promptSources?: PromptSourceMetadata[];
    config?: KnowbeeConfig;
    runtimePaths?: RuntimePaths;
    rolloutThresholdPolicySelection?: {
        selector: ReleaseRolloutPolicySelector;
        repository: ReleasePolicyAuthorizationRepository;
    };
    livePerformanceAcceptanceSelection?: ReleaseLivePerformanceAcceptanceSelection;
    operationalRehearsalEvidence?: Omit<OperationalRehearsalEvidenceInput, "candidate">;
    releaseAudience?: ReleaseAudience;
    requiredLiveCapabilities?: readonly LiveAcceptanceCapability[];
    liveAcceptanceEvidence?: readonly LiveAcceptanceEvidence[];
    liveAcceptanceMaxAgeMs?: number;
    channelLiveSmokeRuns?: readonly PersistedChannelSmokeRunResult[];
    conversationProcessLiveCandidates?: readonly ConversationProcessReleaseCandidate[];
    conversationProcessMaxAgeMs?: number;
    webLiveSmokeRuns?: readonly WebRetrievalLiveSmokeSummary[];
    webLiveSourceMaxAgeMs?: number;
    extensionLiveSmokeRuns?: readonly ExtensionLiveSmokeSummary[];
    yeonjangLiveSmokeRuns?: readonly YeonjangLiveSmokeSummary[];
    yeonjangLiveSessionMaxAgeMs?: number;
    yeonjangVerifiedAcceptanceEvidence?: readonly VerifiedYeonjangAcceptanceEvidenceInput[];
    availableYeonjangPlatforms?: readonly ReleaseTargetPlatform[];
    yeonjangPlatformDeterministicReceipts?: readonly YeonjangPlatformDeterministicReceipt[];
    yeonjangPlatformLiveRecords?: readonly YeonjangPlatformLiveRecord[];
    yeonjangPlatformRequiredCapabilityMethods?: readonly string[];
    yeonjangPlatformCapabilityReceipts?: readonly YeonjangPlatformCapabilityReceipt[];
    yeonjangAutoCollectPlatformCapabilityReadiness?: boolean;
    yeonjangProfileSmokeEvidence?: readonly YeonjangProfileSmokeEvidence[];
    yeonjangProfileSmokeMaxAgeMs?: number;
    yeonjangBrowserActiveTabInfoReleaseGateEvidence?: {
        moduleEvidence: readonly YeonjangBrowserActiveTabInfoReleaseGateModuleEvidence[];
        testEvidence: readonly YeonjangBrowserActiveTabInfoReleaseGateTestEvidence[];
        publicRawLeakDetected?: boolean;
        reviewBypassDetected?: boolean;
        unsafeEvidenceRefDetected?: boolean;
    };
    yeonjangBrowserActiveTabInfoReleaseGateRepositoryEvidence?: {
        evidencePort: YeonjangBrowserActiveTabInfoReleaseGateRepositoryEvidencePort;
        publicRawLeakDetected?: boolean;
        reviewBypassDetected?: boolean;
        unsafeEvidenceRefDetected?: boolean;
    };
    yeonjangBrowserActiveTabInfoLiveEnableReviewRecord?: unknown;
}
export interface ReleaseLivePerformanceAcceptanceSelection {
    selector: PerformanceAcceptanceMatrixSelector;
    repository: PerformanceAcceptanceAuthorizationRepository;
    source: LivePerformanceEvidenceSource;
    runs: readonly LivePerformanceAcceptanceRunSelector[];
}
export interface ReleasePackageWriteResult {
    outputDir: string;
    manifestPath: string;
    checksumPath: string;
    copiedArtifacts: Array<{
        id: string;
        sourcePath: string;
        targetPath: string;
    }>;
    activeTabInfoAuditVerification: ReleaseActiveTabInfoAuditPackageVerification;
    manifest: ReleaseManifest;
}
export type ReleaseReadinessBlockerCode = "required_artifact_missing" | "update_preflight_failed" | "migration_preflight_failed" | "performance_gate_failed" | "benchmark_gate_failed" | "sub_agent_gate_failed" | "enterprise_topology_gate_failed" | "orchestration_gate_failed" | "web_retrieval_gate_failed" | "ui_mode_gate_failed" | "yeonjang_multi_instance_gate_failed" | "yeonjang_active_tab_info_release_gate_failed" | "memory_compaction_gate_failed" | "live_acceptance_failed" | "npm_install_rehearsal_failed" | "backup_restore_rehearsal_failed" | "artifact_cleanup_smoke_failed";
export interface ReleaseReadinessDecision {
    status: "ready" | "blocked";
    blockerCodes: ReleaseReadinessBlockerCode[];
}
export interface ReleaseReadinessFailureSummary {
    visibility: "release_operator_summary";
    lines: string[];
}
export interface ReleaseApprovalEvidenceProjection {
    schemaVersion: "knowbee.release-approval-evidence.v1";
    visibility: "release_operator_summary";
    readiness: {
        status: ReleaseReadinessDecision["status"];
        blockerCodes: readonly ReleaseReadinessBlockerCode[];
    };
    activeTabInfoAuditArtifact: {
        id: ReleaseGeneratedAuditArtifact["id"];
        checksum: string;
        packagePath: ReleaseGeneratedAuditArtifact["packagePath"];
    };
    activeTabInfoEvidenceCompleteness: {
        missingSourceCount: number;
        missingTestCount: number;
        staleTestCount: number;
        rejectedSkippedTestCount: number;
        rejectedUnknownTestCount: number;
        rejectedPublicRawReportCount: number;
        failingTestCount: number;
    };
}
export type ReleaseApprovalEvidenceValidationReasonCode = "release_approval_evidence_required" | "release_approval_evidence_raw_data" | "release_approval_evidence_invalid";
export type ReleaseApprovalEvidenceValidationResult = {
    status: "valid";
    evidence: ReleaseApprovalEvidenceProjection;
} | {
    status: "rejected";
    reasonCode: ReleaseApprovalEvidenceValidationReasonCode;
};
export type ReleaseProjectionSurface = "release_summary" | "release_package_dry_run_json" | "release_approval_cli_output" | "release_prepared_candidate_cli_output" | "release_manifest_public_fields" | "final_response" | "product_log" | "audit_artifact_descriptor" | "audit_artifact_payload";
export interface ReleaseActiveTabInfoAuditAccessProjectionEntry {
    surface: ReleaseProjectionSurface;
    audience: "release_operator" | "audit_operator";
    visibility: "release_summary" | "release_operator_summary" | "audit_only";
    rawDataAllowed: false;
    auditDetailPathsIncluded: boolean;
    allowedFields: readonly string[];
    forbiddenDataClasses: readonly string[];
    activeTabInfoAuditArtifact: {
        id: ReleaseGeneratedAuditArtifact["id"];
        checksum: string;
        packagePath: ReleaseGeneratedAuditArtifact["packagePath"];
    };
    evidenceCountSummary: ReleaseApprovalEvidenceProjection["activeTabInfoEvidenceCompleteness"];
}
export interface ReleaseActiveTabInfoAuditAccessProjectionMatrix {
    schemaVersion: "knowbee.active-tab-info-audit-access-projection.v1";
    method: "browser.active_tab_info";
    entries: readonly ReleaseActiveTabInfoAuditAccessProjectionEntry[];
}
export type ReleaseActiveTabInfoAuditArtifactVerificationReasonCode = "active_tab_info_audit_artifact_checksum_mismatch" | "active_tab_info_audit_artifact_json_invalid" | "active_tab_info_audit_artifact_schema_invalid" | "active_tab_info_audit_artifact_raw_data_allowed" | "active_tab_info_audit_artifact_completeness_invalid" | "active_tab_info_audit_artifact_detail_path_unsafe" | "active_tab_info_audit_artifact_raw_data_detected";
export interface ReleaseActiveTabInfoAuditArtifactVerificationSummary {
    artifactId: ReleaseGeneratedAuditArtifact["id"];
    checksum: string;
    packagePath: ReleaseGeneratedAuditArtifact["packagePath"];
    evidenceCountSummary: ReleaseApprovalEvidenceProjection["activeTabInfoEvidenceCompleteness"];
}
export type ReleaseActiveTabInfoAuditArtifactVerificationResult = {
    status: "verified";
    visibility: "audit_operator_summary";
    summary: ReleaseActiveTabInfoAuditArtifactVerificationSummary;
} | {
    status: "rejected";
    visibility: "audit_operator_summary";
    reasonCode: ReleaseActiveTabInfoAuditArtifactVerificationReasonCode;
};
export type ReleaseActiveTabInfoAuditPackageVerification = ReleaseActiveTabInfoAuditArtifactVerificationResult | {
    status: "pending";
    visibility: "release_operator_summary";
    reasonCode: "active_tab_info_audit_artifact_payload_not_written";
    summary: ReleaseActiveTabInfoAuditArtifactVerificationSummary;
};
export declare function buildReleaseManifest(options?: ReleaseManifestOptions): ReleaseManifest;
export declare function evaluateReleaseReadiness(manifest: ReleaseManifest): ReleaseReadinessDecision;
export declare function buildReleaseReadinessFailureSummary(input: {
    manifest: ReleaseManifest;
    readiness?: ReleaseReadinessDecision;
}): ReleaseReadinessFailureSummary;
export declare function buildReleaseApprovalEvidenceProjection(input: {
    manifest: ReleaseManifest;
    readiness?: ReleaseReadinessDecision;
}): ReleaseApprovalEvidenceProjection;
export declare function validateReleaseApprovalEvidenceProjection(value: unknown): ReleaseApprovalEvidenceValidationResult;
export declare function buildReleaseActiveTabInfoAuditAccessProjectionMatrix(input: {
    manifest: ReleaseManifest;
}): ReleaseActiveTabInfoAuditAccessProjectionMatrix;
export declare function verifyReleaseActiveTabInfoAuditArtifactPayload(input: {
    artifact: ReleaseGeneratedAuditArtifact;
    payloadContent: string;
}): ReleaseActiveTabInfoAuditArtifactVerificationResult;
export declare function buildReleaseArtifactDefinitions(input: {
    rootDir: string;
    targetPlatforms?: ReleaseTargetPlatform[];
    promptSources?: PromptSourceMetadata[];
}): ReleaseArtifactDefinition[];
export declare function buildReleasePipelinePlan(input?: {
    targetPlatforms?: ReleaseTargetPlatform[];
    audience?: "public" | "internal";
}): ReleasePipelinePlan;
export declare function buildReleaseRollbackRunbook(): ReleaseRollbackRunbook;
export declare function buildCleanMachineInstallChecklist(): ReleaseChecklistItem[];
export declare function buildReleaseUpdatePreflightReport(input?: {
    rootDir?: string;
    targetPlatforms?: ReleaseTargetPlatform[];
    promptSourceCount?: number;
}): ReleaseUpdatePreflightReport;
export declare function writeReleasePackage(options: ReleaseManifestOptions & {
    outputDir: string;
    copyPayload?: boolean;
}): ReleasePackageWriteResult;
export declare function writePreparedReleasePackage(options: {
    manifest: ReleaseManifest;
    outputDir: string;
    copyPayload?: boolean;
}): ReleasePackageWriteResult;
export declare function buildReleaseOrchestrationEvidence(input: {
    now: Date;
    featureFlags: ReleaseFeatureFlagState[];
}): ReleaseOrchestrationEvidenceSummary;
//# sourceMappingURL=package.d.ts.map