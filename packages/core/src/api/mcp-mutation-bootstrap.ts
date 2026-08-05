import { randomUUID } from "node:crypto"
import { probeMcpConnectionDraft } from "../capabilities/mcp-connection-probe.js"
import {
  type McpCatalogAdapterRow,
  createMcpConfigurationStore,
  createMcpRegistryApplyAdapter,
} from "../capabilities/mcp-mutation-adapters.js"
import {
  type McpMutationRuntime,
  createMcpMutationRuntime,
} from "../capabilities/mcp-mutation-runtime.js"
import { createMcpPublicRef } from "../capabilities/mcp-public-reference.js"
import { inspectMcpWorkingDirectory } from "../capabilities/mcp-working-directory.js"
import type { RuntimePaths } from "../config/paths.js"
import { NODE_PERSISTED_FILE_SYSTEM } from "../config/persisted-file.js"
import type { KnowbeeConfig } from "../config/types.js"
import { testMcpServerConnection } from "../control-plane/setup-extensions.js"
import {
  getCapabilityMutationReceiptByNonce,
  listAgentCapabilityBindings,
  listAgentConfigs,
  listMcpServerCatalogEntries,
  reserveCapabilityMutationReceipt,
  updateCapabilityMutationReceipt,
  upsertMcpServerCatalogEntry,
} from "../db/index.js"
import { mcpRegistry } from "../mcp/registry.js"

function parseObject(value: string | null): Record<string, unknown> {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

function parseStrings(value: string): string[] {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : []
  } catch {
    return []
  }
}

function catalogRows(): McpCatalogAdapterRow[] {
  return listMcpServerCatalogEntries({ includeArchived: true }).map((row) => ({
    internalMcpId: row.mcp_server_id,
    status: row.status,
    displayName: row.display_name,
    risk: row.risk,
    toolNames: parseStrings(row.tool_names_json),
    metadata: parseObject(row.metadata_json),
    source: row.source,
    auditId: row.audit_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
}

export function createApiMcpMutationRuntime(input: {
  config: KnowbeeConfig
  paths: RuntimePaths
  mcpProcessEnv: Readonly<Record<string, string | undefined>>
  now?: () => number
}): McpMutationRuntime {
  const now = input.now ?? Date.now
  const catalog = {
    list: (_includeArchived: boolean) => catalogRows(),
    write: (row: McpCatalogAdapterRow) =>
      upsertMcpServerCatalogEntry(
        {
          mcpServerId: row.internalMcpId,
          displayName: row.displayName,
          status: row.status,
          risk: row.risk,
          toolNames: [...row.toolNames],
          metadata: { ...row.metadata },
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        },
        { source: row.source, auditId: row.auditId, now: row.updatedAt },
      ),
  }
  const store = createMcpConfigurationStore({
    paths: input.paths,
    initialConfig: input.config,
    fileSystem: NODE_PERSISTED_FILE_SYSTEM,
    catalog,
    externalRevision: () =>
      Math.max(
        0,
        ...listAgentCapabilityBindings({ capabilityKind: "mcp_server" }).map(
          (binding) => binding.updated_at,
        ),
      ),
  })
  const runtime = createMcpRegistryApplyAdapter({
    initialConfig: input.config,
    initialRevision: store.currentRevision(),
    baseEnv: input.mcpProcessEnv,
    registry: {
      reload: (config, baseEnv) => mcpRegistry.reloadFromConfig(config, { ...baseEnv }),
      statuses: () => mcpRegistry.getStatuses(),
      reloadTarget: ({ name, config, defaultCwd, baseEnv }) =>
        mcpRegistry.reloadServer(name, config, { defaultCwd, baseEnv: { ...baseEnv } }),
    },
  })
  return createMcpMutationRuntime({
    store,
    runtime,
    inspection: {
      inspect: async (draft, signal) => {
        const directory = inspectMcpWorkingDirectory({
          draft,
          defaultWorkspace: input.config.profile.workspace,
          allowedRoots: input.config.security.allowedPaths,
        })
        if (!directory.ok) return directory
        const receipt = await probeMcpConnectionDraft(
          directory.draft,
          {
            now,
            probe: async (normalized) => {
              const result = await testMcpServerConnection(
                {
                  id: "mcp-mutation-probe",
                  name: normalized.displayName,
                  transport: normalized.transport,
                  command: normalized.command,
                  argsText: normalized.args.join("\n"),
                  cwd: normalized.cwd,
                  url: normalized.url ?? "",
                  required: normalized.required,
                  enabled: true,
                  status: "planned",
                  tools: [],
                },
                input.config.profile.workspace,
                { baseEnv: input.mcpProcessEnv, signal },
              )
              return {
                ok: result.ok,
                ...(result.ok ? {} : { reasonCode: "mcp_connection_probe_failed" }),
                tools: result.tools.map((name) => ({ name, description: "" })),
              }
            },
          },
          signal,
        )
        return receipt.ready
          ? { ok: true, draft: directory.draft }
          : { ok: false, reasonCode: receipt.reasonCode ?? "mcp_connection_probe_failed" }
      },
    },
    receipts: {
      now,
      currentRevision: store.currentRevision,
      nonceUsed: (nonce) => Boolean(getCapabilityMutationReceiptByNonce(nonce)),
      reserveReceipt: ({ envelope, state, now: reservedAt }) =>
        reserveCapabilityMutationReceipt({
          mutationId: envelope.mutationId,
          nonce: envelope.nonce,
          actorRef: envelope.actorRef,
          scope: envelope.scope,
          purpose: envelope.purpose,
          capabilityKind: "mcp_server",
          targetRevision: envelope.targetRevision,
          state,
          now: reservedAt,
        }),
      updateReceipt: (receipt) => {
        updateCapabilityMutationReceipt(receipt)
      },
    },
    createInternalMcpId: () => `mcp:${randomUUID()}`,
    publicRefForMcpId: createMcpPublicRef,
    boundAgentNames: (internalMcpId) => {
      const ids = new Set(
        listAgentCapabilityBindings({ capabilityKind: "mcp_server", enabledOnly: true })
          .filter((binding) => binding.catalog_id === internalMcpId)
          .map((binding) => binding.agent_id),
      )
      return listAgentConfigs({ enabledOnly: true })
        .filter((agent) => ids.has(agent.agent_id))
        .map((agent) => agent.agent_name)
    },
  })
}
