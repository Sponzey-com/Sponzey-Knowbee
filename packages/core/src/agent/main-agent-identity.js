export const KNOWBEE_PRODUCT_NAME = "Sponzey Knowbee";
export const KNOWBEE_PRODUCT_NAME_KO = "스폰지 노비";
export const DEFAULT_MAIN_AGENT_NAME_EN = "Knowbee";
export const DEFAULT_MAIN_AGENT_NAME_KO = "노비";
function normalize(value) {
    return value?.trim() ?? "";
}
function normalizeAlias(value) {
    return value.trim().normalize("NFKC").toLowerCase();
}
function isDefaultMainAgentAlias(value) {
    const normalized = normalizeAlias(value);
    return normalized === DEFAULT_MAIN_AGENT_NAME_EN.toLowerCase()
        || normalized === DEFAULT_MAIN_AGENT_NAME_KO;
}
function isUserProfileNameAlias(config, value) {
    const normalized = normalizeAlias(value);
    if (!normalized)
        return false;
    const profileAliases = [config.profile.displayName, config.profile.profileName]
        .map((alias) => normalize(alias))
        .filter((alias) => alias.length > 0)
        .map((alias) => normalizeAlias(alias));
    return profileAliases.includes(normalized);
}
function resolveConfiguredMainAgentSelfName(config) {
    const configured = normalize(config.orchestration.knowbee?.nickname)
        || normalize(config.orchestration.knowbee?.displayName);
    return configured && !isDefaultMainAgentAlias(configured) && !isUserProfileNameAlias(config, configured) ? configured : "";
}
export function resolvePromptLocale(language) {
    return normalize(language).toLowerCase().startsWith("ko") ? "ko" : "en";
}
export function resolvePromptLocaleForRequest(language, userMessage) {
    const message = normalize(userMessage);
    if (/[가-힣]/u.test(message))
        return "ko";
    return resolvePromptLocale(language);
}
export function defaultMainAgentNameForLanguage(language) {
    return resolvePromptLocale(language) === "ko" ? DEFAULT_MAIN_AGENT_NAME_KO : DEFAULT_MAIN_AGENT_NAME_EN;
}
export function resolveMainAgentSelfName(config, languageOverride) {
    return resolveConfiguredMainAgentSelfName(config)
        || defaultMainAgentNameForLanguage(languageOverride ?? config.profile.language);
}
export function answerMainAgentSelfNameQuestion(config, userMessage) {
    if (!isMainAgentSelfNameQuestion(userMessage))
        return null;
    const locale = resolvePromptLocaleForRequest(config.profile.language, userMessage);
    const mainAgentName = resolveMainAgentSelfName(config, locale);
    return locale === "ko"
        ? `제 이름은 ${mainAgentName}입니다.`
        : `My name is ${mainAgentName}.`;
}
function isMainAgentSelfNameQuestion(userMessage) {
    const text = normalize(userMessage).replace(/\s+/g, " ");
    if (!text)
        return false;
    const lower = text.toLowerCase();
    if (/\b(my name|user name|profile name)\b/.test(lower))
        return false;
    if (/(내|제|사용자)\s*이름/u.test(text))
        return false;
    return /(너|니|네|당신|에이전트|어시스턴트|assistant|agent).{0,16}(이름|누구|정체)/iu.test(text)
        || /(이름|누구|정체).{0,16}(너|니|네|당신|에이전트|어시스턴트|assistant|agent)/iu.test(text)
        || /\bwhat(?:'s| is) your name\b/i.test(text)
        || /\bwho are you\b/i.test(text);
}
export function buildMainAgentPromptVariables(config, languageOverride) {
    const mainAgentName = resolveMainAgentSelfName(config, languageOverride);
    return {
        mainAgentName,
        productName: KNOWBEE_PRODUCT_NAME,
        productNameKo: KNOWBEE_PRODUCT_NAME_KO,
        profileLanguage: normalize(config.profile.language),
    };
}
export function buildMainAgentIdentityPromptContext(config, languageOverride) {
    const mainAgentName = resolveMainAgentSelfName(config, languageOverride);
    return [
        "[Trusted Main Agent Identity]",
        `- Current main-agent self name: ${mainAgentName}`,
        `- Product name: ${KNOWBEE_PRODUCT_NAME} / ${KNOWBEE_PRODUCT_NAME_KO}`,
        `- If the user asks your name, answer with \"${mainAgentName}\" as your own name.`,
        `- "Knowbee" and "노비" are localized default aliases. Use the current main-agent self name above, not a different alias.`,
        "- User profile name/display name identifies the user, not this assistant.",
    ].join("\n");
}
//# sourceMappingURL=main-agent-identity.js.map