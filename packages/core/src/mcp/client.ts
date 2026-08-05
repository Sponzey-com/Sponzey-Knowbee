import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process"
import { createLogger } from "../logger/index.js"
import type { AgentCapabilityCallContext } from "../security/capability-isolation.js"

const log = createLogger("mcp:client")
const DEFAULT_PROTOCOL_VERSION = "2024-11-05"
const MCP_BASE_ENV: NodeJS.ProcessEnv = { ...process.env }
const MCP_LOG_SECRET_MASK = "***"
const MCP_LOG_PATH_MASK = "[internal-path-redacted]"

function mcpClientErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return redactMcpLogText(raw)
}

export type McpTransport = "stdio" | "http"

export interface McpServerConfig {
  enabled?: boolean
  transport?: McpTransport
  command?: string
  args?: string[]
  cwd?: string
  env?: Record<string, string>
  url?: string
  required?: boolean
  startupTimeoutSec?: number
  toolTimeoutSec?: number
  enabledTools?: string[]
  disabledTools?: string[]
}

export interface McpDiscoveredTool {
  name: string
  description: string
  inputSchema: {
    type: "object"
    properties: Record<string, unknown>
    required?: string[]
  }
}

export interface McpToolCallResult {
  output: string
  details: unknown
  isError: boolean
}

export type McpAgentCallContext = AgentCapabilityCallContext

export interface McpToolCallPayload extends Record<string, unknown> {
  name: string
  arguments: Record<string, unknown>
  _meta?: {
    knowbee: {
      agent_id: string
      session_id: string
      binding_id?: string
      client_session_id?: string
      permission_profile: {
        profile_id: string
        risk_ceiling: string
        approval_required_from: string
        allow_external_network: boolean
        allow_filesystem_write: boolean
        allow_shell_execution: boolean
        allow_screen_control: boolean
      }
      secret_scope: string
      audit_id: string
      run_id?: string
      request_group_id?: string
      capability_delegation_id?: string
    }
  }
}

interface JsonRpcSuccess {
  jsonrpc?: string
  id?: number | string
  result?: unknown
}

interface JsonRpcError {
  jsonrpc?: string
  id?: number | string
  error?: {
    code?: number
    message?: string
    data?: unknown
  }
}

type JsonRpcMessage = JsonRpcSuccess | JsonRpcError | Record<string, unknown>

type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

function toObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []
}

function normalizeInputSchema(value: unknown): McpDiscoveredTool["inputSchema"] {
  const raw = toObject(value)
  const properties = toObject(raw.properties)
  const required = toStringArray(raw.required)
  return {
    type: "object",
    properties,
    ...(required.length > 0 ? { required } : {}),
  }
}

function validateInitializeResponse(value: unknown): void {
  const response = toObject(value)
  const serverInfo = toObject(response.serverInfo)
  if (
    typeof response.protocolVersion !== "string" ||
    !response.protocolVersion.trim() ||
    !response.capabilities ||
    typeof response.capabilities !== "object" ||
    Array.isArray(response.capabilities) ||
    typeof serverInfo.name !== "string" ||
    !serverInfo.name.trim() ||
    typeof serverInfo.version !== "string" ||
    !serverInfo.version.trim()
  )
    throw new Error("External feature connection handshake is invalid.")
}

export function extractMcpToolOutput(payload: unknown): string {
  const raw = toObject(payload)
  const textParts = toArray(raw.content)
    .map((item) => {
      const row = toObject(item)
      if (row.type === "text" && typeof row.text === "string") return row.text
      if (row.type === "image" && typeof row.mimeType === "string") return `[image:${row.mimeType}]`
      if (row.type === "resource" && typeof row.uri === "string") return `[resource:${row.uri}]`
      return ""
    })
    .filter((value) => value.trim().length > 0)

  if (textParts.length > 0) {
    return textParts.join("\n").trim()
  }

  return JSON.stringify(payload, null, 2)
}

function isAbortSignal(value: unknown): value is AbortSignal {
  return Boolean(
    value &&
      typeof value === "object" &&
      "aborted" in value &&
      typeof (value as AbortSignal).addEventListener === "function",
  )
}

export function redactMcpLogText(value: string): string {
  return value
    .replace(/https?:\/\/[^\s"'`<>]+/giu, "[external-endpoint-redacted]")
    .replace(
      /((?:api[_-]?key|token|secret|password|credential|authorization)(?:["'\s:=]+))([^"'\s,}]+)/gi,
      `$1${MCP_LOG_SECRET_MASK}`,
    )
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, `Bearer ${MCP_LOG_SECRET_MASK}`)
    .replace(/\/(?:private\/)?var\/folders\/[^\s"'`<>]+/gi, MCP_LOG_PATH_MASK)
    .replace(/\/tmp\/[^\s"'`<>]+/gi, MCP_LOG_PATH_MASK)
    .replace(/\/Users\/[^\s"'`<>]+/gi, MCP_LOG_PATH_MASK)
    .replace(/[A-Z]:\\[^\s"'`<>]+/gi, MCP_LOG_PATH_MASK)
}

export function buildMcpToolCallPayload(
  name: string,
  args: Record<string, unknown>,
  context?: McpAgentCallContext,
): McpToolCallPayload {
  if (!context) {
    return { name, arguments: args }
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
  }
}

export class McpStdioClient {
  private readonly name: string
  private readonly config: McpServerConfig
  private readonly onExit: ((error: string) => void) | undefined
  private readonly baseEnv: NodeJS.ProcessEnv
  private readonly defaultCwd: string
  private process: ChildProcessWithoutNullStreams | null = null
  private stdoutBuffer = Buffer.alloc(0)
  private requestId = 0
  private initialized = false
  private pending = new Map<number, PendingRequest>()
  private closedByUser = false
  private lifecycleState: "created" | "starting" | "ready" | "closing" | "closed" | "failed" =
    "created"

  constructor(options: {
    name: string
    config: McpServerConfig
    onExit?: (error: string) => void
    baseEnv?: NodeJS.ProcessEnv
    defaultCwd: string
  }) {
    this.name = options.name
    this.config = options.config
    this.onExit = options.onExit
    this.baseEnv = { ...(options.baseEnv ?? MCP_BASE_ENV) }
    this.defaultCwd = options.defaultCwd
  }

  async initialize(): Promise<void> {
    if (this.initialized) return
    await this.ensureProcess()

    const initialized = await this.request(
      "initialize",
      {
        protocolVersion: DEFAULT_PROTOCOL_VERSION,
        clientInfo: {
          name: "knowbee",
          version: "0.1.0",
        },
        capabilities: {},
      },
      this.startupTimeoutMs(),
    )
    validateInitializeResponse(initialized)

    await this.notify("notifications/initialized", {})
    this.initialized = true
    this.lifecycleState = "ready"
  }

  async listTools(): Promise<McpDiscoveredTool[]> {
    await this.initialize()
    const response = toObject(await this.request("tools/list", {}, this.toolTimeoutMs()))
    return toArray(response.tools)
      .map((tool) => {
        const row = toObject(tool)
        if (typeof row.name !== "string" || !row.name.trim()) return null
        return {
          name: row.name.trim(),
          description: typeof row.description === "string" ? row.description.trim() : "",
          inputSchema: normalizeInputSchema(row.inputSchema),
        } satisfies McpDiscoveredTool
      })
      .filter((tool): tool is McpDiscoveredTool => tool !== null)
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
    contextOrSignal?: McpAgentCallContext | AbortSignal,
    signal?: AbortSignal,
  ): Promise<McpToolCallResult> {
    await this.initialize()
    const context = isAbortSignal(contextOrSignal) ? undefined : contextOrSignal
    const resolvedSignal = isAbortSignal(contextOrSignal) ? contextOrSignal : signal
    const response = await this.request(
      "tools/call",
      buildMcpToolCallPayload(name, args, context),
      this.toolTimeoutMs(),
      resolvedSignal,
    )
    const payload = toObject(response)
    return {
      output: extractMcpToolOutput(payload),
      details: payload,
      isError: Boolean(payload.isError),
    }
  }

  async close(): Promise<void> {
    this.closedByUser = true
    this.initialized = false
    this.lifecycleState = "closing"
    this.rejectAll(new Error(`External feature connection "${this.name}" was closed.`))

    const child = this.process
    this.process = null
    if (!child) {
      this.lifecycleState = "closed"
      return
    }

    child.stdout.removeAllListeners()
    child.stderr.removeAllListeners()
    child.removeAllListeners()

    if (!child.killed) {
      child.kill()
    }
    this.lifecycleState = "closed"
  }

  private async ensureProcess(): Promise<void> {
    if (this.process) return
    const command = this.config.command?.trim()
    if (!command) {
      throw new Error(`External feature connection "${this.name}" command is empty.`)
    }

    const child = spawn(command, this.config.args ?? [], {
      cwd: this.config.cwd || this.defaultCwd,
      env: {
        ...this.baseEnv,
        ...(this.config.env ?? {}),
      },
      stdio: ["pipe", "pipe", "pipe"],
    })
    this.lifecycleState = "starting"

    child.stdout.on("data", (chunk: Buffer) => {
      this.stdoutBuffer = Buffer.concat([this.stdoutBuffer, chunk])
      this.consumeFrames()
    })

    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8").trim()
      if (text) {
        log.fieldDebug("external_feature_process_stderr", {
          target: redactMcpLogText(this.name),
          error: redactMcpLogText(text),
        })
      }
    })

    child.stdin.on("error", (error) => {
      const message = mcpClientErrorMessage(error)
      const safeName = redactMcpLogText(this.name)
      this.transitionProcessToFailed(
        child,
        new Error(`External feature connection "${safeName}" input error: ${message}`),
      )
    })

    child.on("error", (error) => {
      const message = mcpClientErrorMessage(error)
      const safeName = redactMcpLogText(this.name)
      this.transitionProcessToFailed(
        child,
        new Error(`External feature connection "${safeName}" process error: ${message}`),
      )
    })

    child.on("exit", (code, signal) => {
      const safeName = redactMcpLogText(this.name)
      const message =
        code !== null
          ? `External feature connection "${safeName}" exited with code ${code}.`
          : `External feature connection "${safeName}" exited with signal ${signal ?? "unknown"}.`
      this.transitionProcessToFailed(child, new Error(message))
    })

    this.closedByUser = false
    this.process = child
    log.fieldDebug("external_feature_process_started", {
      target: redactMcpLogText(this.name),
    })
  }

  private consumeFrames(): void {
    while (true) {
      const headerEnd = this.stdoutBuffer.indexOf("\r\n\r\n")
      if (headerEnd === -1) return

      const header = this.stdoutBuffer.subarray(0, headerEnd).toString("utf8")
      const match = header.match(/Content-Length:\s*(\d+)/i)
      if (!match) {
        this.stdoutBuffer = this.stdoutBuffer.subarray(headerEnd + 4)
        continue
      }

      const bodyLength = Number(match[1])
      const totalLength = headerEnd + 4 + bodyLength
      if (this.stdoutBuffer.length < totalLength) return

      const body = this.stdoutBuffer.subarray(headerEnd + 4, totalLength).toString("utf8")
      this.stdoutBuffer = this.stdoutBuffer.subarray(totalLength)

      try {
        const message = JSON.parse(body) as JsonRpcMessage
        this.handleMessage(message)
      } catch (error) {
        log.fieldDebug("external_feature_message_parse_failed", {
          target: redactMcpLogText(this.name),
          error: mcpClientErrorMessage(error),
        })
      }
    }
  }

  private handleMessage(message: JsonRpcMessage): void {
    if (typeof message.id !== "number") return
    const pending = this.pending.get(message.id)
    if (!pending) return

    clearTimeout(pending.timeout)
    this.pending.delete(message.id)

    const maybeError = (message as JsonRpcError).error
    if (maybeError) {
      pending.reject(
        new Error(maybeError.message ?? `External feature request ${message.id} failed.`),
      )
      return
    }

    pending.resolve((message as JsonRpcSuccess).result)
  }

  private async notify(method: string, params: Record<string, unknown>): Promise<void> {
    await this.ensureProcess()
    const child = this.process
    if (!child)
      throw new Error(`External feature connection "${this.name}" process is not available.`)

    const payload = JSON.stringify({ jsonrpc: "2.0", method, params })
    await this.writeFrame(child, payload)
  }

  private async request(
    method: string,
    params: Record<string, unknown>,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<unknown> {
    await this.ensureProcess()
    const child = this.process
    if (!child)
      throw new Error(`External feature connection "${this.name}" process is not available.`)

    return new Promise((resolve, reject) => {
      const id = ++this.requestId
      const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params })
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`External feature ${this.name}:${method} timed out after ${timeoutMs}ms`))
      }, timeoutMs)

      this.pending.set(id, { resolve, reject, timeout })

      if (signal) {
        signal.addEventListener(
          "abort",
          () => {
            const pending = this.pending.get(id)
            if (!pending) return
            clearTimeout(pending.timeout)
            this.pending.delete(id)
            reject(new Error(`External feature ${this.name}:${method} was aborted.`))
          },
          { once: true },
        )
      }

      void this.writeFrame(child, payload).catch((error) => {
        const pending = this.pending.get(id)
        if (!pending) return
        clearTimeout(pending.timeout)
        this.pending.delete(id)
        pending.reject(error)
      })
    })
  }

  private writeFrame(child: ChildProcessWithoutNullStreams, payload: string): Promise<void> {
    if (
      this.process !== child ||
      (this.lifecycleState !== "starting" && this.lifecycleState !== "ready") ||
      !child.stdin.writable ||
      child.stdin.destroyed
    ) {
      return Promise.reject(
        new Error(`External feature connection "${this.name}" is not writable.`),
      )
    }

    const frame = `Content-Length: ${Buffer.byteLength(payload, "utf8")}\r\n\r\n${payload}`
    return new Promise((resolve, reject) => {
      try {
        child.stdin.write(frame, (error) => {
          if (error) {
            reject(
              new Error(
                `External feature connection "${this.name}" write failed: ${mcpClientErrorMessage(error)}`,
              ),
            )
            return
          }
          resolve()
        })
      } catch (error) {
        reject(
          new Error(
            `External feature connection "${this.name}" write failed: ${mcpClientErrorMessage(error)}`,
          ),
        )
      }
    })
  }

  private transitionProcessToFailed(child: ChildProcessWithoutNullStreams, error: Error): void {
    if (this.process !== child) return
    this.process = null
    this.initialized = false
    this.lifecycleState = "failed"
    this.rejectAll(error)
    if (!this.closedByUser) {
      this.onExit?.(error.message)
    }
  }

  private rejectAll(error: Error): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timeout)
      pending.reject(error)
      this.pending.delete(id)
    }
  }

  private startupTimeoutMs(): number {
    return Math.max(1, this.config.startupTimeoutSec ?? 10) * 1000
  }

  private toolTimeoutMs(): number {
    return Math.max(1, this.config.toolTimeoutSec ?? 30) * 1000
  }
}
