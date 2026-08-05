export interface InternalAgentIdentity {
  agentId: string
  agentName: string
}

export interface UserFacingAgentIdentity {
  agentName: string
}

export interface InternalAgentMessage {
  identity: unknown
  messageId: string
  parentRunId: string
  speaker: {
    entityId: string
    agentNameSnapshot: string
  }
  text: string
  createdAt: number
}

export interface UserFacingAgentMessage {
  speaker: UserFacingAgentIdentity
  text: string
  createdAt: number
}

export function projectUserFacingAgentIdentity(
  input: InternalAgentIdentity,
): UserFacingAgentIdentity {
  const agentName = input.agentName.trim()
  if (!agentName) throw new Error("Agent name is required for user-facing identity.")
  return { agentName }
}

export function projectUserFacingAgentMessage(
  input: InternalAgentMessage,
): UserFacingAgentMessage {
  const text = input.text.trim()
  if (!text) throw new Error("Message text is required for user-facing delivery.")
  if (!Number.isFinite(input.createdAt)) throw new Error("Message creation time must be finite.")
  return {
    speaker: projectUserFacingAgentIdentity({
      agentId: input.speaker.entityId,
      agentName: input.speaker.agentNameSnapshot,
    }),
    text,
    createdAt: input.createdAt,
  }
}
