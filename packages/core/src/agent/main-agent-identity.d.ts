import type { KnowbeeConfig } from "../config/types.js";
import type { PromptTemplateVariables } from "../memory/knowbee-md.js";
export declare const KNOWBEE_PRODUCT_NAME = "Sponzey Knowbee";
export declare const KNOWBEE_PRODUCT_NAME_KO = "\uC2A4\uD3F0\uC9C0 \uB178\uBE44";
export declare const DEFAULT_MAIN_AGENT_NAME_EN = "Knowbee";
export declare const DEFAULT_MAIN_AGENT_NAME_KO = "\uB178\uBE44";
export declare function resolvePromptLocale(language: string | undefined): "ko" | "en";
export declare function resolvePromptLocaleForRequest(language: string | undefined, userMessage: string | undefined): "ko" | "en";
export declare function defaultMainAgentNameForLanguage(language: string | undefined): string;
export declare function resolveMainAgentSelfName(config: KnowbeeConfig, languageOverride?: string): string;
export declare function answerMainAgentSelfNameQuestion(config: KnowbeeConfig, userMessage: string): string | null;
export declare function buildMainAgentPromptVariables(config: KnowbeeConfig, languageOverride?: string): PromptTemplateVariables;
export declare function buildMainAgentIdentityPromptContext(config: KnowbeeConfig, languageOverride?: string): string;
//# sourceMappingURL=main-agent-identity.d.ts.map