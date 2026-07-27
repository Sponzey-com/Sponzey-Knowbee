import { describe, expect, it } from "vitest"
import { inspectMcpWorkingDirectory } from "../packages/core/src/capabilities/mcp-working-directory.js"

const draft = { displayName: "Penpot", transport: "stdio" as const, command: "node", args: ["server.mjs"], cwd: "", required: false }

describe("task029 MCP working directory boundary", () => {
  it("canonicalizes the default workspace and an allowed child", () => {
    const fileSystem = { realpath: (path: string) => path, isDirectory: () => true }
    expect(inspectMcpWorkingDirectory({ draft, defaultWorkspace: "/workspace", allowedRoots: [], fileSystem })).toMatchObject({ ok: true, draft: { cwd: "/workspace" } })
    expect(inspectMcpWorkingDirectory({ draft: { ...draft, cwd: "/workspace/project/../project" }, defaultWorkspace: "/workspace", allowedRoots: [], fileSystem })).toMatchObject({ ok: true, draft: { cwd: "/workspace/project" } })
  })

  it("rejects a symlink escape and unavailable directory", () => {
    const symlink = { realpath: (path: string) => path === "/workspace/link" ? "/private/outside" : path, isDirectory: () => true }
    expect(inspectMcpWorkingDirectory({ draft: { ...draft, cwd: "/workspace/link" }, defaultWorkspace: "/workspace", allowedRoots: [], fileSystem: symlink })).toEqual({ ok: false, reasonCode: "mcp_cwd_outside_allowed_root" })
    const unavailable = { realpath: () => { throw new Error("missing") }, isDirectory: () => false }
    expect(inspectMcpWorkingDirectory({ draft, defaultWorkspace: "/workspace", allowedRoots: [], fileSystem: unavailable })).toEqual({ ok: false, reasonCode: "mcp_cwd_unavailable" })
  })
})
