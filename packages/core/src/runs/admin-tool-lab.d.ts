import type { ControlTimeline } from "../control-plane/timeline.js";
import type { DbMessageLedgerEvent } from "../db/index.js";
import type { SourceFreshnessPolicy, SourceKind, SourceReliability, WebRetrievalMethod } from "./web-retrieval-policy.js";
import { type WebRetrievalFixtureRegressionSummary } from "./web-retrieval-smoke.js";
export type AdminToolCallStatus = "started" | "succeeded" | "failed" | "skipped" | "unknown";
export type AdminToolApprovalState = "not_required" | "requested" | "approved" | "denied";
export interface AdminToolCallView {
    id: string;
    toolName: string;
    status: AdminToolCallStatus;
    approvalState: AdminToolApprovalState;
    runId: string | null;
    requestGroupId: string | null;
    sessionKey: string | null;
    startedAt: number | null;
    finishedAt: number | null;
    durationMs: number | null;
    signalCount: number;
    eventCount: number;
    paramsRedacted: unknown;
    outputRedacted: unknown;
    redactionApplied: boolean;
    resultSummary: string | null;
    lifecycle: Array<{
        at: number;
        source: "ledger" | "control";
        eventKind: string;
        status: string;
        summary: string;
    }>;
}
export interface AdminToolCallsInspector {
    summary: {
        total: number;
        failed: number;
        waitingApproval: number;
        redacted: number;
    };
    calls: AdminToolCallView[];
}
export interface AdminWebRetrievalAttemptView {
    id: string;
    toolName: string;
    status: AdminToolCallStatus;
    method: WebRetrievalMethod | string;
    sourceKind: SourceKind | "unknown";
    reliability: SourceReliability;
    freshnessPolicy: SourceFreshnessPolicy;
    sourceUrl: string | null;
    sourceDomain: string | null;
    fetchTimestamp: string | null;
    sourceTimestamp: string | null;
    durationMs: number | null;
    signalCount: number;
}
export interface AdminWebRetrievalDiagnosisView {
    status: "complete" | "followup" | "ask_user" | null;
    contextFingerprint: string | null;
    criterionKeys: string[];
    conditionCount: number | null;
    evidenceRefs: string[];
    receiptPresent: boolean;
}
export interface AdminWebRetrievalSessionView {
    id: string;
    requestGroupId: string | null;
    runId: string | null;
    sessionKey: string | null;
    queryVariants: string[];
    fetchAttempts: AdminWebRetrievalAttemptView[];
    resultDiagnosis: AdminWebRetrievalDiagnosisView;
    degradedState: {
        degraded: boolean;
        reasons: string[];
    };
    policySeparation: {
        evidence: "provenance_only";
        completion: "llm_result_diagnosis";
        semanticComparisonAllowed: false;
    };
}
export interface AdminWebRetrievalLab {
    summary: {
        sessions: number;
        attempts: number;
        degraded: number;
        diagnosed: number;
    };
    sessions: AdminWebRetrievalSessionView[];
}
export interface AdminToolRetrievalLab {
    toolCalls: AdminToolCallsInspector;
    webRetrieval: AdminWebRetrievalLab;
}
export interface AdminFixtureReplayResultView {
    fixtureId: string;
    title: string;
    status: string;
    attempts: number;
    successfulSourceCount: number;
    evidenceSourceIds: string[];
    llmDiagnosisExpectation: {
        status: "complete" | "followup" | "ask_user";
        requiredEvidenceSourceIds: string[];
        requiredConditionVerdicts: string[];
        changedStrategyRequired: boolean;
    };
    failures: string[];
}
export interface AdminFixtureReplayResponse {
    ok: true;
    generatedAt: number;
    networkUsed: false;
    semanticComparisonAllowed: false;
    verificationMode: "llm_result_diagnosis_contract";
    fixtureCount: number;
    summary: Pick<WebRetrievalFixtureRegressionSummary, "kind" | "policyVersion" | "status" | "counts">;
    results: AdminFixtureReplayResultView[];
}
interface LabInput {
    timeline: ControlTimeline;
    ledgerEvents: DbMessageLedgerEvent[];
    query?: string;
    limit?: number;
}
export declare function buildAdminToolCallsInspector(input: Pick<LabInput, "timeline" | "ledgerEvents" | "limit">): AdminToolCallsInspector;
export declare function buildAdminWebRetrievalLab(input: Pick<LabInput, "timeline" | "ledgerEvents" | "query" | "limit">): AdminWebRetrievalLab;
export declare function buildAdminToolRetrievalLab(input: LabInput): AdminToolRetrievalLab;
export declare function runAdminWebRetrievalFixtureReplay(input?: {
    fixtureIds?: string[];
    fixtureDir?: string;
    now?: Date;
}): AdminFixtureReplayResponse;
export {};
//# sourceMappingURL=admin-tool-lab.d.ts.map