import type { SourceFreshnessPolicy } from "./web-retrieval.js";
import type { WebResearchLinkCandidate } from "./web-research-link-candidate.js";
interface InitialWebResearchExecutionScope {
    readonly runId: string;
    readonly ownerAgentId: string;
    readonly receiptId: string;
    readonly selectedCapabilityId: string;
    readonly toolNames: readonly string[];
}
export type InitialWebResearchAction = Readonly<{
    kind: "execute_search";
    query: string;
    freshnessPolicy: SourceFreshnessPolicy;
}> | Readonly<{
    kind: "execute_fetch";
    sourceUrl: string;
    freshnessPolicy: SourceFreshnessPolicy;
    candidateOrigin: "user_url" | "search_result" | "fetched_document_link";
    candidateId?: string;
    parentEvidenceRef?: string;
    discoveryFingerprint?: `sha256:${string}`;
}>;
export interface InitialWebResearchMethodReceipt {
    readonly schemaVersion: 1;
    readonly diagnosedBy: "llm_tool_call";
    readonly receiptId: `receipt:web-method:${string}`;
    readonly runId: string;
    readonly capabilityReceiptId: string;
    readonly proposalFingerprint: `sha256:${string}`;
}
export type InitialWebResearchMethodAdmission = Readonly<{
    ok: true;
    action: InitialWebResearchAction;
    receipt: InitialWebResearchMethodReceipt;
}> | Readonly<{
    ok: false;
    reasonCode: "web_initial_method_scope_mismatch" | "web_initial_method_proposal_invalid" | "web_initial_method_fetch_candidate_missing" | "web_initial_method_fetch_candidate_invalid";
}>;
export declare function readUserWebUrlCandidates(userRequest: string): readonly string[];
export declare function admitInitialWebResearchMethod(input: Readonly<{
    runId: string;
    ownerAgentId: string;
    scope: InitialWebResearchExecutionScope;
    userRequest: string;
    observedFetchCandidates?: readonly WebResearchLinkCandidate[];
    observedSearchResults?: readonly Readonly<{
        sourceUrl: string;
        evidenceRef: string;
    }>[];
    toolName: string;
    params: Readonly<Record<string, unknown>>;
}>): InitialWebResearchMethodAdmission;
export {};
//# sourceMappingURL=web-initial-method-admission.d.ts.map