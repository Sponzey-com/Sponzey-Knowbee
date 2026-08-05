import JSON5 from "json5"
import type { PersistedConfigFileSystem, PersistedConfigPaths } from "../config/persisted-file.js"
import { writePersistedRawConfig } from "../config/persisted-file.js"
import type { KnowbeeConfig, McpConfig, McpServerConfig } from "../config/types.js"
import type { CapabilityRiskLevel } from "../contracts/sub-agent-orchestration.js"
import type { McpConnectionDraft } from "./mcp-connection-validation.js"
import type { McpLifecycleAction } from "./mcp-lifecycle-command.js"
import type {
  McpConfigurationRollbackSnapshot,
  McpConfigurationStorePort,
  McpPersistedEntry,
  McpRuntimeApplyPort,
  McpRuntimeRollbackSnapshot,
} from "./mcp-mutation-runtime.js"

export interface McpCatalogAdapterRow {
  internalMcpId: string
  status: "enabled" | "disabled" | "archived"
  displayName: string
  risk: CapabilityRiskLevel
  toolNames: readonly string[]
  metadata: Readonly<Record<string, unknown>>
  source: "manual" | "import" | "system"
  auditId: string | null
  createdAt: number
  updatedAt: number
}

export interface McpCatalogPersistencePort {
  list(includeArchived: boolean): readonly McpCatalogAdapterRow[]
  write(row: McpCatalogAdapterRow): void
}

interface StoreRollbackToken {
  readonly fileExisted: boolean
  readonly raw: Readonly<Record<string, unknown>>
  readonly targetId: string
  readonly previousCatalog: McpCatalogAdapterRow | null
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function canonicalServerKey(internalMcpId: string): string {
  const key = internalMcpId.trim().replace(/^mcp:/u, "")
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(key)) throw new Error("mcp_internal_id_invalid")
  return key
}

function canonicalCatalogKey(internalMcpId: string): string {
  return internalMcpId.trim().replace(/^mcp:/u, "")
}

function serverConfigFromDraft(draft: McpConnectionDraft): McpServerConfig {
  const base: McpServerConfig = {
    enabled: true,
    transport: draft.transport,
    required: draft.required,
  }
  if (draft.transport === "http") {
    if (!draft.url) throw new Error("mcp_url_missing")
    return { ...base, url: draft.url }
  }
  return {
    ...base,
    command: draft.command,
    args: [...draft.args],
    ...(draft.cwd ? { cwd: draft.cwd } : {}),
  }
}

function draftFromConfig(displayName: string, config: McpServerConfig): McpConnectionDraft {
  const transport = config.transport ?? (config.url ? "http" : "stdio")
  return Object.freeze({
    displayName,
    transport,
    command: config.command?.trim() ?? "",
    args: Object.freeze([...(config.args ?? [])]),
    cwd: config.cwd?.trim() ?? "",
    ...(transport === "http" ? { url: config.url?.trim() ?? "" } : {}),
    required: Boolean(config.required),
  })
}

function cloneRecord<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function createMcpConfigurationStore(input: {
  paths: PersistedConfigPaths
  initialConfig: Pick<KnowbeeConfig, "mcp">
  fileSystem: PersistedConfigFileSystem
  catalog: McpCatalogPersistencePort
  externalRevision?: () => number
}): McpConfigurationStorePort {
  const readRaw = () => {
    if (!input.fileSystem.exists(input.paths.configFile)) return {}
    const parsed = JSON5.parse(input.fileSystem.readText(input.paths.configFile))
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error("mcp_persisted_config_invalid")
    return parsed as Record<string, unknown>
  }
  const catalogRows = () => input.catalog.list(true)
  const mcpObject = (raw: Record<string, unknown>) => object(raw.mcp)
  const persistedServers = (raw: Record<string, unknown>): Record<string, McpServerConfig> => {
    const rawServers = object(mcpObject(raw).servers)
    if (Object.keys(rawServers).length > 0)
      return cloneRecord(rawServers) as Record<string, McpServerConfig>
    return cloneRecord(input.initialConfig.mcp?.servers ?? {})
  }
  const revisionFor = (raw: Record<string, unknown>) => {
    const rawRevision = mcpObject(raw).revision
    const persistedRevision =
      typeof rawRevision === "number" && Number.isSafeInteger(rawRevision) && rawRevision >= 0
        ? rawRevision
        : 0
    return Math.max(
      persistedRevision,
      ...catalogRows().map((row) => row.updatedAt),
      input.externalRevision?.() ?? 0,
      0,
    )
  }
  const listEntries = (): readonly McpPersistedEntry[] => {
    const rowsByKey = new Map(
      catalogRows()
        .filter((row) => row.status !== "archived")
        .map((row) => [canonicalCatalogKey(row.internalMcpId), row]),
    )
    return Object.entries(persistedServers(readRaw())).map(([serverKey, config]) => {
      const row = rowsByKey.get(serverKey)
      return Object.freeze({
        internalMcpId: row?.internalMcpId ?? `mcp:${serverKey}`,
        draft: draftFromConfig(row?.displayName ?? serverKey, config),
        status: row?.status === "disabled" || config.enabled === false ? "disabled" : "enabled",
      })
    })
  }

  return Object.freeze({
    currentRevision: () => revisionFor(readRaw()),
    listEntries,
    listKnownIdentities: () => {
      const identities = new Map<string, { internalMcpId: string; displayName: string }>()
      for (const row of catalogRows().filter((item) => item.status !== "archived"))
        identities.set(row.internalMcpId, {
          internalMcpId: row.internalMcpId,
          displayName: row.displayName,
        })
      for (const entry of listEntries())
        if (!identities.has(entry.internalMcpId))
          identities.set(entry.internalMcpId, {
            internalMcpId: entry.internalMcpId,
            displayName: entry.draft.displayName,
          })
      return [...identities.values()]
    },
    runtimeConfigurationSnapshot: () =>
      Object.freeze({ servers: Object.freeze(persistedServers(readRaw())) }),
    persist: ({
      mode,
      internalMcpId,
      draft,
      expectedRevision,
      targetRevision,
    }: {
      mode: "create" | "update"
      internalMcpId: string
      draft: McpConnectionDraft
      expectedRevision: number
      targetRevision: number
    }) => {
      const raw = readRaw()
      const actualRevision = revisionFor(raw)
      if (actualRevision !== expectedRevision)
        return { ok: false, revision: actualRevision, reasonCode: "capability_revision_conflict" }
      const serverKey = canonicalServerKey(internalMcpId)
      const servers = persistedServers(raw)
      if (mode === "create" && serverKey in servers)
        return { ok: false, revision: actualRevision, reasonCode: "mcp_server_key_conflict" }
      if (mode === "update" && !(serverKey in servers))
        return { ok: false, revision: actualRevision, reasonCode: "mcp_ref_not_found" }
      const previousCatalog =
        catalogRows().find((row) => row.internalMcpId === internalMcpId) ?? null
      const rollbackSnapshot: McpConfigurationRollbackSnapshot = Object.freeze({
        revision: actualRevision,
        entries: Object.freeze([...listEntries()]),
        token: Object.freeze({
          fileExisted: input.fileSystem.exists(input.paths.configFile),
          raw: cloneRecord(raw),
          targetId: internalMcpId,
          previousCatalog,
        } satisfies StoreRollbackToken),
      })
      const nextRaw = cloneRecord(raw)
      nextRaw.mcp = {
        ...mcpObject(nextRaw),
        revision: targetRevision,
        servers: { ...servers, [serverKey]: serverConfigFromDraft(draft) },
      }
      try {
        writePersistedRawConfig(nextRaw, input.paths, input.fileSystem)
        input.catalog.write({
          internalMcpId,
          status: "enabled",
          displayName: draft.displayName,
          risk: previousCatalog?.risk ?? "safe",
          toolNames: previousCatalog?.toolNames ?? [],
          metadata: { transport: draft.transport, required: draft.required },
          source: previousCatalog?.source ?? "manual",
          auditId: previousCatalog?.auditId ?? null,
          createdAt: previousCatalog?.createdAt ?? targetRevision,
          updatedAt: targetRevision,
        })
        return { ok: true, revision: targetRevision, rollbackSnapshot }
      } catch {
        if ((rollbackSnapshot.token as StoreRollbackToken).fileExisted)
          writePersistedRawConfig(cloneRecord(raw), input.paths, input.fileSystem)
        else input.fileSystem.remove(input.paths.configFile)
        try {
          if (previousCatalog) input.catalog.write(previousCatalog)
          else {
            const current = catalogRows().find((row) => row.internalMcpId === internalMcpId)
            if (current)
              input.catalog.write({ ...current, status: "archived", updatedAt: actualRevision })
          }
        } catch {
          return {
            ok: false,
            revision: actualRevision,
            reasonCode: "mcp_persistence_compensation_failed",
          }
        }
        return { ok: false, revision: actualRevision, reasonCode: "mcp_persistence_failed" }
      }
    },
    persistLifecycle: ({
      internalMcpId,
      action,
      expectedRevision,
      targetRevision,
    }: {
      internalMcpId: string
      action: McpLifecycleAction
      expectedRevision: number
      targetRevision: number
    }) => {
      const raw = readRaw()
      const actualRevision = revisionFor(raw)
      if (actualRevision !== expectedRevision)
        return { ok: false, revision: actualRevision, reasonCode: "capability_revision_conflict" }
      const serverKey = canonicalServerKey(internalMcpId)
      const servers = persistedServers(raw)
      const previousServer = servers[serverKey]
      const previousCatalog =
        catalogRows().find((row) => row.internalMcpId === internalMcpId) ?? null
      if (!previousServer || !previousCatalog || previousCatalog.status === "archived")
        return { ok: false, revision: actualRevision, reasonCode: "mcp_ref_not_found" }
      const rollbackSnapshot: McpConfigurationRollbackSnapshot = Object.freeze({
        revision: actualRevision,
        entries: Object.freeze([...listEntries()]),
        token: Object.freeze({
          fileExisted: input.fileSystem.exists(input.paths.configFile),
          raw: cloneRecord(raw),
          targetId: internalMcpId,
          previousCatalog,
        } satisfies StoreRollbackToken),
      })
      const nextServers = { ...servers }
      if (action === "delete") delete nextServers[serverKey]
      else nextServers[serverKey] = { ...previousServer, enabled: action === "enable" }
      const nextRaw = cloneRecord(raw)
      nextRaw.mcp = { ...mcpObject(nextRaw), revision: targetRevision, servers: nextServers }
      try {
        writePersistedRawConfig(nextRaw, input.paths, input.fileSystem)
        input.catalog.write({
          ...previousCatalog,
          status: action === "delete" ? "archived" : action === "enable" ? "enabled" : "disabled",
          updatedAt: targetRevision,
        })
        return { ok: true, revision: targetRevision, rollbackSnapshot }
      } catch {
        try {
          if ((rollbackSnapshot.token as StoreRollbackToken).fileExisted)
            writePersistedRawConfig(cloneRecord(raw), input.paths, input.fileSystem)
          else input.fileSystem.remove(input.paths.configFile)
          input.catalog.write(previousCatalog)
        } catch {
          return {
            ok: false,
            revision: actualRevision,
            reasonCode: "mcp_persistence_compensation_failed",
          }
        }
        return { ok: false, revision: actualRevision, reasonCode: "mcp_persistence_failed" }
      }
    },
    persistRecovery: ({
      internalMcpId,
      expectedRevision,
      targetRevision,
    }: {
      internalMcpId: string
      expectedRevision: number
      targetRevision: number
    }) => {
      const raw = readRaw()
      const actualRevision = revisionFor(raw)
      if (actualRevision !== expectedRevision)
        return { ok: false, revision: actualRevision, reasonCode: "capability_revision_conflict" }
      const serverKey = canonicalServerKey(internalMcpId)
      const servers = persistedServers(raw)
      if (!(serverKey in servers))
        return { ok: false, revision: actualRevision, reasonCode: "mcp_ref_not_found" }
      const previousCatalog =
        catalogRows().find((row) => row.internalMcpId === internalMcpId) ?? null
      const rollbackSnapshot: McpConfigurationRollbackSnapshot = Object.freeze({
        revision: actualRevision,
        entries: Object.freeze([...listEntries()]),
        token: Object.freeze({
          fileExisted: input.fileSystem.exists(input.paths.configFile),
          raw: cloneRecord(raw),
          targetId: internalMcpId,
          previousCatalog,
        } satisfies StoreRollbackToken),
      })
      const nextRaw = cloneRecord(raw)
      nextRaw.mcp = { ...mcpObject(nextRaw), revision: targetRevision, servers }
      try {
        writePersistedRawConfig(nextRaw, input.paths, input.fileSystem)
        if (previousCatalog) input.catalog.write({ ...previousCatalog, updatedAt: targetRevision })
        return { ok: true, revision: targetRevision, rollbackSnapshot }
      } catch {
        try {
          if ((rollbackSnapshot.token as StoreRollbackToken).fileExisted)
            writePersistedRawConfig(cloneRecord(raw), input.paths, input.fileSystem)
          else input.fileSystem.remove(input.paths.configFile)
          if (previousCatalog) input.catalog.write(previousCatalog)
        } catch {
          return {
            ok: false,
            revision: actualRevision,
            reasonCode: "mcp_persistence_compensation_failed",
          }
        }
        return { ok: false, revision: actualRevision, reasonCode: "mcp_persistence_failed" }
      }
    },
    rollback: (snapshot: McpConfigurationRollbackSnapshot) => {
      const token = snapshot.token as StoreRollbackToken
      try {
        if (token.fileExisted)
          writePersistedRawConfig(cloneRecord(token.raw), input.paths, input.fileSystem)
        else input.fileSystem.remove(input.paths.configFile)
        if (token.previousCatalog) input.catalog.write(token.previousCatalog)
        else {
          const current = catalogRows().find((row) => row.internalMcpId === token.targetId)
          if (current)
            input.catalog.write({ ...current, status: "archived", updatedAt: snapshot.revision })
        }
        return { ok: true }
      } catch {
        return { ok: false, reasonCode: "mcp_persistence_rollback_failed" }
      }
    },
  })
}

export interface McpRegistryApplyPort {
  reload(
    config: KnowbeeConfig,
    baseEnv: Readonly<Record<string, string | undefined>>,
  ): Promise<readonly { name: string; ready: boolean; toolCount: number }[]>
  statuses(): readonly { name: string; ready: boolean; toolCount: number }[]
  reloadTarget(input: {
    name: string
    config: McpServerConfig
    defaultCwd: string
    baseEnv: Readonly<Record<string, string | undefined>>
  }): Promise<{ name: string; ready: boolean; toolCount: number }>
}

interface RuntimeRollbackToken {
  readonly config: KnowbeeConfig
  readonly revision: number
  readonly evidence: readonly { name: string; ready: boolean; toolCount: number }[]
}

interface TargetRuntimeRollbackToken {
  readonly kind: "target"
  readonly internalMcpId: string
  readonly config: KnowbeeConfig
  readonly revision: number
  readonly evidence: readonly { name: string; ready: boolean; toolCount: number }[]
}

export function createMcpRegistryApplyAdapter(input: {
  initialConfig: KnowbeeConfig
  initialRevision: number
  baseEnv: Readonly<Record<string, string | undefined>>
  registry: McpRegistryApplyPort
}): McpRuntimeApplyPort {
  let activeConfig = input.initialConfig
  let activeRevision = input.initialRevision
  const evidence = () => input.registry.statuses().map((status) => ({ ...status }))
  const sameEvidence = (
    left: readonly { name: string; ready: boolean; toolCount: number }[],
    right: readonly { name: string; ready: boolean; toolCount: number }[],
  ) =>
    JSON.stringify([...left].sort((a, b) => a.name.localeCompare(b.name))) ===
    JSON.stringify([...right].sort((a, b) => a.name.localeCompare(b.name)))
  return Object.freeze({
    capture: (): McpRuntimeRollbackSnapshot =>
      Object.freeze({
        token: Object.freeze({
          config: activeConfig,
          revision: activeRevision,
          evidence: evidence(),
        } satisfies RuntimeRollbackToken),
      }),
    apply: async ({
      configuration,
      targetRevision,
    }: { configuration: unknown; targetRevision: number }) => {
      if (!configuration || typeof configuration !== "object" || Array.isArray(configuration))
        return { ok: false, reasonCode: "mcp_runtime_snapshot_invalid" }
      const nextConfig: KnowbeeConfig = {
        ...activeConfig,
        mcp: cloneRecord(configuration as McpConfig),
      }
      try {
        await input.registry.reload(nextConfig, input.baseEnv)
        activeConfig = nextConfig
        activeRevision = targetRevision
        return { ok: true }
      } catch {
        return { ok: false, reasonCode: "mcp_runtime_apply_failed" }
      }
    },
    verify: async ({
      internalMcpId,
      targetRevision,
    }: { internalMcpId: string; targetRevision: number }) => {
      const serverKey = canonicalServerKey(internalMcpId)
      const matches = input.registry.statuses().filter((status) => status.name === serverKey)
      const match = matches.length === 1 ? matches[0] : undefined
      return activeRevision === targetRevision && Boolean(match?.ready)
        ? { ok: true }
        : { ok: false, reasonCode: "mcp_health_revision_mismatch" }
    },
    verifyLifecycle: async ({
      internalMcpId,
      action,
      targetRevision,
    }: { internalMcpId: string; action: McpLifecycleAction; targetRevision: number }) => {
      const serverKey = canonicalServerKey(internalMcpId)
      const matches = input.registry.statuses().filter((status) => status.name === serverKey)
      if (activeRevision !== targetRevision)
        return { ok: false, reasonCode: "mcp_lifecycle_revision_mismatch" }
      if (action === "delete")
        return matches.length === 0
          ? { ok: true }
          : { ok: false, reasonCode: "mcp_delete_not_visible" }
      const match = matches.length === 1 ? matches[0] : undefined
      if (action === "disable")
        return match !== undefined && !match.ready && match.toolCount === 0
          ? { ok: true }
          : { ok: false, reasonCode: "mcp_disable_not_visible" }
      return match?.ready === true
        ? { ok: true }
        : { ok: false, reasonCode: "mcp_enable_not_ready" }
    },
    captureTarget: (internalMcpId: string): McpRuntimeRollbackSnapshot =>
      Object.freeze({
        token: Object.freeze({
          kind: "target",
          internalMcpId,
          config: cloneRecord(activeConfig),
          revision: activeRevision,
          evidence: evidence(),
        } satisfies TargetRuntimeRollbackToken),
      }),
    applyTarget: async ({
      internalMcpId,
      configuration,
      targetRevision,
    }: {
      internalMcpId: string
      configuration: unknown
      targetRevision: number
    }) => {
      if (!configuration || typeof configuration !== "object" || Array.isArray(configuration))
        return { ok: false, reasonCode: "mcp_runtime_snapshot_invalid" }
      const nextConfig: KnowbeeConfig = {
        ...activeConfig,
        mcp: cloneRecord(configuration as McpConfig),
      }
      const serverKey = canonicalServerKey(internalMcpId)
      const serverConfig = nextConfig.mcp?.servers?.[serverKey]
      if (!serverConfig) return { ok: false, reasonCode: "mcp_ref_not_found" }
      try {
        await input.registry.reloadTarget({
          name: serverKey,
          config: serverConfig,
          defaultCwd: nextConfig.profile.workspace,
          baseEnv: input.baseEnv,
        })
        activeConfig = nextConfig
        activeRevision = targetRevision
        return { ok: true }
      } catch {
        return { ok: false, reasonCode: "mcp_target_runtime_apply_failed" }
      }
    },
    verifyTarget: async ({
      internalMcpId,
      targetRevision,
    }: {
      internalMcpId: string
      targetRevision: number
    }) => {
      const serverKey = canonicalServerKey(internalMcpId)
      const matches = input.registry.statuses().filter((status) => status.name === serverKey)
      const match = matches.length === 1 ? matches[0] : undefined
      return activeRevision === targetRevision && match?.ready === true
        ? { ok: true, toolCount: match.toolCount }
        : { ok: false, reasonCode: "mcp_recovery_not_ready", toolCount: 0 }
    },
    rollbackTarget: async (snapshot: McpRuntimeRollbackSnapshot) => {
      const token = snapshot.token as TargetRuntimeRollbackToken
      if (token.kind !== "target")
        return { ok: false, reasonCode: "mcp_target_rollback_snapshot_invalid" }
      const serverKey = canonicalServerKey(token.internalMcpId)
      const previous = token.config.mcp?.servers?.[serverKey]
      if (!previous) return { ok: false, reasonCode: "mcp_target_rollback_config_missing" }
      try {
        await input.registry.reloadTarget({
          name: serverKey,
          config: previous,
          defaultCwd: token.config.profile.workspace,
          baseEnv: input.baseEnv,
        })
        const peerEvidence = (
          rows: readonly { name: string; ready: boolean; toolCount: number }[],
        ) => rows.filter((status) => status.name !== serverKey)
        if (!sameEvidence(peerEvidence(evidence()), peerEvidence(token.evidence)))
          return { ok: false, reasonCode: "mcp_peer_runtime_changed" }
        activeConfig = token.config
        activeRevision = token.revision
        return { ok: true }
      } catch {
        return { ok: false, reasonCode: "mcp_target_rollback_failed" }
      }
    },
    rollback: async (snapshot: McpRuntimeRollbackSnapshot) => {
      const token = snapshot.token as RuntimeRollbackToken
      try {
        await input.registry.reload(token.config, input.baseEnv)
        const restored = sameEvidence(evidence(), token.evidence)
        if (!restored) return { ok: false, reasonCode: "mcp_runtime_rollback_verification_failed" }
        activeConfig = token.config
        activeRevision = token.revision
        return { ok: true }
      } catch {
        return { ok: false, reasonCode: "mcp_runtime_rollback_failed" }
      }
    },
  })
}
