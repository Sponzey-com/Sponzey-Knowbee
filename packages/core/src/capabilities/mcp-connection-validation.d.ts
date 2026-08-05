export interface McpConnectionDraft {
    displayName: string;
    transport: "stdio" | "http";
    command: string;
    args: readonly string[];
    cwd: string;
    url?: string;
    required: boolean;
}
export interface McpConnectionValidationResult {
    valid: boolean;
    reasonCodes: string[];
    draft?: McpConnectionDraft;
}
export declare function validateMcpConnectionDraft(input: unknown): McpConnectionValidationResult;
//# sourceMappingURL=mcp-connection-validation.d.ts.map