import type { McpConnectionDraft } from "./mcp-connection-validation.js";
export interface McpWorkingDirectoryFileSystem {
    realpath(path: string): string;
    isDirectory(path: string): boolean;
}
export declare const NODE_MCP_WORKING_DIRECTORY_FILE_SYSTEM: McpWorkingDirectoryFileSystem;
export type McpWorkingDirectoryInspection = {
    ok: true;
    draft: McpConnectionDraft;
} | {
    ok: false;
    reasonCode: "mcp_cwd_unavailable" | "mcp_cwd_outside_allowed_root";
};
export declare function inspectMcpWorkingDirectory(input: {
    draft: McpConnectionDraft;
    defaultWorkspace: string;
    allowedRoots: readonly string[];
    fileSystem?: McpWorkingDirectoryFileSystem;
}): McpWorkingDirectoryInspection;
//# sourceMappingURL=mcp-working-directory.d.ts.map