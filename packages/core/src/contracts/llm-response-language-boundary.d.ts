export declare const MULTILINGUAL_RESPONSE_EXCEPTION_KINDS: readonly ["translation", "language_comparison", "multilingual_output"];
export type MultilingualResponseExceptionKind = typeof MULTILINGUAL_RESPONSE_EXCEPTION_KINDS[number];
export interface LlmPrimaryLanguageReceipt {
    diagnosedBy: "llm";
    primaryLanguage: string;
    observedLanguages: readonly string[];
    evidenceRef: string;
}
export interface ResponseLanguageRequestReceipt {
    mode: "single_language" | MultilingualResponseExceptionKind;
    explicitRequest: boolean;
    requestedLanguages: readonly string[];
    evidenceRef: string;
}
export interface LlmOutputLanguageReceipt {
    diagnosedBy: "llm";
    outputLanguages: readonly string[];
    evidenceRef: string;
}
export type ResponseLanguageBoundaryDecision = {
    status: "authorized";
    primaryLanguage: string;
    allowedLanguages: string[];
    mode: ResponseLanguageRequestReceipt["mode"];
} | {
    status: "blocked";
    reasonCode: "language_diagnosis_invalid" | "language_request_invalid" | "language_exception_not_explicit" | "single_language_mismatch" | "unrequested_output_language";
};
export declare function authorizeLlmResponseLanguages(input: {
    diagnosis: LlmPrimaryLanguageReceipt;
    request: ResponseLanguageRequestReceipt;
    output: LlmOutputLanguageReceipt;
}): ResponseLanguageBoundaryDecision;
export declare function renderAuthorizedResponseLanguages<T>(input: {
    decision: ResponseLanguageBoundaryDecision;
    render: (authorization: Extract<ResponseLanguageBoundaryDecision, {
        status: "authorized";
    }>) => Promise<T>;
}): Promise<{
    status: "rendered";
    result: T;
} | Extract<ResponseLanguageBoundaryDecision, {
    status: "blocked";
}>>;
//# sourceMappingURL=llm-response-language-boundary.d.ts.map