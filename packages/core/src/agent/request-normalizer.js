import { detectPrimaryMessageLanguage } from "../channels/language.js";
function normalizeWhitespace(text) {
    return text.trim().replace(/\s+/gu, " ");
}
function detectSourceLanguage(text) {
    return detectPrimaryMessageLanguage(text);
}
// Preserve the latest user message for intake without language-bound semantic rewriting.
export function normalizeRequestForIntake(message) {
    const originalMessage = normalizeWhitespace(message);
    const sourceLanguage = detectSourceLanguage(originalMessage);
    return {
        sourceLanguage,
        originalMessage,
        normalizedEnglish: originalMessage,
    };
}
//# sourceMappingURL=request-normalizer.js.map