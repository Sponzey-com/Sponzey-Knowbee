import { normalizeAgentNameSnapshot } from "../contracts/sub-agent-orchestration.js"

export interface LegacyAgentIdentityImport {
  agentName?: unknown
  displayName?: unknown
  nickname?: unknown
}

export function canonicalizeLegacyAgentIdentity<T extends Record<string, unknown>>(
  input: T & LegacyAgentIdentityImport,
): Omit<T, "agentName" | "displayName" | "nickname" | "normalizedNickname"> & { agentName?: string } {
  const {
    agentName: rawAgentName,
    displayName: rawDisplayName,
    nickname: rawNickname,
    normalizedNickname: _normalizedNickname,
    ...canonical
  } = input
  const selected = [rawAgentName, rawDisplayName, rawNickname]
    .find((value): value is string => typeof value === "string" && value.trim().length > 0)
  const agentName = normalizeAgentNameSnapshot(selected ?? "")
  return {
    ...canonical,
    ...(agentName ? { agentName } : {}),
  }
}
