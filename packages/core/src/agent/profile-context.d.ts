import type { KnowbeeConfig } from "../config/types.js";
import { type AgentConfig, type TeamConfig } from "../contracts/sub-agent-orchestration.js";
export declare function resolveUserProfileName(profile: KnowbeeConfig["profile"]): string;
export declare function buildUserProfilePromptContext(profile: KnowbeeConfig["profile"]): string;
export declare function buildAgentProfilePromptContext(input: {
    agent: AgentConfig;
    teams?: TeamConfig[];
}): string;
//# sourceMappingURL=profile-context.d.ts.map