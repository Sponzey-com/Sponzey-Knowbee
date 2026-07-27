import { realpathSync, statSync } from "node:fs"
import { isAbsolute, relative, resolve } from "node:path"
import type { McpConnectionDraft } from "./mcp-connection-validation.js"

export interface McpWorkingDirectoryFileSystem {
  realpath(path: string): string
  isDirectory(path: string): boolean
}

export const NODE_MCP_WORKING_DIRECTORY_FILE_SYSTEM: McpWorkingDirectoryFileSystem = Object.freeze({
  realpath: realpathSync,
  isDirectory: (path: string) => statSync(path).isDirectory(),
})

export type McpWorkingDirectoryInspection =
  | { ok: true; draft: McpConnectionDraft }
  | { ok: false; reasonCode: "mcp_cwd_unavailable" | "mcp_cwd_outside_allowed_root" }

function containedBy(candidate: string, root: string): boolean {
  const segment = relative(root, candidate)
  return segment === "" || (!segment.startsWith("..") && !isAbsolute(segment))
}

export function inspectMcpWorkingDirectory(input: {
  draft: McpConnectionDraft
  defaultWorkspace: string
  allowedRoots: readonly string[]
  fileSystem?: McpWorkingDirectoryFileSystem
}): McpWorkingDirectoryInspection {
  if (input.draft.transport === "http") return { ok: true, draft: input.draft }
  const fileSystem = input.fileSystem ?? NODE_MCP_WORKING_DIRECTORY_FILE_SYSTEM
  try {
    const candidate = fileSystem.realpath(resolve(input.draft.cwd || input.defaultWorkspace))
    if (!fileSystem.isDirectory(candidate)) return { ok: false, reasonCode: "mcp_cwd_unavailable" }
    const roots = [
      ...new Set(
        [input.defaultWorkspace, ...input.allowedRoots].map((root) => root.trim()).filter(Boolean),
      ),
    ].map((root) => fileSystem.realpath(resolve(root)))
    if (!roots.some((root) => containedBy(candidate, root)))
      return { ok: false, reasonCode: "mcp_cwd_outside_allowed_root" }
    return {
      ok: true,
      draft: Object.freeze({
        ...input.draft,
        args: Object.freeze([...input.draft.args]),
        cwd: candidate,
      }),
    }
  } catch {
    return { ok: false, reasonCode: "mcp_cwd_unavailable" }
  }
}
