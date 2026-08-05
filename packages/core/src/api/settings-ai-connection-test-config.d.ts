import type { KnowbeeConfig } from "../config/types.js";
export interface SettingsAiConnectionTestInput {
    readonly providerType?: string;
    readonly authMode?: string;
    readonly endpoint?: string;
    readonly defaultModel?: string;
    readonly credentials?: {
        readonly apiKey?: string;
        readonly username?: string;
        readonly password?: string;
        readonly oauthAuthFilePath?: string;
    };
}
export declare function buildSettingsAiConnectionTestConfig(base: KnowbeeConfig, input: SettingsAiConnectionTestInput): KnowbeeConfig;
//# sourceMappingURL=settings-ai-connection-test-config.d.ts.map