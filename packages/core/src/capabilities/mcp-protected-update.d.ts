import { type McpConnectionDraft, type McpConnectionValidationResult } from "./mcp-connection-validation.js";
export interface McpProtectedUpdateChange {
    displayName?: string;
    required?: boolean;
    replacement?: {
        transport: "stdio" | "http";
        command: string;
        args: readonly string[];
        cwd: string;
        url?: string;
    };
}
export declare function validateMcpProtectedUpdateShape(input: unknown): string | null;
export declare function mergeMcpProtectedUpdate(current: McpConnectionDraft, input: unknown): McpConnectionValidationResult;
//# sourceMappingURL=mcp-protected-update.d.ts.map