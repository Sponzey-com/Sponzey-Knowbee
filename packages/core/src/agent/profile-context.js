import { resolveAgentConfigAgentName, } from "../contracts/sub-agent-orchestration.js";
import { loadPromptValue } from "../memory/prompt-fragments.js";
const PROFILE_CONTEXT_USER_HEADER_SOURCE_ID = "profile_context_user_header_user";
const PROFILE_CONTEXT_AGENT_HEADER_SOURCE_ID = "profile_context_agent_header_user";
const PROFILE_CONTEXT_TEAM_HEADER_SOURCE_ID = "profile_context_team_header_user";
function normalize(value) {
    return value?.trim() ?? "";
}
export function resolveUserProfileName(profile) {
    return normalize(profile.displayName) || normalize(profile.profileName);
}
export function buildUserProfilePromptContext(profile) {
    const lines = [];
    const userName = resolveUserProfileName(profile);
    const language = normalize(profile.language);
    const timezone = normalize(profile.timezone);
    const workspace = normalize(profile.workspace);
    if (userName)
        lines.push(`- userName: ${userName}`);
    if (language)
        lines.push(`- defaultLanguage: ${language}`);
    if (timezone)
        lines.push(`- defaultTimezone: ${timezone}`);
    if (workspace)
        lines.push(`- defaultWorkspace: ${workspace}`);
    if (lines.length === 0)
        return "";
    return [
        loadPromptValue(PROFILE_CONTEXT_USER_HEADER_SOURCE_ID, {}, { required: true }),
        ...lines,
    ].join("\n");
}
export function buildAgentProfilePromptContext(input) {
    const agentName = resolveAgentConfigAgentName(input.agent);
    const lines = [
        `- agentType: ${input.agent.agentType}`,
        `- agentId: ${input.agent.agentId}`,
        `- agentName: ${agentName}`,
        `- role: ${input.agent.role}`,
        `- specialties: ${input.agent.specialtyTags.join(", ") || "none"}`,
        `- avoidTasks: ${input.agent.avoidTasks.join(", ") || "none"}`,
        `- memoryOwner: ${input.agent.memoryPolicy.owner.ownerType}:${input.agent.memoryPolicy.owner.ownerId}`,
        `- memoryVisibility: ${input.agent.memoryPolicy.visibility}`,
        `- riskCeiling: ${input.agent.capabilityPolicy.permissionProfile.riskCeiling}`,
        `- approvalRequiredFrom: ${input.agent.capabilityPolicy.permissionProfile.approvalRequiredFrom}`,
    ].filter(Boolean);
    const teamLines = (input.teams ?? [])
        .filter((team) => team.memberAgentIds.includes(input.agent.agentId))
        .map((team) => `- ${team.displayName} (${team.teamId}): ${team.roleHints.join(", ") || "reference only"}`);
    return [
        loadPromptValue(PROFILE_CONTEXT_AGENT_HEADER_SOURCE_ID, {}, { required: true }),
        ...lines,
        ...(teamLines.length > 0 ? ["", loadPromptValue(PROFILE_CONTEXT_TEAM_HEADER_SOURCE_ID, {}, { required: true }), ...teamLines] : []),
    ].join("\n");
}
//# sourceMappingURL=profile-context.js.map