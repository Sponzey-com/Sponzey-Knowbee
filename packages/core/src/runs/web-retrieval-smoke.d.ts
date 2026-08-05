import { type ArtifactStorageContext } from "../artifacts/lifecycle.js";
export declare const WEB_RETRIEVAL_FIXTURE_SCHEMA_VERSION = 2;
export declare const WEB_RETRIEVAL_EVIDENCE_CONTRACT_VERSION = "web-evidence-llm-diagnosis-v2";
export type WebRetrievalSmokeStatus = "passed" | "failed" | "skipped" | "warning";
export type WebRetrievalLiveSmokeMode = "dry-run" | "live-run";
export interface WebRetrievalFixtureTargetInput {
    kind?: string;
    rawQuery?: string | null;
    canonicalName?: string | null;
    symbols?: string[];
    market?: string | null;
    locationName?: string | null;
    locale?: string | null;
}
export interface WebRetrievalFixtureSource {
    id: string;
    method: string;
    status?: "succeeded" | "failed";
    toolName?: string | null;
    sourceKind: string;
    reliability: string;
    sourceUrl?: string | null;
    sourceDomain?: string | null;
    sourceLabel?: string | null;
    sourceTimestamp?: string | null;
    fetchTimestamp?: string | null;
    inputKind: string;
    content?: unknown;
    errorKind?: string | null;
    stopReason?: string | null;
}
export interface WebRetrievalLlmDiagnosisExpectation {
    status: "complete" | "followup" | "ask_user";
    requiredEvidenceSourceIds: string[];
    requiredConditionVerdicts: string[];
    changedStrategyRequired: boolean;
}
export interface WebRetrievalFixtureExpected {
    minimumAttempts: number;
    llmDiagnosisExpectation: WebRetrievalLlmDiagnosisExpectation;
}
export interface WebRetrievalFixture {
    schemaVersion: number;
    id: string;
    title: string;
    freshnessPolicy: string;
    target: WebRetrievalFixtureTargetInput;
    sources: WebRetrievalFixtureSource[];
    expected: WebRetrievalFixtureExpected;
}
export interface WebRetrievalFixtureRegressionResult {
    fixtureId: string;
    title: string;
    status: WebRetrievalSmokeStatus;
    failures: string[];
    attempts: number;
    successfulSourceCount: number;
    evidenceSourceIds: string[];
    llmDiagnosisExpectation: WebRetrievalLlmDiagnosisExpectation;
    sanitizedSummary: string;
}
export interface WebRetrievalFixtureRegressionSummary {
    kind: "web_retrieval.provenance_fixture_regression";
    policyVersion: string;
    startedAt: string;
    finishedAt: string;
    status: WebRetrievalSmokeStatus;
    counts: {
        total: number;
        passed: number;
        failed: number;
        skipped: number;
    };
    results: WebRetrievalFixtureRegressionResult[];
}
export interface WebRetrievalLiveSmokeScenario {
    id: string;
    title: string;
    request: string;
    target: WebRetrievalFixtureTargetInput;
    freshnessPolicy: string;
    minimumMethods: string[];
    completionConditions: string[];
}
export interface WebRetrievalLiveDiagnosisReceipt {
    diagnosedBy: "llm" | "fixture";
    status: "complete" | "followup" | "ask_user";
    contextFingerprint: `sha256:${string}`;
    criterionKeys: readonly string[];
    conditionCount: number;
    evidenceRefs: readonly string[];
}
export interface WebRetrievalLiveSourceEvidenceReceipt {
    evidenceRef: string;
    sourceDomain: string;
    sourceTimestamp: string;
    fetchedAt: string;
}
export interface WebRetrievalLiveTargetBindingReceipt {
    status: "verified" | "unverified";
    requestedTargetFingerprint: `sha256:${string}`;
    evidenceTargetFingerprint: `sha256:${string}`;
}
export interface WebRetrievalLiveAcceptanceReceipt {
    auditEventId: string;
    redactionStatus: "verified" | "unverified";
    targetBinding: WebRetrievalLiveTargetBindingReceipt;
    sourceEvidence: readonly WebRetrievalLiveSourceEvidenceReceipt[];
}
export interface WebRetrievalLiveSmokeTrace {
    attemptedMethods: readonly string[];
    sourceDomains?: readonly string[];
    answerProduced: boolean;
    resultDiagnosis?: WebRetrievalLiveDiagnosisReceipt | null;
    liveAcceptance?: WebRetrievalLiveAcceptanceReceipt | null;
    finalText?: string | null;
    artifactPath?: string | null;
    rawError?: string | null;
    skipped?: boolean;
    skipReason?: string;
}
export interface WebRetrievalLiveSmokeResult {
    scenario: WebRetrievalLiveSmokeScenario;
    status: WebRetrievalSmokeStatus;
    failures: string[];
    reason?: string;
    trace?: WebRetrievalLiveSmokeTrace;
    startedAt: string;
    finishedAt: string;
}
export interface WebRetrievalLiveSmokeSummary {
    kind: "web_retrieval.live_smoke";
    mode: WebRetrievalLiveSmokeMode;
    smokeId: string;
    policyVersion: string;
    startedAt: string;
    finishedAt: string;
    status: WebRetrievalSmokeStatus;
    artifactPath?: string | null;
    diagnosticEventId?: string | null;
    counts: {
        total: number;
        passed: number;
        failed: number;
        skipped: number;
    };
    results: WebRetrievalLiveSmokeResult[];
}
export interface WebRetrievalReleaseGateSummary {
    kind: "web_retrieval.release_gate";
    policyVersion: string;
    fixtureRegression: Pick<WebRetrievalFixtureRegressionSummary, "status" | "counts" | "results"> | null;
    liveSmoke: Pick<WebRetrievalLiveSmokeSummary, "mode" | "smokeId" | "status" | "counts" | "artifactPath"> | null;
    gateStatus: "passed" | "failed" | "warning";
    blockingFailures: string[];
    warnings: string[];
}
export declare function loadWebRetrievalFixturesFromDir(dir: string): WebRetrievalFixture[];
export declare function runWebRetrievalFixtureRegression(fixtures: WebRetrievalFixture[], input?: {
    startedAt?: Date;
    finishedAt?: Date;
}): WebRetrievalFixtureRegressionSummary;
export declare function getDefaultWebRetrievalLiveSmokeScenarios(): WebRetrievalLiveSmokeScenario[];
export declare function isLiveWebSmokeEnabled(env?: Record<string, string | undefined>): boolean;
export declare function createDryRunWebRetrievalLiveSmokeExecutor(input?: {
    traceOverrides?: Record<string, Partial<WebRetrievalLiveSmokeTrace>>;
}): (scenario: WebRetrievalLiveSmokeScenario) => Promise<WebRetrievalLiveSmokeTrace>;
export declare function validateWebRetrievalLiveSmokeTrace(scenario: WebRetrievalLiveSmokeScenario, trace: WebRetrievalLiveSmokeTrace): string[];
export declare function runWebRetrievalLiveSmokeScenarios(input?: {
    artifactStorage?: ArtifactStorageContext;
    mode?: WebRetrievalLiveSmokeMode;
    scenarios?: WebRetrievalLiveSmokeScenario[];
    executeScenario?: (scenario: WebRetrievalLiveSmokeScenario) => Promise<WebRetrievalLiveSmokeTrace>;
    env?: NodeJS.ProcessEnv;
    liveEnabled?: boolean;
    writeArtifact?: boolean;
    now?: Date;
    clock?: () => Date;
}): Promise<WebRetrievalLiveSmokeSummary>;
export declare function writeWebRetrievalSmokeArtifact(summary: WebRetrievalLiveSmokeSummary, artifactStorage: ArtifactStorageContext): WebRetrievalLiveSmokeSummary;
export declare function buildWebRetrievalReleaseGateSummary(input?: {
    fixtureRegression?: WebRetrievalFixtureRegressionSummary | null;
    liveSmoke?: WebRetrievalLiveSmokeSummary | null;
}): WebRetrievalReleaseGateSummary;
export declare function buildFixtureRegressionFromWorkspace(rootDir: string): WebRetrievalFixtureRegressionSummary | null;
export declare function fixtureFileNameForId(id: string): string;
//# sourceMappingURL=web-retrieval-smoke.d.ts.map