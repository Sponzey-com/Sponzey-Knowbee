import { spawn } from "node:child_process";
import { createLogger } from "../logger/index.js";
const log = createLogger("mcp:client");
const DEFAULT_PROTOCOL_VERSION = "2024-11-05";
const MCP_BASE_ENV = { ...process.env };
const MCP_LOG_SECRET_MASK = "***";
const MCP_LOG_PATH_MASK = "[internal-path-redacted]";
function mcpClientErrorMessage(error) {
    const raw = error instanceof Error ? error.message : String(error);
    return redactMcpLogText(raw);
}
function toObject(value) {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};
}
function toArray(value) {
    return Array.isArray(value) ? value : [];
}
function toStringArray(value) {
    return Array.isArray(value)
        ? value.filter((item) => typeof item === "string")
        : [];
}
function normalizeInputSchema(value) {
    const raw = toObject(value);
    const properties = toObject(raw.properties);
    const required = toStringArray(raw.required);
    return {
        type: "object",
        properties,
        ...(required.length > 0 ? { required } : {}),
    };
}
function validateInitializeResponse(value) {
    const response = toObject(value);
    const serverInfo = toObject(response.serverInfo);
    if (typeof response.protocolVersion !== "string" ||
        !response.protocolVersion.trim() ||
        !response.capabilities ||
        typeof response.capabilities !== "object" ||
        Array.isArray(response.capabilities) ||
        typeof serverInfo.name !== "string" ||
        !serverInfo.name.trim() ||
        typeof serverInfo.version !== "string" ||
        !serverInfo.version.trim())
        throw new Error("External feature connection handshake is invalid.");
}
export function extractMcpToolOutput(payload) {
    const raw = toObject(payload);
    const textParts = toArray(raw.content)
        .map((item) => {
        const row = toObject(item);
        if (row.type === "text" && typeof row.text === "string")
            return row.text;
        if (row.type === "image" && typeof row.mimeType === "string")
            return `[image:${row.mimeType}]`;
        if (row.type === "resource" && typeof row.uri === "string")
            return `[resource:${row.uri}]`;
        return "";
    })
        .filter((value) => value.trim().length > 0);
    if (textParts.length > 0) {
        return textParts.join("\n").trim();
    }
    return JSON.stringify(payload, null, 2);
}
function isAbortSignal(value) {
    return Boolean(value &&
        typeof value === "object" &&
        "aborted" in value &&
        typeof value.addEventListener === "function");
}
export function redactMcpLogText(value) {
    return value
        .replace(/https?:\/\/[^\s"'`<>]+/giu, "[external-endpoint-redacted]")
        .replace(/((?:api[_-]?key|token|secret|password|credential|authorization)(?:["'\s:=]+))([^"'\s,}]+)/gi, `$1${MCP_LOG_SECRET_MASK}`)
        .replace(/Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, `Bearer ${MCP_LOG_SECRET_MASK}`)
        .replace(/\/(?:private\/)?var\/folders\/[^\s"'`<>]+/gi, MCP_LOG_PATH_MASK)
        .replace(/\/tmp\/[^\s"'`<>]+/gi, MCP_LOG_PATH_MASK)
        .replace(/\/Users\/[^\s"'`<>]+/gi, MCP_LOG_PATH_MASK)
        .replace(/[A-Z]:\\[^\s"'`<>]+/gi, MCP_LOG_PATH_MASK);
}
export function buildMcpToolCallPayload(name, args, context) {
    if (!context) {
        return { name, arguments: args };
    }
    return {
        name,
        arguments: args,
        _meta: {
            knowbee: {
                agent_id: context.agentId,
                session_id: context.sessionId,
                ...(context.bindingId ? { binding_id: context.bindingId } : {}),
                ...(context.clientSessionId ? { client_session_id: context.clientSessionId } : {}),
                permission_profile: {
                    profile_id: context.permissionProfile.profileId,
                    risk_ceiling: context.permissionProfile.riskCeiling,
                    approval_required_from: context.permissionProfile.approvalRequiredFrom,
                    allow_external_network: context.permissionProfile.allowExternalNetwork,
                    allow_filesystem_write: context.permissionProfile.allowFilesystemWrite,
                    allow_shell_execution: context.permissionProfile.allowShellExecution,
                    allow_screen_control: context.permissionProfile.allowScreenControl,
                },
                secret_scope: context.secretScopeId,
                audit_id: context.auditId,
                ...(context.runId ? { run_id: context.runId } : {}),
                ...(context.requestGroupId ? { request_group_id: context.requestGroupId } : {}),
                ...(context.capabilityDelegationId
                    ? { capability_delegation_id: context.capabilityDelegationId }
                    : {}),
            },
        },
    };
}
export class McpStdioClient {
    name;
    config;
    onExit;
    baseEnv;
    defaultCwd;
    process = null;
    stdoutBuffer = Buffer.alloc(0);
    requestId = 0;
    initialized = false;
    pending = new Map();
    closedByUser = false;
    lifecycleState = "created";
    constructor(options) {
        this.name = options.name;
        this.config = options.config;
        this.onExit = options.onExit;
        this.baseEnv = { ...(options.baseEnv ?? MCP_BASE_ENV) };
        this.defaultCwd = options.defaultCwd;
    }
    async initialize() {
        if (this.initialized)
            return;
        await this.ensureProcess();
        const initialized = await this.request("initialize", {
            protocolVersion: DEFAULT_PROTOCOL_VERSION,
            clientInfo: {
                name: "knowbee",
                version: "0.1.0",
            },
            capabilities: {},
        }, this.startupTimeoutMs());
        validateInitializeResponse(initialized);
        await this.notify("notifications/initialized", {});
        this.initialized = true;
        this.lifecycleState = "ready";
    }
    async listTools() {
        await this.initialize();
        const response = toObject(await this.request("tools/list", {}, this.toolTimeoutMs()));
        return toArray(response.tools)
            .map((tool) => {
            const row = toObject(tool);
            if (typeof row.name !== "string" || !row.name.trim())
                return null;
            return {
                name: row.name.trim(),
                description: typeof row.description === "string" ? row.description.trim() : "",
                inputSchema: normalizeInputSchema(row.inputSchema),
            };
        })
            .filter((tool) => tool !== null);
    }
    async callTool(name, args, contextOrSignal, signal) {
        await this.initialize();
        const context = isAbortSignal(contextOrSignal) ? undefined : contextOrSignal;
        const resolvedSignal = isAbortSignal(contextOrSignal) ? contextOrSignal : signal;
        const response = await this.request("tools/call", buildMcpToolCallPayload(name, args, context), this.toolTimeoutMs(), resolvedSignal);
        const payload = toObject(response);
        return {
            output: extractMcpToolOutput(payload),
            details: payload,
            isError: Boolean(payload.isError),
        };
    }
    async close() {
        this.closedByUser = true;
        this.initialized = false;
        this.lifecycleState = "closing";
        this.rejectAll(new Error(`External feature connection "${this.name}" was closed.`));
        const child = this.process;
        this.process = null;
        if (!child) {
            this.lifecycleState = "closed";
            return;
        }
        child.stdout.removeAllListeners();
        child.stderr.removeAllListeners();
        child.removeAllListeners();
        if (!child.killed) {
            child.kill();
        }
        this.lifecycleState = "closed";
    }
    async ensureProcess() {
        if (this.process)
            return;
        const command = this.config.command?.trim();
        if (!command) {
            throw new Error(`External feature connection "${this.name}" command is empty.`);
        }
        const child = spawn(command, this.config.args ?? [], {
            cwd: this.config.cwd || this.defaultCwd,
            env: {
                ...this.baseEnv,
                ...(this.config.env ?? {}),
            },
            stdio: ["pipe", "pipe", "pipe"],
        });
        this.lifecycleState = "starting";
        child.stdout.on("data", (chunk) => {
            this.stdoutBuffer = Buffer.concat([this.stdoutBuffer, chunk]);
            this.consumeFrames();
        });
        child.stderr.on("data", (chunk) => {
            const text = chunk.toString("utf8").trim();
            if (text) {
                log.fieldDebug("external_feature_process_stderr", {
                    target: redactMcpLogText(this.name),
                    error: redactMcpLogText(text),
                });
            }
        });
        child.stdin.on("error", (error) => {
            const message = mcpClientErrorMessage(error);
            const safeName = redactMcpLogText(this.name);
            this.transitionProcessToFailed(child, new Error(`External feature connection "${safeName}" input error: ${message}`));
        });
        child.on("error", (error) => {
            const message = mcpClientErrorMessage(error);
            const safeName = redactMcpLogText(this.name);
            this.transitionProcessToFailed(child, new Error(`External feature connection "${safeName}" process error: ${message}`));
        });
        child.on("exit", (code, signal) => {
            const safeName = redactMcpLogText(this.name);
            const message = code !== null
                ? `External feature connection "${safeName}" exited with code ${code}.`
                : `External feature connection "${safeName}" exited with signal ${signal ?? "unknown"}.`;
            this.transitionProcessToFailed(child, new Error(message));
        });
        this.closedByUser = false;
        this.process = child;
        log.fieldDebug("external_feature_process_started", {
            target: redactMcpLogText(this.name),
        });
    }
    consumeFrames() {
        while (true) {
            const headerEnd = this.stdoutBuffer.indexOf("\r\n\r\n");
            if (headerEnd === -1)
                return;
            const header = this.stdoutBuffer.subarray(0, headerEnd).toString("utf8");
            const match = header.match(/Content-Length:\s*(\d+)/i);
            if (!match) {
                this.stdoutBuffer = this.stdoutBuffer.subarray(headerEnd + 4);
                continue;
            }
            const bodyLength = Number(match[1]);
            const totalLength = headerEnd + 4 + bodyLength;
            if (this.stdoutBuffer.length < totalLength)
                return;
            const body = this.stdoutBuffer.subarray(headerEnd + 4, totalLength).toString("utf8");
            this.stdoutBuffer = this.stdoutBuffer.subarray(totalLength);
            try {
                const message = JSON.parse(body);
                this.handleMessage(message);
            }
            catch (error) {
                log.fieldDebug("external_feature_message_parse_failed", {
                    target: redactMcpLogText(this.name),
                    error: mcpClientErrorMessage(error),
                });
            }
        }
    }
    handleMessage(message) {
        if (typeof message.id !== "number")
            return;
        const pending = this.pending.get(message.id);
        if (!pending)
            return;
        clearTimeout(pending.timeout);
        this.pending.delete(message.id);
        const maybeError = message.error;
        if (maybeError) {
            pending.reject(new Error(maybeError.message ?? `External feature request ${message.id} failed.`));
            return;
        }
        pending.resolve(message.result);
    }
    async notify(method, params) {
        await this.ensureProcess();
        const child = this.process;
        if (!child)
            throw new Error(`External feature connection "${this.name}" process is not available.`);
        const payload = JSON.stringify({ jsonrpc: "2.0", method, params });
        await this.writeFrame(child, payload);
    }
    async request(method, params, timeoutMs, signal) {
        await this.ensureProcess();
        const child = this.process;
        if (!child)
            throw new Error(`External feature connection "${this.name}" process is not available.`);
        return new Promise((resolve, reject) => {
            const id = ++this.requestId;
            const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params });
            const timeout = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`External feature ${this.name}:${method} timed out after ${timeoutMs}ms`));
            }, timeoutMs);
            this.pending.set(id, { resolve, reject, timeout });
            if (signal) {
                signal.addEventListener("abort", () => {
                    const pending = this.pending.get(id);
                    if (!pending)
                        return;
                    clearTimeout(pending.timeout);
                    this.pending.delete(id);
                    reject(new Error(`External feature ${this.name}:${method} was aborted.`));
                }, { once: true });
            }
            void this.writeFrame(child, payload).catch((error) => {
                const pending = this.pending.get(id);
                if (!pending)
                    return;
                clearTimeout(pending.timeout);
                this.pending.delete(id);
                pending.reject(error);
            });
        });
    }
    writeFrame(child, payload) {
        if (this.process !== child ||
            (this.lifecycleState !== "starting" && this.lifecycleState !== "ready") ||
            !child.stdin.writable ||
            child.stdin.destroyed) {
            return Promise.reject(new Error(`External feature connection "${this.name}" is not writable.`));
        }
        const frame = `Content-Length: ${Buffer.byteLength(payload, "utf8")}\r\n\r\n${payload}`;
        return new Promise((resolve, reject) => {
            try {
                child.stdin.write(frame, (error) => {
                    if (error) {
                        reject(new Error(`External feature connection "${this.name}" write failed: ${mcpClientErrorMessage(error)}`));
                        return;
                    }
                    resolve();
                });
            }
            catch (error) {
                reject(new Error(`External feature connection "${this.name}" write failed: ${mcpClientErrorMessage(error)}`));
            }
        });
    }
    transitionProcessToFailed(child, error) {
        if (this.process !== child)
            return;
        this.process = null;
        this.initialized = false;
        this.lifecycleState = "failed";
        this.rejectAll(error);
        if (!this.closedByUser) {
            this.onExit?.(error.message);
        }
    }
    rejectAll(error) {
        for (const [id, pending] of this.pending) {
            clearTimeout(pending.timeout);
            pending.reject(error);
            this.pending.delete(id);
        }
    }
    startupTimeoutMs() {
        return Math.max(1, this.config.startupTimeoutSec ?? 10) * 1000;
    }
    toolTimeoutMs() {
        return Math.max(1, this.config.toolTimeoutSec ?? 30) * 1000;
    }
}
//# sourceMappingURL=client.js.map