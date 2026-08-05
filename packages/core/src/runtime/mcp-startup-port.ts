import type { KnowbeeConfig } from "../config/types.js"
import {
  mcpRegistry,
  type McpPrepareResult,
  type McpServerStatus,
} from "../mcp/registry.js"

export interface McpStartupPort {
  prepare(
    config: KnowbeeConfig,
    baseEnv?: Readonly<Record<string, string | undefined>>,
  ): McpPrepareResult
  connectConfigured(): Promise<McpServerStatus[]>
  cancel(): Promise<void>
  close(): Promise<void>
}

export interface McpStartupRegistryAdapter {
  prepareFromConfig(
    config: KnowbeeConfig,
    baseEnv?: NodeJS.ProcessEnv,
  ): McpPrepareResult
  connectConfigured(): Promise<McpServerStatus[]>
  closeAll(): Promise<void>
}

export function createMcpStartupPort(
  registry: McpStartupRegistryAdapter = mcpRegistry,
): McpStartupPort {
  return Object.freeze({
    prepare(
      config: KnowbeeConfig,
      baseEnv?: Readonly<Record<string, string | undefined>>,
    ) {
      return registry.prepareFromConfig(
        config,
        baseEnv ? { ...baseEnv } : undefined,
      )
    },
    connectConfigured() {
      return registry.connectConfigured()
    },
    cancel() {
      return registry.closeAll()
    },
    close() {
      return registry.closeAll()
    },
  })
}

export type McpBackgroundConnectionResult =
  | { readonly status: "completed"; readonly statuses: McpServerStatus[] }
  | { readonly status: "failed"; readonly reasonCode: "mcp_connection_failed" }

export interface McpBackgroundConnection {
  readonly status: "started"
  readonly completion: Promise<McpBackgroundConnectionResult>
}

export function startMcpConnectionsInBackground(
  port: McpStartupPort,
): McpBackgroundConnection {
  const completion = Promise.resolve()
    .then(() => port.connectConfigured())
    .then(
      (statuses): McpBackgroundConnectionResult => ({
        status: "completed",
        statuses,
      }),
      (): McpBackgroundConnectionResult => ({
        status: "failed",
        reasonCode: "mcp_connection_failed",
      }),
    )
  return Object.freeze({ status: "started", completion })
}
