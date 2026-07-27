import { mcpRegistry, } from "../mcp/registry.js";
export function createMcpStartupPort(registry = mcpRegistry) {
    return Object.freeze({
        prepare(config, baseEnv) {
            return registry.prepareFromConfig(config, baseEnv ? { ...baseEnv } : undefined);
        },
        connectConfigured() {
            return registry.connectConfigured();
        },
        cancel() {
            return registry.closeAll();
        },
        close() {
            return registry.closeAll();
        },
    });
}
export function startMcpConnectionsInBackground(port) {
    const completion = Promise.resolve()
        .then(() => port.connectConfigured())
        .then((statuses) => ({
        status: "completed",
        statuses,
    }), () => ({
        status: "failed",
        reasonCode: "mcp_connection_failed",
    }));
    return Object.freeze({ status: "started", completion });
}
//# sourceMappingURL=mcp-startup-port.js.map