import { normalizeAgentNameSnapshot } from "../contracts/sub-agent-orchestration.js";
export function canonicalizeLegacyAgentIdentity(input) {
    const { agentName: rawAgentName, displayName: rawDisplayName, nickname: rawNickname, normalizedNickname: _normalizedNickname, ...canonical } = input;
    const selected = [rawAgentName, rawDisplayName, rawNickname]
        .find((value) => typeof value === "string" && value.trim().length > 0);
    const agentName = normalizeAgentNameSnapshot(selected ?? "");
    return {
        ...canonical,
        ...(agentName ? { agentName } : {}),
    };
}
//# sourceMappingURL=legacy-agent-identity.js.map