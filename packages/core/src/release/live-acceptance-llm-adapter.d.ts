import type { AIProvider, ChatParams } from "../ai/types.js";
import type { LoadedPromptSource } from "../memory/knowbee-md.js";
import type { ExtensionLiveSmokeDiagnosisPort } from "../runs/extension-live-smoke-runner.js";
import type { WebRetrievalLiveDiagnosisPort, WebRetrievalLivePlanPort, WebRetrievalLiveRediagnosisPort } from "../runs/web-retrieval-live-runner.js";
import type { YeonjangLiveSmokeDiagnosisPort } from "../runs/yeonjang-live-smoke-runner.js";
export type LiveAcceptanceLlmAdapterErrorCode = "live_acceptance_prompt_missing" | "live_acceptance_prompt_ambiguous" | "live_acceptance_llm_config_invalid" | "live_acceptance_llm_cancelled" | "live_acceptance_llm_provider_failed";
export declare class LiveAcceptanceLlmAdapterError extends Error {
    readonly code: LiveAcceptanceLlmAdapterErrorCode;
    constructor(code: LiveAcceptanceLlmAdapterErrorCode);
}
export interface LiveAcceptanceLlmPorts {
    readonly webPlan: WebRetrievalLivePlanPort;
    readonly webDiagnosis: WebRetrievalLiveDiagnosisPort;
    readonly webRediagnosis?: WebRetrievalLiveRediagnosisPort;
    readonly extensionDiagnosis: ExtensionLiveSmokeDiagnosisPort;
    readonly yeonjangDiagnosis: YeonjangLiveSmokeDiagnosisPort;
}
export interface FileBackedLiveAcceptanceLlmPortsInput {
    readonly provider: AIProvider;
    readonly model: string;
    readonly workDir: string;
    readonly maxTokens?: number;
    readonly observabilityContext?: Pick<NonNullable<ChatParams["observability"]>, "runId" | "requestGroupId" | "sessionId">;
}
export declare function selectLiveAcceptancePromptSource(sources: readonly LoadedPromptSource[]): LoadedPromptSource;
export declare function createFileBackedLiveAcceptanceLlmPorts(input: FileBackedLiveAcceptanceLlmPortsInput): LiveAcceptanceLlmPorts;
//# sourceMappingURL=live-acceptance-llm-adapter.d.ts.map