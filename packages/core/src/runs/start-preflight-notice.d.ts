import type { StartPreflightFailure } from "./preflight.js";
export interface StartPreflightFailureNotice {
    kind: "start_preflight_failure";
    code: StartPreflightFailure["code"];
    summary: string;
    deliveryMode: "diagnostic";
    textSource: "start_preflight_failure_notice";
    renderingRequired: "llm_final_response";
    finalAnswer: false;
    assistantIdentityClaim: false;
}
export declare function buildStartPreflightFailureNotice(failure: StartPreflightFailure): StartPreflightFailureNotice;
//# sourceMappingURL=start-preflight-notice.d.ts.map