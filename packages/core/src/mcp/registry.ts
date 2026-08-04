import type { KnowbeeConfig } from "../config/types.js"
import type { McpComponentState } from "../contracts/mcp-component-state.js"
import type { CapabilityPolicy, SkillMcpAllowlist } from "../contracts/sub-agent-orchestration.js"
import { createLogger } from "../logger/index.js"
import { sanitizeUserFacingError } from "../runs/error-sanitizer.js"
import {
  type AgentCapabilityCallContext,
  isMcpServerAllowed,
  isToolAllowedBySkillMcpAllowlist,
  parseMcpRegisteredToolName,
  toAgentCapabilityCallContext,
} from "../security/capability-isolation.js"
import {
  recordExtensionFailure,
  recordExtensionRegistryChange,
  recordExtensionToolFailure,
} from "../security/extension-governance.js"
import { type AgentTool, toolDispatcher } from "../tools/index.js"
import type { ToolResult } from "../tools/types.js"
import {
  type McpDiscoveredTool,
  type McpServerConfig,
  McpStdioClient,
  type McpTransport,
  redactMcpLogText,
} from "./client.js"
import { McpHttpClient } from "./http-client.js"

const log = createLogger("mcp:registry")

function mcpRegistryErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return redactMcpLogText(raw)
}

function mcpRegistryStatusErrorMessage(error: unknown): string {
  return sanitizeUserFacingError(mcpRegistryErrorMessage(error)).userMessage
}

export interface McpToolStatus {
  name: string
  registeredName: string
  description: string
}

export interface McpServerStatus {
  name: string
  transport: McpTransport
  enabled: boolean
  required: boolean
  connectionState: McpComponentState
  ready: boolean
  toolCount: number
  registeredToolCount: number
  command?: string
  url?: string
  error?: string
  agentSessionCount?: number
  tools: McpToolStatus[]
}

export interface McpSummary {
  serverCount: number
  readyCount: number
  toolCount: number
  requiredFailures: number
}

export type McpPrepareResult =
  | { readonly status: "prepared"; readonly statuses: McpServerStatus[] }
  | { readonly status: "rejected"; readonly reasonCode: "registry_not_empty" }

export function filterMcpStatusesForAgentAllowlist(
  statuses: McpServerStatus[],
  input: SkillMcpAllowlist | CapabilityPolicy,
): McpServerStatus[] {
  const allowlist = "skillMcpAllowlist" in input ? input.skillMcpAllowlist : input
  return statuses
    .filter(
      (status) =>
        isMcpServerAllowed({ serverId: sanitizeSegment(status.name), allowlist }) ||
        isMcpServerAllowed({ serverId: status.name, allowlist }),
    )
    .map((status) => {
      const tools = status.tools.filter((tool) => {
        const mcpTool = parseMcpRegisteredToolName(tool.registeredName)
        return isToolAllowedBySkillMcpAllowlist({
          toolName: tool.registeredName,
          allowlist,
          mcpTool,
        })
      })
      return {
        ...status,
        registeredToolCount: tools.length,
        toolCount: tools.length,
        tools,
      }
    })
}

type McpRuntimeClient = McpStdioClient | McpHttpClient

interface RegistryEntry {
  revision: number
  client: McpRuntimeClient | null
  config: McpServerConfig
  agentClients: Map<string, McpRuntimeClient>
  agentClientInitializations: Map<string, Promise<McpRuntimeClient>>
  toolNames: string[]
  status: McpServerStatus
}

function sanitizeSegment(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "tool"
  )
}

export function toRegisteredToolName(serverName: string, toolName: string): string {
  return `mcp__${sanitizeSegment(serverName)}__${sanitizeSegment(toolName)}`
}

function filterTools(tools: McpDiscoveredTool[], config: McpServerConfig): McpDiscoveredTool[] {
  const enabledTools = new Set(
    (config.enabledTools ?? []).map((item) => item.trim()).filter(Boolean),
  )
  const disabledTools = new Set(
    (config.disabledTools ?? []).map((item) => item.trim()).filter(Boolean),
  )

  return tools.filter((tool) => {
    if (enabledTools.size > 0 && !enabledTools.has(tool.name)) return false
    if (disabledTools.has(tool.name)) return false
    return true
  })
}

class McpRegistry {
  private readonly entries = new Map<string, RegistryEntry>()
  private nextEntryRevision = 0
  private defaultCwd = ""
  private baseEnv: NodeJS.ProcessEnv | undefined

  private createEntry(name: string, config: McpServerConfig): RegistryEntry {
    const enabled = config.enabled !== false
    const transport = config.transport ?? (config.url ? "http" : "stdio")
    const commandMissing = transport === "stdio" && !config.command?.trim()
    const connectionState: McpComponentState = !enabled
      ? "cancelled"
      : commandMissing
        ? "failed"
        : "pending"
    return {
      revision: ++this.nextEntryRevision,
      client: null,
      config,
      agentClients: new Map(),
      agentClientInitializations: new Map(),
      toolNames: [],
      status: {
        name,
        transport,
        enabled,
        required: Boolean(config.required),
        connectionState,
        ready: false,
        toolCount: 0,
        registeredToolCount: 0,
        ...(config.command?.trim() ? { command: config.command.trim() } : {}),
        ...(config.url?.trim() ? { url: config.url.trim() } : {}),
        ...(!enabled
          ? { error: "설정에서 비활성화된 외부 기능 연결입니다." }
          : commandMissing
            ? { error: "실행 명령이 설정되지 않아 외부 기능 연결을 시작할 수 없습니다." }
            : {}),
        tools: [],
      },
    }
  }

  prepareFromConfig(
    config: KnowbeeConfig,
    baseEnv?: NodeJS.ProcessEnv,
  ): McpPrepareResult {
    if (this.entries.size > 0) {
      return { status: "rejected", reasonCode: "registry_not_empty" }
    }
    this.defaultCwd = config.profile.workspace
    this.baseEnv = baseEnv ? { ...baseEnv } : undefined
    for (const [name, serverConfig] of Object.entries(config.mcp?.servers ?? {})) {
      this.entries.set(name, this.createEntry(name, serverConfig))
    }
    return { status: "prepared", statuses: this.getStatuses() }
  }

  async loadFromConfig(config: KnowbeeConfig, baseEnv?: NodeJS.ProcessEnv): Promise<void> {
    await this.closeAll()
    const prepared = this.prepareFromConfig(config, baseEnv)
    if (prepared.status === "rejected") throw new Error(prepared.reasonCode)
    await this.connectConfigured()
  }

  async connectConfigured(): Promise<McpServerStatus[]> {
    const pendingNames = [...this.entries.entries()]
      .filter(([, entry]) => entry.status.connectionState === "pending")
      .map(([name]) => name)
      .sort()
    for (const name of pendingNames) {
      const entry = this.entries.get(name)
      if (!entry || entry.status.connectionState !== "pending") continue
      entry.status = { ...entry.status, connectionState: "connecting" }
      await this.loadServer(name, entry.config)
    }
    return this.getStatuses()
  }

  async reloadFromConfig(
    config: KnowbeeConfig,
    baseEnv?: NodeJS.ProcessEnv,
  ): Promise<McpServerStatus[]> {
    await this.loadFromConfig(config, baseEnv)
    return this.getStatuses()
  }

  async reloadServer(
    name: string,
    config: McpServerConfig,
    options: { defaultCwd: string; baseEnv?: NodeJS.ProcessEnv },
  ): Promise<McpServerStatus> {
    await this.closeServer(name)
    this.defaultCwd = options.defaultCwd
    this.baseEnv = options.baseEnv ? { ...options.baseEnv } : undefined
    await this.loadServer(name, config)
    const status = this.getStatuses().find((entry) => entry.name === name)
    if (!status) throw new Error("mcp_target_reload_missing")
    return status
  }

  getStatuses(): McpServerStatus[] {
    return [...this.entries.values()]
      .map((entry) => ({
        ...entry.status,
        agentSessionCount: entry.agentClients.size,
        tools: entry.status.tools.map((tool) => ({ ...tool })),
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  getAgentScopedStatuses(input: SkillMcpAllowlist | CapabilityPolicy): McpServerStatus[] {
    return filterMcpStatusesForAgentAllowlist(this.getStatuses(), input)
  }

  getSummary(): McpSummary {
    const statuses = this.getStatuses()
    return {
      serverCount: statuses.length,
      readyCount: statuses.filter((entry) => entry.ready).length,
      toolCount: statuses.reduce((sum, entry) => sum + entry.registeredToolCount, 0),
      requiredFailures: statuses.filter((entry) => entry.required && !entry.ready).length,
    }
  }

  async closeAll(): Promise<void> {
    for (const name of [...this.entries.keys()]) await this.closeServer(name)
  }

  private async closeServer(name: string): Promise<void> {
    const entry = this.entries.get(name)
    if (!entry) return
    this.entries.delete(name)
    this.unregisterTools(entry.toolNames)
    entry.toolNames = []
    const clients = [...entry.agentClients.values(), ...(entry.client ? [entry.client] : [])]
    entry.agentClients.clear()
    entry.agentClientInitializations.clear()
    const closed = await Promise.allSettled(clients.map((client) => client.close()))
    log.fieldDebug("external_feature_connection_closed", {
      revision: entry.revision,
      clientCount: clients.length,
      closeFailureCount: closed.filter((result) => result.status === "rejected").length,
    })
  }

  private async loadServer(name: string, config: McpServerConfig): Promise<void> {
    const existing = this.entries.get(name)
    const entry =
      existing?.config === config ? existing : this.createEntry(name, config)
    if (this.entries.get(name) !== entry) this.entries.set(name, entry)
    const isCurrent = () => this.entries.get(name) === entry
    const transport = entry.status.transport
    if (!entry.status.enabled || entry.status.connectionState === "failed") return
    entry.status = { ...entry.status, connectionState: "connecting" }

    const onExit = (error: string) => {
      if (!isCurrent()) return
      const safeError = mcpRegistryErrorMessage(error)
      const statusError = mcpRegistryStatusErrorMessage(error)
      this.unregisterTools(entry.toolNames)
      entry.toolNames = []
      recordExtensionFailure({
        extensionId: `mcp:${name}`,
        kind: "mcp_server",
        error: safeError,
        detail: { transport, required: Boolean(config.required) },
      })
      entry.status = {
        ...entry.status,
        connectionState: "degraded",
        ready: false,
        registeredToolCount: 0,
        error: statusError,
      }
    }
    const client: McpRuntimeClient =
      transport === "http"
        ? new McpHttpClient({ config, onExit })
        : new McpStdioClient({
            name,
            config,
            defaultCwd: this.defaultCwd,
            ...(this.baseEnv ? { baseEnv: this.baseEnv } : {}),
            onExit,
          })
    entry.client = client

    try {
      await client.initialize()
      if (!isCurrent()) {
        await client.close()
        return
      }
      const discovered = filterTools(await client.listTools(), config)
      if (!isCurrent()) {
        await client.close()
        return
      }
      const tools = this.registerTools(name, discovered)
      entry.toolNames = tools.map((tool) => tool.registeredName)
      entry.status = {
        ...entry.status,
        connectionState: "ready",
        ready: true,
        toolCount: discovered.length,
        registeredToolCount: tools.length,
        tools,
      }
      recordExtensionRegistryChange({
        action: "mcp_server_loaded",
        extensionId: `mcp:${name}`,
        result: "success",
        detail: { toolCount: tools.length, transport },
      })
      log.fieldDebug("external_feature_connection_ready", {
        revision: entry.revision,
        transport,
        toolCount: tools.length,
      })
    } catch (error) {
      const message = mcpRegistryErrorMessage(error)
      const statusError = mcpRegistryStatusErrorMessage(error)
      if (!isCurrent()) {
        await client.close()
        return
      }
      recordExtensionFailure({
        extensionId: `mcp:${name}`,
        kind: "mcp_server",
        error: message,
        detail: { transport, required: Boolean(config.required) },
      })
      this.unregisterTools(entry.toolNames)
      entry.toolNames = []
      entry.status = {
        ...entry.status,
        connectionState: "failed",
        ready: false,
        toolCount: 0,
        registeredToolCount: 0,
        tools: [],
        error: statusError,
      }
      await client.close()
      log.product("external_feature_connection_failed", {
        reasonCode: "mcp_connection_failed",
        required: Boolean(config.required),
      })
      log.fieldDebug("external_feature_connection_failure_detail", {
        revision: entry.revision,
        transport,
        target: redactMcpLogText(name),
        error: message,
      })
    }
  }

  private registerTools(name: string, tools: McpDiscoveredTool[]): McpToolStatus[] {
    const registered: McpToolStatus[] = []

    for (const tool of tools) {
      const registeredName = toRegisteredToolName(name, tool.name)
      const bridge: AgentTool<Record<string, unknown>> = {
        name: registeredName,
        evidenceSourceKind: "mcp",
        description: tool.description
          ? `[MCP:${name}] ${tool.description}`
          : `[MCP:${name}] ${tool.name}`,
        parameters: tool.inputSchema,
        riskLevel: "moderate",
        requiresApproval: false,
        execute: async (params, ctx): Promise<ToolResult> => {
          try {
            const agentContext = toAgentCapabilityCallContext(ctx)
            if (!agentContext) {
              return {
                success: false,
                output:
                  "External tool error: agent-scoped external feature call context is required.",
                error: "agent_mcp_context_required",
                details: {
                  kind: "mcp_context_required",
                  serverName: name,
                  toolName: tool.name,
                },
              }
            }
            const result = await this.callAgentScopedTool({
              serverName: name,
              registeredName,
              toolName: tool.name,
              params,
              agentContext,
              signal: ctx.signal,
            })
            if (result.isError) {
              const errorOutput = redactMcpLogText(result.output)
              recordExtensionToolFailure({
                toolName: registeredName,
                error: errorOutput,
                runId: ctx.runId,
                requestGroupId: ctx.requestGroupId ?? null,
                detail: {
                  serverName: name,
                  toolName: tool.name,
                  isError: true,
                  agentId: ctx.agentId ?? null,
                },
              })
              return {
                success: false,
                output: errorOutput,
                details: result.details,
                error: errorOutput,
              }
            }
            return {
              success: true,
              output: result.output,
              details: result.details,
            }
          } catch (error) {
            const message = mcpRegistryErrorMessage(error)
            const sanitized = sanitizeUserFacingError(message)
            recordExtensionToolFailure({
              toolName: registeredName,
              error: message,
              runId: ctx.runId,
              requestGroupId: ctx.requestGroupId ?? null,
              detail: { serverName: name, toolName: tool.name },
            })
            return {
              success: false,
              output: `External tool error: ${sanitized.userMessage}`,
              error: sanitized.userMessage,
            }
          }
        },
      }

      toolDispatcher.register(bridge)
      registered.push({
        name: tool.name,
        registeredName,
        description: tool.description,
      })
    }

    return registered
  }

  private agentSessionKey(input: {
    serverName: string
    registeredName: string
    context: AgentCapabilityCallContext
  }): string {
    return [
      `server:${input.serverName}`,
      `agent:${input.context.agentId}`,
      `binding:${input.context.bindingId ?? input.registeredName}`,
      `secret:${input.context.secretScopeId}`,
    ].join("|")
  }

  private async getAgentClient(input: {
    serverName: string
    registeredName: string
    context: AgentCapabilityCallContext
  }): Promise<{ key: string; client: McpRuntimeClient }> {
    const entry = this.entries.get(input.serverName)
    if (!entry?.client) {
      throw new Error(`External feature connection "${input.serverName}" is not ready.`)
    }
    const key = this.agentSessionKey(input)
    const initializing = entry.agentClientInitializations.get(key)
    if (initializing) return { key, client: await initializing }
    const existing = entry.agentClients.get(key)
    if (existing) return { key, client: existing }

    let client: McpRuntimeClient
    const onExit = (error: string) => {
      if (
        this.entries.get(input.serverName) !== entry ||
        entry.agentClients.get(key) !== client
      )
        return
      entry.agentClients.delete(key)
      const safeError = mcpRegistryErrorMessage(error)
      recordExtensionToolFailure({
        toolName: input.registeredName,
        error: safeError,
        ...(input.context.runId ? { runId: input.context.runId } : {}),
        requestGroupId: input.context.requestGroupId ?? null,
        detail: {
          serverName: input.serverName,
          agentId: input.context.agentId,
          bindingId: input.context.bindingId ?? null,
          agentSessionKey: key,
        },
      })
    }
    const transport = entry.config.transport ?? (entry.config.url ? "http" : "stdio")
    client =
      transport === "http"
        ? new McpHttpClient({ config: entry.config, onExit })
        : new McpStdioClient({
            name: `${input.serverName}:${input.context.agentId}`,
            config: entry.config,
            defaultCwd: this.defaultCwd,
            ...(this.baseEnv ? { baseEnv: this.baseEnv } : {}),
            onExit,
          })
    entry.agentClients.set(key, client)
    let initialization!: Promise<McpRuntimeClient>
    initialization = (async () => {
      try {
        await client.initialize()
        if (
          this.entries.get(input.serverName) !== entry ||
          entry.agentClients.get(key) !== client
        ) {
          await client.close()
          throw new Error("agent_mcp_session_cancelled")
        }
        entry.status = { ...entry.status, agentSessionCount: entry.agentClients.size }
        return client
      } catch (error) {
        if (entry.agentClients.get(key) === client) entry.agentClients.delete(key)
        await client.close()
        throw error
      } finally {
        if (entry.agentClientInitializations.get(key) === initialization) {
          entry.agentClientInitializations.delete(key)
        }
      }
    })()
    entry.agentClientInitializations.set(key, initialization)
    return { key, client: await initialization }
  }

  private async callAgentScopedTool(input: {
    serverName: string
    registeredName: string
    toolName: string
    params: Record<string, unknown>
    agentContext: AgentCapabilityCallContext
    signal: AbortSignal
  }) {
    const session = await this.getAgentClient({
      serverName: input.serverName,
      registeredName: input.registeredName,
      context: input.agentContext,
    })
    return session.client.callTool(
      input.toolName,
      input.params,
      { ...input.agentContext, clientSessionId: session.key },
      input.signal,
    )
  }

  getAgentSessionSnapshot(): Array<{
    serverName: string
    sessionKey: string
    agentId: string
    bindingId?: string
    secretScopeId: string
  }> {
    const rows: Array<{
      serverName: string
      sessionKey: string
      agentId: string
      bindingId?: string
      secretScopeId: string
    }> = []
    for (const [serverName, entry] of this.entries) {
      for (const sessionKey of entry.agentClients.keys()) {
        const parts = Object.fromEntries(
          sessionKey.split("|").map((part) => {
            const index = part.indexOf(":")
            return index >= 0 ? [part.slice(0, index), part.slice(index + 1)] : [part, ""]
          }),
        )
        rows.push({
          serverName,
          sessionKey,
          agentId: parts.agent ?? "",
          ...(parts.binding ? { bindingId: parts.binding } : {}),
          secretScopeId: parts.secret ?? "",
        })
      }
    }
    return rows.sort((a, b) => a.sessionKey.localeCompare(b.sessionKey))
  }

  private unregisterTools(toolNames: string[]): void {
    for (const toolName of toolNames) {
      toolDispatcher.unregister(toolName)
    }
  }
}

export const mcpRegistry = new McpRegistry()
