import type { KnowbeeConfig } from "../config/types.js";
import { type PromptTemplateVariables } from "../memory/knowbee-md.js";
export { DEFAULT_MAIN_AGENT_NAME_EN, DEFAULT_MAIN_AGENT_NAME_KO, KNOWBEE_PRODUCT_NAME, KNOWBEE_PRODUCT_NAME_KO, } from "../contracts/product-identity.js";
export declare function resolvePromptLocale(language: string | undefined): "ko" | "en";
export declare function resolvePromptLocaleForRequest(language: string | undefined, userMessage: string | undefined): "ko" | "en";
export declare function defaultMainAgentNameForLanguage(language: string | undefined): string;
export declare function resolveMainAgentSelfName(config: KnowbeeConfig, languageOverride?: string): string;
export declare function buildMainAgentPromptVariables(config: KnowbeeConfig, languageOverride?: string): PromptTemplateVariables;
export declare function buildMainAgentIdentityPromptContext(config: KnowbeeConfig, languageOverride: string | undefined, workDir: string): string;
//# sourceMappingURL=main-agent-identity.d.ts.map