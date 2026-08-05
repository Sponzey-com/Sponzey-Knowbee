import type { KnowbeeConfig } from "../config/types.js";
import type { AgentIdentityCommandRepository } from "./agent-identity-command.js";
export declare function createSqliteAgentIdentityCommandRepository(input: {
    config: KnowbeeConfig;
    now?: () => number;
    createId?: () => string;
}): AgentIdentityCommandRepository;
//# sourceMappingURL=agent-identity-command-repository.d.ts.map