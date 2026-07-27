import { validateMcpConnectionDraft, type McpConnectionDraft } from "./mcp-connection-validation.js"

export interface McpConnectionProbePort {
  now(): number
  probe(input: McpConnectionDraft, signal: AbortSignal): Promise<{ ok: boolean; reasonCode?: string; tools: readonly { name: string; description: string }[] }>
}

export interface McpConnectionProbeReceipt {
  state: "ready" | "rejected" | "failed" | "cancelled"
  ready: boolean
  reasonCode: string | null
  tools: Array<{ name: string; description: string }>
  observedAt: number
}

function receipt(ports: McpConnectionProbePort, state: McpConnectionProbeReceipt["state"], reasonCode: string | null, tools: McpConnectionProbeReceipt["tools"] = []): McpConnectionProbeReceipt {
  return { state, ready: state === "ready", reasonCode, tools, observedAt: ports.now() }
}

export async function probeMcpConnectionDraft(input: unknown, ports: McpConnectionProbePort, signal: AbortSignal = new AbortController().signal): Promise<McpConnectionProbeReceipt> {
  const validation = validateMcpConnectionDraft(input)
  if (!validation.valid || !validation.draft) return receipt(ports, "rejected", validation.reasonCodes[0] ?? "mcp_draft_invalid")
  if (signal.aborted) return receipt(ports, "cancelled", "mcp_probe_cancelled")
  try {
    const result = await ports.probe(validation.draft, signal)
    if (signal.aborted) return receipt(ports, "cancelled", "mcp_probe_cancelled")
    if (!result.ok) return receipt(ports, "failed", "mcp_connection_probe_failed")
    const names = new Set<string>()
    const tools: McpConnectionProbeReceipt["tools"] = []
    for (const tool of result.tools) {
      const name = tool.name.trim()
      if (!name || names.has(name)) return receipt(ports, "failed", "mcp_probe_tool_collision")
      names.add(name)
      tools.push({ name, description: tool.description.trim() })
    }
    tools.sort((left, right) => left.name.localeCompare(right.name))
    return receipt(ports, "ready", null, tools)
  } catch {
    return signal.aborted ? receipt(ports, "cancelled", "mcp_probe_cancelled") : receipt(ports, "failed", "mcp_connection_probe_failed")
  }
}
