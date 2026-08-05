export function projectUserFacingAgentIdentity(input) {
    const agentName = input.agentName.trim();
    if (!agentName)
        throw new Error("Agent name is required for user-facing identity.");
    return { agentName };
}
export function projectUserFacingAgentMessage(input) {
    const text = input.text.trim();
    if (!text)
        throw new Error("Message text is required for user-facing delivery.");
    if (!Number.isFinite(input.createdAt))
        throw new Error("Message creation time must be finite.");
    return {
        speaker: projectUserFacingAgentIdentity({
            agentId: input.speaker.entityId,
            agentName: input.speaker.agentNameSnapshot,
        }),
        text,
        createdAt: input.createdAt,
    };
}
//# sourceMappingURL=user-facing-agent-identity.js.map