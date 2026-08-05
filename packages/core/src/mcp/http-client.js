import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { buildMcpToolCallPayload, extractMcpToolOutput, } from "./client.js";
function httpEndpoint(config) {
    let endpoint;
    try {
        endpoint = new URL(config.url?.trim() ?? "");
    }
    catch {
        throw new Error("External feature HTTP endpoint is invalid.");
    }
    if (endpoint.protocol !== "http:" && endpoint.protocol !== "https:")
        throw new Error("External feature HTTP endpoint protocol is not supported.");
    if (endpoint.username || endpoint.password)
        throw new Error("External feature HTTP endpoint credentials are not allowed.");
    if (endpoint.hash)
        throw new Error("External feature HTTP endpoint fragment is not allowed.");
    return endpoint;
}
function isAbortSignal(value) {
    return Boolean(value &&
        typeof value === "object" &&
        "aborted" in value &&
        typeof value.addEventListener === "function");
}
export class McpHttpClient {
    config;
    onExit;
    client = null;
    transport = null;
    closing = false;
    constructor(options) {
        this.config = options.config;
        this.onExit = options.onExit;
    }
    async initialize(signal) {
        if (this.client)
            return;
        if (signal?.aborted)
            throw new DOMException("The operation was aborted.", "AbortError");
        this.closing = false;
        const client = new Client({ name: "knowbee", version: "0.1.0" });
        const transport = new StreamableHTTPClientTransport(httpEndpoint(this.config));
        transport.onerror = (error) => {
            if (!this.closing)
                this.onExit?.(error.message);
        };
        transport.onclose = () => {
            if (!this.closing)
                this.onExit?.("External feature HTTP connection closed.");
        };
        try {
            await client.connect(transport, {
                timeout: this.startupTimeoutMs(),
                ...(signal ? { signal } : {}),
            });
            this.client = client;
            this.transport = transport;
        }
        catch (error) {
            await client.close().catch(() => undefined);
            throw error;
        }
    }
    async listTools(signal) {
        await this.initialize(signal);
        const response = await this.requireClient().listTools({}, {
            timeout: this.toolTimeoutMs(),
            ...(signal ? { signal } : {}),
        });
        return response.tools.map((tool) => ({
            name: tool.name.trim(),
            description: tool.description?.trim() ?? "",
            inputSchema: {
                type: "object",
                properties: tool.inputSchema.properties ?? {},
                ...(tool.inputSchema.required ? { required: [...tool.inputSchema.required] } : {}),
            },
        }));
    }
    async callTool(name, args, contextOrSignal, signal) {
        const context = isAbortSignal(contextOrSignal) ? undefined : contextOrSignal;
        const resolvedSignal = isAbortSignal(contextOrSignal) ? contextOrSignal : signal;
        await this.initialize(resolvedSignal);
        const response = await this.requireClient().callTool(buildMcpToolCallPayload(name, args, context), undefined, { timeout: this.toolTimeoutMs(), ...(resolvedSignal ? { signal: resolvedSignal } : {}) });
        return {
            output: extractMcpToolOutput(response),
            details: response,
            isError: response.isError === true,
        };
    }
    async close() {
        this.closing = true;
        const transport = this.transport;
        const client = this.client;
        this.transport = null;
        this.client = null;
        if (transport)
            await transport.terminateSession().catch(() => undefined);
        if (client)
            await client.close().catch(() => undefined);
    }
    requireClient() {
        if (!this.client)
            throw new Error("External feature HTTP connection is not ready.");
        return this.client;
    }
    startupTimeoutMs() {
        return Math.max(1, this.config.startupTimeoutSec ?? 10) * 1000;
    }
    toolTimeoutMs() {
        return Math.max(1, this.config.toolTimeoutSec ?? 30) * 1000;
    }
}
//# sourceMappingURL=http-client.js.map