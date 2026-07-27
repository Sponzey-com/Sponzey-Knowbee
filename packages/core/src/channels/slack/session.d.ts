export declare function resolveSlackSessionKey(channelId: string, threadTs: string): string;
export declare function parseSlackSessionKey(sessionKey: string): {
    channelId: string;
    threadTs: string;
} | null;
export declare function getOrCreateSlackSession(sessionKey: string): string;
export declare function newSlackSession(sessionKey: string): string;
//# sourceMappingURL=session.d.ts.map