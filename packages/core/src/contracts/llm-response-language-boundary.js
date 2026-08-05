export const MULTILINGUAL_RESPONSE_EXCEPTION_KINDS = [
    "translation",
    "language_comparison",
    "multilingual_output",
];
const LANGUAGE_TAG = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/u;
function normalizedLanguage(value) {
    return value.trim().toLowerCase();
}
function normalizedUniqueLanguages(values) {
    const normalized = values.map(normalizedLanguage);
    if (normalized.length === 0 || normalized.some((value) => !LANGUAGE_TAG.test(value)))
        return null;
    return [...new Set(normalized)];
}
export function authorizeLlmResponseLanguages(input) {
    const primaryLanguage = normalizedLanguage(input.diagnosis.primaryLanguage);
    const observedLanguages = normalizedUniqueLanguages(input.diagnosis.observedLanguages);
    if (input.diagnosis.diagnosedBy !== "llm" || !LANGUAGE_TAG.test(primaryLanguage)
        || !observedLanguages?.includes(primaryLanguage) || !input.diagnosis.evidenceRef.trim()) {
        return { status: "blocked", reasonCode: "language_diagnosis_invalid" };
    }
    const requestedLanguages = normalizedUniqueLanguages(input.request.requestedLanguages);
    const outputLanguages = normalizedUniqueLanguages(input.output.outputLanguages);
    if (!MULTILINGUAL_RESPONSE_EXCEPTION_KINDS.includes(input.request.mode)
        && input.request.mode !== "single_language") {
        return { status: "blocked", reasonCode: "language_request_invalid" };
    }
    if (!requestedLanguages || !input.request.evidenceRef.trim() || input.output.diagnosedBy !== "llm"
        || !outputLanguages || !input.output.evidenceRef.trim()) {
        return { status: "blocked", reasonCode: "language_request_invalid" };
    }
    if (input.request.mode === "single_language") {
        if (input.request.explicitRequest || requestedLanguages.length !== 1 || requestedLanguages[0] !== primaryLanguage
            || outputLanguages.length !== 1 || outputLanguages[0] !== primaryLanguage) {
            return { status: "blocked", reasonCode: "single_language_mismatch" };
        }
        return { status: "authorized", primaryLanguage, allowedLanguages: [primaryLanguage], mode: "single_language" };
    }
    if (!input.request.explicitRequest)
        return { status: "blocked", reasonCode: "language_exception_not_explicit" };
    if (outputLanguages.some((language) => !requestedLanguages.includes(language))) {
        return { status: "blocked", reasonCode: "unrequested_output_language" };
    }
    return { status: "authorized", primaryLanguage, allowedLanguages: requestedLanguages, mode: input.request.mode };
}
export async function renderAuthorizedResponseLanguages(input) {
    if (input.decision.status !== "authorized")
        return input.decision;
    return { status: "rendered", result: await input.render(input.decision) };
}
//# sourceMappingURL=llm-response-language-boundary.js.map