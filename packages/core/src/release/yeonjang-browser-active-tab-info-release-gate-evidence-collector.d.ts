import type { YeonjangBrowserActiveTabInfoReleaseGateId, YeonjangBrowserActiveTabInfoReleaseGateSummary, YeonjangBrowserActiveTabInfoReleaseGateSummaryInput } from "./yeonjang-browser-active-tab-info-release-gate-summary.js";
export type YeonjangBrowserActiveTabInfoReleaseGateTestStatus = "passed" | "failed" | "missing" | "stale";
export type YeonjangBrowserActiveTabInfoReleaseGateTestEvidenceSourceKind = "vitest" | "junit" | "ci_summary" | "manual_fixture";
export interface YeonjangBrowserActiveTabInfoReleaseGateEvidenceRequirement {
    gateId: YeonjangBrowserActiveTabInfoReleaseGateId;
    modulePath: string;
    testPath: string;
}
export interface YeonjangBrowserActiveTabInfoReleaseGateModuleEvidence {
    gateId: YeonjangBrowserActiveTabInfoReleaseGateId;
    present: boolean;
}
export interface YeonjangBrowserActiveTabInfoReleaseGateTestEvidence {
    testPath: string;
    status: YeonjangBrowserActiveTabInfoReleaseGateTestStatus;
}
export interface YeonjangBrowserActiveTabInfoReleaseGateRawTestStatusEvidence {
    testPath: string;
    status: Exclude<YeonjangBrowserActiveTabInfoReleaseGateTestStatus, "stale">;
    executedAt: number;
    sourceKind: YeonjangBrowserActiveTabInfoReleaseGateTestEvidenceSourceKind;
    rawReportVisibility: "audit_only" | "public" | "unknown";
}
export interface YeonjangBrowserActiveTabInfoReleaseGateNormalizedTestStatusEvidence {
    testEvidence: YeonjangBrowserActiveTabInfoReleaseGateTestEvidence[];
    staleTestPaths: string[];
    missingTestStatusPaths: string[];
    rejectedRawReportVisibilityPaths: string[];
}
export interface YeonjangBrowserActiveTabInfoReleaseGateTestRunnerSummaryRecord {
    testPath: string;
    outcome: "passed" | "failed" | "skipped";
    finishedAt: number;
    sourceKind: YeonjangBrowserActiveTabInfoReleaseGateTestEvidenceSourceKind;
    rawReportVisibility: "audit_only" | "public" | "unknown";
}
export interface YeonjangBrowserActiveTabInfoReleaseGateAdaptedTestRunnerEvidence {
    evidence: YeonjangBrowserActiveTabInfoReleaseGateRawTestStatusEvidence[];
    rejectedUnknownTestPaths: string[];
    rejectedSkippedTestPaths: string[];
}
export interface YeonjangBrowserActiveTabInfoReleaseGateEvidenceCollection {
    summaryInput: YeonjangBrowserActiveTabInfoReleaseGateSummaryInput;
    missingModuleGateIds: YeonjangBrowserActiveTabInfoReleaseGateId[];
    failingTestPaths: string[];
    releaseGateSummary: YeonjangBrowserActiveTabInfoReleaseGateSummary;
}
export interface YeonjangBrowserActiveTabInfoReleaseGateRepositoryEvidencePort {
    existsFile(relativePath: string): boolean;
    getTestStatus?(testPath: string): YeonjangBrowserActiveTabInfoReleaseGateTestStatus | undefined;
}
export interface YeonjangBrowserActiveTabInfoReleaseGateRepositoryEvidenceCollection extends YeonjangBrowserActiveTabInfoReleaseGateEvidenceCollection {
    missingSourcePaths: string[];
    missingTestPaths: string[];
}
export declare const ACTIVE_TAB_INFO_RELEASE_GATE_EVIDENCE_REQUIREMENTS: YeonjangBrowserActiveTabInfoReleaseGateEvidenceRequirement[];
export declare function collectYeonjangBrowserActiveTabInfoReleaseGateEvidence(input: {
    moduleEvidence: readonly YeonjangBrowserActiveTabInfoReleaseGateModuleEvidence[];
    testEvidence: readonly YeonjangBrowserActiveTabInfoReleaseGateTestEvidence[];
    publicRawLeakDetected: boolean;
    reviewBypassDetected: boolean;
    unsafeEvidenceRefDetected: boolean;
    liveIntegrationState: {
        rustLiveHandlerEnabled: boolean;
        skillMappingEnabled: boolean;
        productionBindingEnabled: boolean;
        defaultLiveSmokeEnabled: boolean;
    };
}): YeonjangBrowserActiveTabInfoReleaseGateEvidenceCollection;
export declare function collectYeonjangBrowserActiveTabInfoReleaseGateEvidenceFromRepository(input: {
    evidencePort: YeonjangBrowserActiveTabInfoReleaseGateRepositoryEvidencePort;
    publicRawLeakDetected: boolean;
    reviewBypassDetected: boolean;
    unsafeEvidenceRefDetected: boolean;
    liveIntegrationState: {
        rustLiveHandlerEnabled: boolean;
        skillMappingEnabled: boolean;
        productionBindingEnabled: boolean;
        defaultLiveSmokeEnabled: boolean;
    };
}): YeonjangBrowserActiveTabInfoReleaseGateRepositoryEvidenceCollection;
export declare function normalizeYeonjangBrowserActiveTabInfoReleaseGateTestStatusEvidence(input: {
    evidence: readonly YeonjangBrowserActiveTabInfoReleaseGateRawTestStatusEvidence[];
    now: number;
    maxAgeMs: number;
}): YeonjangBrowserActiveTabInfoReleaseGateNormalizedTestStatusEvidence;
export declare function adaptYeonjangBrowserActiveTabInfoReleaseGateTestRunnerSummary(input: {
    records: readonly YeonjangBrowserActiveTabInfoReleaseGateTestRunnerSummaryRecord[];
}): YeonjangBrowserActiveTabInfoReleaseGateAdaptedTestRunnerEvidence;
//# sourceMappingURL=yeonjang-browser-active-tab-info-release-gate-evidence-collector.d.ts.map