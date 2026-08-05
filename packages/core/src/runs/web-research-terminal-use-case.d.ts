import { type WebResearchFingerprintPort, type WebResearchMethodProvider, type WebResearchMethodAdmission } from "../contracts/web-research-method.js";
export declare function executeWebResearchTerminalProposal(input: Readonly<{
    runId: string;
    evidenceRefs: readonly string[];
    attemptedStrategyFingerprints: readonly `sha256:${string}`[];
    completionAllowed: boolean;
    blockedAllowed: boolean;
    provider: WebResearchMethodProvider;
    createFingerprint: WebResearchFingerprintPort;
}>): Promise<WebResearchMethodAdmission | Readonly<{
    ok: false;
    reasonCode: "web_research_terminal_context_invalid" | "web_research_context_invalid" | "web_research_provider_failed" | "web_research_provider_output_invalid";
}>>;
//# sourceMappingURL=web-research-terminal-use-case.d.ts.map