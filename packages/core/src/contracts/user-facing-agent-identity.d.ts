export interface InternalAgentIdentity {
    agentId: string;
    agentName: string;
}
export interface UserFacingAgentIdentity {
    agentName: string;
}
export interface InternalAgentMessage {
    identity: unknown;
    messageId: string;
    parentRunId: string;
    speaker: {
        entityId: string;
        agentNameSnapshot: string;
    };
    text: string;
    createdAt: number;
}
export interface UserFacingAgentMessage {
    speaker: UserFacingAgentIdentity;
    text: string;
    createdAt: number;
}
export declare function projectUserFacingAgentIdentity(input: InternalAgentIdentity): UserFacingAgentIdentity;
export declare function projectUserFacingAgentMessage(input: InternalAgentMessage): UserFacingAgentMessage;
//# sourceMappingURL=user-facing-agent-identity.d.ts.map