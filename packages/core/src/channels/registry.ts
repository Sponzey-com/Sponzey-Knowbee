import type { KnowbeeConfig } from "../config/types.js"
import type { ArtifactStorageContext } from "../artifacts/lifecycle.js"
import type { MemoryJournalRepository } from "../memory/journal.js"
import type { AgentHierarchyStorage } from "../orchestration/hierarchy.js"
import { createLogger, redactLogText } from "../logger/index.js"
import { getTelegramRuntimeStatus } from "./telegram/runtime.js"
import { TelegramChannelAdapter } from "./telegram/adapter.js"
import { SlackChannelAdapter } from "./slack/adapter.js"
import { getSlackRuntimeStatus } from "./slack/runtime.js"
import { DiscordChannelAdapter } from "./discord/adapter.js"
import { getDiscordRuntimeStatus } from "./discord/runtime.js"
import { GoogleChatChannelAdapter } from "./google-chat/adapter.js"
import { getGoogleChatRuntimeStatus } from "./google-chat/runtime.js"
import {
  buildCompatChannelConnectionsFromConfig,
  persistChannelConnections,
  type ChannelConnectionRecord,
} from "./connections.js"
import {
  buildChannelRuntimeSummary,
  recordChannelRuntimeEvent,
  updateConnectionRuntimeHealth,
  type ChannelProviderFactory,
  type ChannelRuntimeAdapter,
  type ChannelRuntimeHealth,
  type ChannelRuntimeStartResult,
  type ChannelRuntimeSummary,
} from "./runtime.js"
import type {
  ChannelPendingResponseDeliveryInput,
  ChannelPendingResponseDeliveryOwner,
} from "./pending-response-delivery.js"

const log = createLogger("channel:registry")

function channelRegistryErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return redactLogText(raw)
}

export interface ChannelRegistryOptions {
  config: KnowbeeConfig
  artifactStorage?: ArtifactStorageContext | undefined
  memoryJournal?: MemoryJournalRepository | undefined
  hierarchyStorage?: AgentHierarchyStorage | undefined
  connections?: ChannelConnectionRecord[]
  factories?: ChannelProviderFactory[]
  now?: () => number
}

export interface ChannelRegistryPlanItem {
  connection: ChannelConnectionRecord
  factory: ChannelProviderFactory | null
  shouldStart: boolean
  reason: "enabled_configured" | "disabled" | "unconfigured" | "unsupported_provider"
}

export class ChannelRegistry {
  private readonly config: KnowbeeConfig
  private readonly now: () => number
  private readonly factories = new Map<string, ChannelProviderFactory>()
  private readonly adapters = new Map<string, ChannelRuntimeAdapter>()
  private readonly startedConnectionIds = new Set<string>()
  private readonly fixedConnections: ChannelConnectionRecord[] | undefined

  constructor(options: ChannelRegistryOptions) {
    this.config = options.config
    this.now = options.now ?? Date.now
    this.fixedConnections = options.connections
    const factories = options.factories
      ?? (options.artifactStorage && options.memoryJournal && options.hierarchyStorage
        ? createBuiltInChannelProviderFactories(
            options.artifactStorage,
            options.memoryJournal,
            options.hierarchyStorage,
          )
        : [])
    for (const factory of factories) {
      this.registerFactory(factory)
    }
  }

  registerFactory(factory: ChannelProviderFactory): void {
    this.factories.set(factory.provider, factory)
  }

  loadConnections(): ChannelConnectionRecord[] {
    return this.fixedConnections ?? buildCompatChannelConnectionsFromConfig(this.config, {
      now: this.now(),
      runtime: {
        telegram: getTelegramRuntimeStatus(),
        slack: getSlackRuntimeStatus(),
        discord: getDiscordRuntimeStatus(),
        googleChat: getGoogleChatRuntimeStatus(),
      },
    })
  }

  plan(): ChannelRegistryPlanItem[] {
    return this.loadConnections().map((connection) => {
      const factory = this.factories.get(connection.provider) ?? null
      if (!connection.enabled) {
        return { connection, factory, shouldStart: false, reason: "disabled" }
      }
      if (!connection.configured) {
        return { connection, factory, shouldStart: false, reason: "unconfigured" }
      }
      if (!factory) {
        return { connection, factory, shouldStart: false, reason: "unsupported_provider" }
      }
      return { connection, factory, shouldStart: true, reason: "enabled_configured" }
    })
  }

  async startEnabled(): Promise<ChannelRuntimeStartResult> {
    const summaries: ChannelRuntimeSummary[] = []
    const plan = this.plan()
    persistChannelConnections(plan.map((item) => item.connection))

    for (const item of plan) {
      if (!item.shouldStart && item.reason !== "unsupported_provider") {
        const health = item.reason === "unconfigured"
          ? this.health("failed", "Connection is enabled but required configuration is missing.")
          : this.health("stopped", null)
        recordChannelRuntimeEvent({
          connection: item.connection,
          eventKind: item.reason === "unconfigured" ? "start_skipped_unconfigured" : "start_skipped_disabled",
          healthStatus: health.status,
          summary: `${item.connection.provider} runtime start skipped: ${item.reason}.`,
        })
        updateConnectionRuntimeHealth(item.connection, health)
        summaries.push(buildChannelRuntimeSummary({
          connection: item.connection,
          health,
          supported: true,
          disposition: item.reason === "unconfigured" ? "skipped_unconfigured" : "skipped_disabled",
        }))
        continue
      }

      if (!item.factory) {
        const health = this.health("failed", "Provider adapter factory is not registered.")
        recordChannelRuntimeEvent({
          connection: item.connection,
          eventKind: "unsupported_provider",
          healthStatus: "failed",
          summary: `${item.connection.provider} provider is not supported by this runtime.`,
        })
        updateConnectionRuntimeHealth(item.connection, health)
        summaries.push(buildChannelRuntimeSummary({
          connection: item.connection,
          health,
          supported: false,
          disposition: "unsupported_provider",
        }))
        continue
      }

      const adapter = item.factory.create({ config: this.config, connection: item.connection })
      this.adapters.set(item.connection.connectionId, adapter)
      try {
        await adapter.start()
        this.startedConnectionIds.add(item.connection.connectionId)
        const health = await adapter.healthCheck()
        recordChannelRuntimeEvent({
          connection: item.connection,
          eventKind: "started",
          healthStatus: health.status,
          summary: `${item.connection.provider} runtime started.`,
          ...(health.detail ? { detail: health.detail } : {}),
        })
        updateConnectionRuntimeHealth(item.connection, health)
        summaries.push(buildChannelRuntimeSummary({
          connection: item.connection,
          capabilities: adapter.getCapabilities(),
          health,
          supported: true,
          disposition: "started",
        }))
      } catch (error) {
        this.startedConnectionIds.delete(item.connection.connectionId)
        const message = channelRegistryErrorMessage(error)
        const health = this.health("failed", message)
        recordChannelRuntimeEvent({
          connection: item.connection,
          eventKind: "start_failed",
          healthStatus: "failed",
          summary: `${item.connection.provider} runtime failed to start.`,
          detail: { message },
        })
        updateConnectionRuntimeHealth(item.connection, health)
        summaries.push(buildChannelRuntimeSummary({
          connection: item.connection,
          capabilities: adapter.getCapabilities(),
          health,
          supported: true,
          disposition: "failed",
        }))
        log.warn(`Failed to start ${item.connection.provider} via registry runtime: ${message}`)
      }
    }

    return {
      mode: "registry",
      featureFlag: {
        featureKey: "channel_registry_runtime",
        mode: "enforced",
        compatibilityMode: false,
      },
      summaries,
    }
  }

  async stopAll(): Promise<ChannelRuntimeSummary[]> {
    const summaries: ChannelRuntimeSummary[] = []
    for (const connection of this.loadConnections()) {
      const adapter = this.adapters.get(connection.connectionId)
      if (!adapter) {
        const health = this.health("stopped", null)
        summaries.push(buildChannelRuntimeSummary({
          connection,
          health,
          supported: this.factories.has(connection.provider),
          disposition: "skipped_disabled",
        }))
        continue
      }
      try {
        await adapter.stop()
        const health = this.health("stopped", null)
        recordChannelRuntimeEvent({
          connection,
          eventKind: "stopped",
          healthStatus: "stopped",
          summary: `${connection.provider} runtime stopped.`,
        })
        updateConnectionRuntimeHealth(connection, health)
        summaries.push(buildChannelRuntimeSummary({
          connection,
          capabilities: adapter.getCapabilities(),
          health,
          supported: true,
          disposition: "skipped_disabled",
        }))
      } finally {
        this.startedConnectionIds.delete(connection.connectionId)
        this.adapters.delete(connection.connectionId)
      }
    }
    return summaries
  }

  getCapabilitySummaries(): ChannelRuntimeSummary[] {
    return this.plan().map((item) => {
      const adapter = item.factory && this.adapters.get(item.connection.connectionId)
      return buildChannelRuntimeSummary({
        connection: item.connection,
        capabilities: adapter?.getCapabilities() ?? item.connection.capabilityManifest,
        health: item.connection.health,
        supported: Boolean(item.factory),
        disposition: item.shouldStart ? "ready" : item.reason === "unsupported_provider"
          ? "unsupported_provider"
          : item.reason === "unconfigured"
            ? "skipped_unconfigured"
            : "skipped_disabled",
      })
    })
  }

  getPendingResponseDeliveryOwner(
    provider: string,
  ): ChannelPendingResponseDeliveryOwner | undefined {
    const candidates = [...this.adapters.values()].filter(
      (adapter) =>
        adapter.provider === provider &&
        this.startedConnectionIds.has(adapter.connectionId) &&
        typeof adapter.createPendingResponseDeliveryHandler === "function",
    )
    if (candidates.length !== 1) return undefined
    const adapter = candidates[0]
    if (!adapter?.createPendingResponseDeliveryHandler) return undefined
    return Object.freeze({
      createPendingResponseDeliveryHandler: (input: ChannelPendingResponseDeliveryInput) =>
        adapter.createPendingResponseDeliveryHandler?.(input),
    })
  }

  private health(status: ChannelRuntimeHealth["status"], message: string | null): ChannelRuntimeHealth {
    return {
      status,
      message,
      checkedAt: this.now(),
    }
  }
}

export function createBuiltInChannelProviderFactories(
  artifactStorage: ArtifactStorageContext,
  memoryJournal: MemoryJournalRepository,
  hierarchyStorage: AgentHierarchyStorage,
): ChannelProviderFactory[] {
  return [
    {
      provider: "telegram",
      create: ({ config, connection }) => createTelegramRuntimeAdapter(
        config,
        connection,
        artifactStorage,
        memoryJournal,
        hierarchyStorage,
      ),
    },
    {
      provider: "slack",
      create: ({ config, connection }) => createSlackRuntimeAdapter(
        config,
        connection,
        artifactStorage,
        memoryJournal,
        hierarchyStorage,
      ),
    },
    {
      provider: "discord",
      create: ({ config, connection }) => createDiscordRuntimeAdapter(config, connection),
    },
    {
      provider: "google_chat",
      create: ({ config, connection }) => createGoogleChatRuntimeAdapter(config, connection),
    },
  ]
}

export function buildChannelRegistryRuntimeDiagnostics(
  config: KnowbeeConfig,
  artifactStorage: ArtifactStorageContext,
): ChannelRuntimeSummary[] {
  return new ChannelRegistry({ config, artifactStorage }).getCapabilitySummaries()
}

function createTelegramRuntimeAdapter(
  config: KnowbeeConfig,
  connection: ChannelConnectionRecord,
  artifactStorage: ArtifactStorageContext,
  memoryJournal: MemoryJournalRepository,
  hierarchyStorage: AgentHierarchyStorage,
): ChannelRuntimeAdapter {
  const adapter = new TelegramChannelAdapter({
    config: config.telegram,
    runtimeConfig: config,
    connectionId: connection.connectionId,
    artifactStorage,
    memoryJournal,
    hierarchyStorage,
  })
  return {
    provider: "telegram",
    connectionId: connection.connectionId,
    start: () => adapter.start(),
    stop: () => adapter.stop(),
    getCapabilities: () => adapter.getCapabilities(),
    createPendingResponseDeliveryHandler: (input) =>
      adapter.createPendingResponseDeliveryHandler(input),
    healthCheck: async () => {
      const health = await adapter.healthCheck()
      const detail = isRecord(health.detail) ? health.detail : undefined
      return {
        status: health.status,
        checkedAt: health.checkedAt,
        message: health.message ?? null,
        ...(detail ? { detail } : {}),
      }
    },
  }
}

function createSlackRuntimeAdapter(
  config: KnowbeeConfig,
  connection: ChannelConnectionRecord,
  artifactStorage: ArtifactStorageContext,
  memoryJournal: MemoryJournalRepository,
  hierarchyStorage: AgentHierarchyStorage,
): ChannelRuntimeAdapter {
  const adapter = new SlackChannelAdapter({
    config: config.slack,
    runtimeConfig: config,
    connectionId: connection.connectionId,
    artifactStorage,
    memoryJournal,
    hierarchyStorage,
  })
  return {
    provider: "slack",
    connectionId: connection.connectionId,
    start: () => adapter.start(),
    stop: () => adapter.stop(),
    getCapabilities: () => adapter.getCapabilities(),
    createPendingResponseDeliveryHandler: (input) =>
      adapter.createPendingResponseDeliveryHandler(input),
    healthCheck: async () => {
      const health = await adapter.healthCheck()
      const detail = isRecord(health.detail) ? health.detail : undefined
      return {
        status: health.status,
        checkedAt: health.checkedAt,
        message: health.message ?? null,
        ...(detail ? { detail } : {}),
      }
    },
  }
}

function createDiscordRuntimeAdapter(
  config: KnowbeeConfig,
  connection: ChannelConnectionRecord,
): ChannelRuntimeAdapter {
  const adapter = new DiscordChannelAdapter({
    config: config.discord,
    connectionId: connection.connectionId,
  })
  return {
    provider: "discord",
    connectionId: connection.connectionId,
    start: () => adapter.start(),
    stop: () => adapter.stop(),
    getCapabilities: () => adapter.getCapabilities(),
    healthCheck: async () => {
      const health = await adapter.healthCheck()
      const detail = isRecord(health.detail) ? health.detail : undefined
      return {
        status: health.status,
        checkedAt: health.checkedAt,
        message: health.message ?? null,
        ...(detail ? { detail } : {}),
      }
    },
  }
}

function createGoogleChatRuntimeAdapter(
  config: KnowbeeConfig,
  connection: ChannelConnectionRecord,
): ChannelRuntimeAdapter {
  const adapter = new GoogleChatChannelAdapter({
    config: config.googleChat,
    connectionId: connection.connectionId,
  })
  return {
    provider: "google_chat",
    connectionId: connection.connectionId,
    start: () => adapter.start(),
    stop: () => adapter.stop(),
    getCapabilities: () => adapter.getCapabilities(),
    healthCheck: async () => {
      const health = await adapter.healthCheck()
      const detail = isRecord(health.detail) ? health.detail : undefined
      return {
        status: health.status,
        checkedAt: health.checkedAt,
        message: health.message ?? null,
        ...(detail ? { detail } : {}),
      }
    },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
