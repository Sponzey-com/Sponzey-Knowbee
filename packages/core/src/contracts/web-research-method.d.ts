export type WebResearchFingerprint = `sha256:${string}`;
export type WebResearchFingerprintPort = (namespace: string, value: unknown) => WebResearchFingerprint;
export type WebResearchMethodCandidate = Readonly<{
    candidateId: string;
    kind: "search";
    query: string;
    strategyFingerprint: WebResearchFingerprint;
}> | Readonly<{
    candidateId: string;
    kind: "fetch";
    sourceUrl: string;
    evidenceRef: string;
    strategyFingerprint: WebResearchFingerprint;
    discovery?: WebResearchFetchCandidateDiscovery;
}>;
export interface WebResearchFetchCandidateDiscovery {
    readonly origin: "fetched_document_link";
    readonly parentEvidenceRef: string;
    readonly parentProvenanceRef: string;
    readonly documentFinalUrl: string;
    readonly observationOrdinal: number;
    readonly discoveryFingerprint: WebResearchFingerprint;
}
export interface WebResearchTerminalAdmission {
    readonly completionAllowed: boolean;
    readonly blockedAllowed: boolean;
    readonly remainingChangedCandidateIds: readonly string[];
}
export interface WebResearchSnapshot {
    readonly schemaVersion: 1;
    readonly runId: string;
    readonly snapshotId: string;
    readonly snapshotFingerprint: WebResearchFingerprint;
    readonly candidates: readonly WebResearchMethodCandidate[];
    readonly evidenceRefs: readonly string[];
    readonly attemptedStrategyFingerprints: readonly WebResearchFingerprint[];
    readonly terminalAdmission: WebResearchTerminalAdmission;
}
export type WebResearchNextAction = Readonly<{
    kind: "execute_search";
    candidateId: string;
    query: string;
    strategyFingerprint: WebResearchFingerprint;
}> | Readonly<{
    kind: "execute_fetch";
    candidateId: string;
    sourceUrl: string;
    evidenceRef: string;
    strategyFingerprint: WebResearchFingerprint;
}> | Readonly<{
    kind: "propose_complete";
    evidenceRefs: readonly string[];
}> | Readonly<{
    kind: "propose_blocked";
    evidenceRefs: readonly string[];
    reasonCode: string;
}>;
export interface WebResearchMethodReceipt {
    readonly schemaVersion: 1;
    readonly receiptId: string;
    readonly diagnosedBy: "llm";
    readonly runId: string;
    readonly snapshotId: string;
    readonly snapshotFingerprint: WebResearchFingerprint;
    readonly proposalFingerprint: WebResearchFingerprint;
}
export interface WebResearchMethodProviderInput {
    readonly runId: string;
    readonly snapshot: WebResearchSnapshot;
}
export interface WebResearchMethodProvider {
    proposeNextAction(input: WebResearchMethodProviderInput): unknown | Promise<unknown>;
}
export type WebResearchMethodAdmissionReason = "web_research_snapshot_invalid" | "web_research_proposal_invalid" | "web_research_receipt_invalid" | "web_research_receipt_run_mismatch" | "web_research_receipt_snapshot_mismatch" | "web_research_receipt_proposal_mismatch" | "web_research_candidate_missing" | "web_research_candidate_mismatch" | "web_research_strategy_unchanged" | "web_research_evidence_not_admitted" | "web_research_completion_not_admitted" | "web_research_blocked_not_admitted" | "web_research_changed_candidate_remaining";
export type WebResearchMethodAdmission = Readonly<{
    ok: true;
    action: WebResearchNextAction;
    receiptId: string;
}> | Readonly<{
    ok: false;
    reasonCode: WebResearchMethodAdmissionReason;
}>;
export declare function createWebResearchSnapshot(input: {
    runId: string;
    snapshotId: string;
    candidates: readonly WebResearchMethodCandidate[];
    evidenceRefs: readonly string[];
    attemptedStrategyFingerprints: readonly WebResearchFingerprint[];
    terminalAdmission: WebResearchTerminalAdmission;
}, createFingerprint: WebResearchFingerprintPort): WebResearchSnapshot;
export declare function createWebResearchMethodReceipt(input: {
    receiptId: string;
    runId: string;
    snapshot: WebResearchSnapshot;
    proposal: unknown;
}, createFingerprint: WebResearchFingerprintPort): WebResearchMethodReceipt;
export declare function admitWebResearchNextAction(input: {
    runId: string;
    snapshot: WebResearchSnapshot;
    proposal: unknown;
    receipt: unknown;
}, createFingerprint: WebResearchFingerprintPort): WebResearchMethodAdmission;
//# sourceMappingURL=web-research-method.d.ts.map