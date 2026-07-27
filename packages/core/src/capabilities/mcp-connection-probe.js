import { validateMcpConnectionDraft } from "./mcp-connection-validation.js";
function receipt(ports, state, reasonCode, tools = []) {
    return { state, ready: state === "ready", reasonCode, tools, observedAt: ports.now() };
}
export async function probeMcpConnectionDraft(input, ports, signal = new AbortController().signal) {
    const validation = validateMcpConnectionDraft(input);
    if (!validation.valid || !validation.draft)
        return receipt(ports, "rejected", validation.reasonCodes[0] ?? "mcp_draft_invalid");
    if (signal.aborted)
        return receipt(ports, "cancelled", "mcp_probe_cancelled");
    try {
        const result = await ports.probe(validation.draft, signal);
        if (signal.aborted)
            return receipt(ports, "cancelled", "mcp_probe_cancelled");
        if (!result.ok)
            return receipt(ports, "failed", "mcp_connection_probe_failed");
        const names = new Set();
        const tools = [];
        for (const tool of result.tools) {
            const name = tool.name.trim();
            if (!name || names.has(name))
                return receipt(ports, "failed", "mcp_probe_tool_collision");
            names.add(name);
            tools.push({ name, description: tool.description.trim() });
        }
        tools.sort((left, right) => left.name.localeCompare(right.name));
        return receipt(ports, "ready", null, tools);
    }
    catch {
        return signal.aborted ? receipt(ports, "cancelled", "mcp_probe_cancelled") : receipt(ports, "failed", "mcp_connection_probe_failed");
    }
}
//# sourceMappingURL=mcp-connection-probe.js.map