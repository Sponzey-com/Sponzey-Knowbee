import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { probeMcpConnectionDraft } from "../packages/core/src/capabilities/mcp-connection-probe.js"
import { validateMcpConnectionDraft } from "../packages/core/src/capabilities/mcp-connection-validation.js"

const draft = { displayName: " Penpot ", transport: "stdio", command: " /usr/bin/node ", args: [" server.mjs ", ""], cwd: " /workspace ", required: true }

describe("task028 MCP connection validation and probe", () => {
  it("normalizes an explicit stdio executable and argument contract", () => {
    expect(validateMcpConnectionDraft(draft)).toEqual({ valid: true, reasonCodes: [], draft: { displayName: "Penpot", transport: "stdio", command: "/usr/bin/node", args: ["server.mjs"], cwd: "/workspace", required: true } })
  })

  it("rejects missing, malformed and unknown fields", () => {
    expect(validateMcpConnectionDraft({ ...draft, displayName: "" }).reasonCodes).toContain("mcp_display_name_missing")
    expect(validateMcpConnectionDraft({ ...draft, command: "" }).reasonCodes).toContain("mcp_command_missing")
    expect(validateMcpConnectionDraft({ ...draft, transport: "http" }).reasonCodes).toContain("mcp_url_missing")
    expect(validateMcpConnectionDraft({ ...draft, command: "node\n--eval" }).reasonCodes).toContain("mcp_command_invalid")
    expect(validateMcpConnectionDraft({ ...draft, args: ["ok", 3] }).reasonCodes).toContain("mcp_args_invalid")
    expect(validateMcpConnectionDraft({ ...draft, environment: { TOKEN: "secret" } }).reasonCodes).toContain("mcp_draft_field_unknown")
  })

  it("probes only valid drafts and returns a redacted tool projection", async () => {
    let received: unknown
    const result = await probeMcpConnectionDraft(draft, { now: () => 20, probe: async (input) => { received = input; return { ok: true, tools: [{ name: "inspect", description: "Inspect" }] } } })
    expect(received).toEqual({ displayName: "Penpot", transport: "stdio", command: "/usr/bin/node", args: ["server.mjs"], cwd: "/workspace", required: true })
    expect(result).toEqual({ state: "ready", ready: true, reasonCode: null, tools: [{ name: "inspect", description: "Inspect" }], observedAt: 20 })
    expect(JSON.stringify(result)).not.toMatch(/command|workspace|usr\/bin|environment|secret/)

    let called = false
    const http = await probeMcpConnectionDraft(
      {
        ...draft,
        transport: "http",
        command: "",
        args: [],
        cwd: "",
        url: "https://mcp.example.test/endpoint",
      },
      {
        now: () => 21,
        probe: async (input) => {
          called = true
          expect(input).toMatchObject({
            transport: "http",
            url: "https://mcp.example.test/endpoint",
          })
          return { ok: true, tools: [] }
        },
      },
    )
    expect(http).toMatchObject({ state: "ready", ready: true, reasonCode: null })
    expect(called).toBe(true)
  })

  it("accepts zero tools but rejects duplicate evidence and redacts adapter failures", async () => {
    expect(await probeMcpConnectionDraft(draft, { now: () => 1, probe: async () => ({ ok: true, tools: [] }) })).toMatchObject({ state: "ready", ready: true, tools: [] })
    expect(await probeMcpConnectionDraft(draft, { now: () => 2, probe: async () => ({ ok: true, tools: [{ name: "x", description: "" }, { name: "x", description: "duplicate" }] }) })).toMatchObject({ state: "failed", ready: false, reasonCode: "mcp_probe_tool_collision", tools: [] })
    const failed = await probeMcpConnectionDraft(draft, { now: () => 3, probe: async () => ({ ok: false, reasonCode: "spawn /private/path token=secret", tools: [] }) })
    expect(failed).toMatchObject({ state: "failed", ready: false, reasonCode: "mcp_connection_probe_failed", tools: [] })
    expect(JSON.stringify(failed)).not.toMatch(/private|token|secret|spawn/)
  })

  it("honors cancellation before and after the adapter call", async () => {
    const before = new AbortController(); before.abort()
    expect(await probeMcpConnectionDraft(draft, { now: () => 1, probe: async () => ({ ok: true, tools: [] }) }, before.signal)).toMatchObject({ state: "cancelled", reasonCode: "mcp_probe_cancelled" })
    const after = new AbortController()
    expect(await probeMcpConnectionDraft(draft, { now: () => 2, probe: async () => { after.abort(); return { ok: true, tools: [] } } }, after.signal)).toMatchObject({ state: "cancelled", reasonCode: "mcp_probe_cancelled" })
  })

  it("keeps validation and application free of process and infrastructure access", () => {
    const source = ["mcp-connection-validation.ts", "mcp-connection-probe.ts"].map((name) => readFileSync(`packages/core/src/capabilities/${name}`, "utf8")).join("\n")
    expect(source).not.toMatch(/process\.env|node:child_process|node:fs|Fastify|McpStdioClient|mcp\/client|db\/index/)
    const routeSource = readFileSync("packages/core/src/api/routes/mcp.ts", "utf8")
    expect(routeSource).not.toMatch(/process\.env/)
  })
})
