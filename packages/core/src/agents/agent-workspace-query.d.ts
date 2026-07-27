import type { AgentWorkspaceDetail, AgentWorkspaceItem, AgentWorkspaceProjection, AgentWorkspaceStatus } from "./agent-workspace-projection.js";
export interface AgentWorkspaceQueryInput {
    search?: string;
    status?: AgentWorkspaceStatus;
    cursor?: string;
    limit?: number;
}
export declare function projectAgentWorkspaceQueryLog(input: {
    level: "product" | "field_debug" | "development";
    status: "passed" | "failed";
    resultCount: number;
    durationMs: number;
    filterCount: number;
    reasonCode?: string;
}): Readonly<Record<string, unknown>>;
export declare function queryAgentWorkspace(projection: AgentWorkspaceProjection, input?: AgentWorkspaceQueryInput): {
    items: AgentWorkspaceItem[];
    nextCursor: string | null;
    cursorValid: boolean;
    totalMatches: number;
    summary: {
        total: number;
        enabled: number;
        disabled: number;
        archived: number;
        degraded: number;
        issueCount: number;
        diagnosticCodes: import("./agent-workspace-projection.js").AgentWorkspaceDiagnosticCode[];
    };
    observedAt: number;
};
export declare function resolveAgentWorkspaceDetail(projection: AgentWorkspaceProjection, agentRef: string): AgentWorkspaceDetail | null;
//# sourceMappingURL=agent-workspace-query.d.ts.map