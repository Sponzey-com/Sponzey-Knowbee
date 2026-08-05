import { type WebResearchFingerprintPort, type WebResearchMethodAdmission, type WebResearchMethodProvider, type WebResearchSnapshot } from "../contracts/web-research-method.js";
export type WebResearchMethodUseCaseResult = WebResearchMethodAdmission | Readonly<{
    ok: false;
    reasonCode: "web_research_context_invalid" | "web_research_provider_failed" | "web_research_provider_output_invalid";
}>;
export declare function executeWebResearchMethodProposal(input: {
    runId: string;
    receiptId: string;
    snapshot: WebResearchSnapshot;
    provider: WebResearchMethodProvider;
    createFingerprint: WebResearchFingerprintPort;
}): Promise<WebResearchMethodUseCaseResult>;
//# sourceMappingURL=web-research-method-use-case.d.ts.map