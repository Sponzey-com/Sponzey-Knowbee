import { readFileSync } from "node:fs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { buildCompatChannelConnectionsFromConfig } from "../packages/core/src/channels/connections.ts"
import { ChannelRegistry } from "../packages/core/src/channels/registry.ts"
import type {
  ChannelProviderFactory,
  ChannelRuntimeAdapter,
} from "../packages/core/src/channels/runtime.ts"
import { DEFAULT_CONFIG, type KnowbeeConfig } from "../packages/core/src/config/types.ts"
import { type TestDbRuntimeFixture, createTestDbRuntimeFixture } from "./fixtures/runtime-db.ts"

function registryConfig(): KnowbeeConfig {
  const config = structuredClone(DEFAULT_CONFIG)
  config.telegram = {
    enabled: true,
    botToken: "123456789:task057-token",
    allowedUserIds: [],
    allowedGroupIds: [],
  }
  return config
}

function recoveryFactory(input: {
  failConnectionId?: string
  handler: ReturnType<typeof vi.fn>
}): ChannelProviderFactory {
  return {
    provider: "telegram",
    create: ({ connection }) => {
      const adapter: ChannelRuntimeAdapter = {
        provider: "telegram",
        connectionId: connection.connectionId,
        async start() {
          if (connection.connectionId === input.failConnectionId) {
            throw new Error("start failed")
          }
        },
        stop() {},
        async healthCheck() {
          return { status: "healthy", message: null, checkedAt: 57 }
        },
        getCapabilities() {
          return connection.capabilityManifest
        },
        createPendingResponseDeliveryHandler() {
          return input.handler
        },
      }
      return adapter
    },
  }
}

describe("Task 057 registry recovery owner", () => {
  let runtime: TestDbRuntimeFixture

  beforeEach(() => {
    runtime = createTestDbRuntimeFixture("knowbee-task057-registry-owner-")
  })

  afterEach(() => runtime.dispose())

  it("returns the only started recovery owner for a provider", async () => {
    const handler = vi.fn()
    const registry = new ChannelRegistry({
      config: registryConfig(),
      factories: [recoveryFactory({ handler })],
      now: () => 57,
    })

    await registry.startEnabled()
    const owner = registry.getPendingResponseDeliveryOwner("telegram")

    expect(owner).toBeDefined()
    expect(
      owner?.createPendingResponseDeliveryHandler({
        runId: "run:task057",
        sessionId: "session:task057",
      }),
    ).toBe(handler)
  })

  it("does not return an adapter whose start failed", async () => {
    const config = registryConfig()
    const connection = buildCompatChannelConnectionsFromConfig(config, { now: 57 }).find(
      (candidate) => candidate.provider === "telegram",
    )
    if (!connection) throw new Error("telegram connection fixture expected")
    const registry = new ChannelRegistry({
      config,
      connections: [connection],
      factories: [
        recoveryFactory({
          failConnectionId: connection.connectionId,
          handler: vi.fn(),
        }),
      ],
      now: () => 57,
    })

    await registry.startEnabled()

    expect(registry.getPendingResponseDeliveryOwner("telegram")).toBeUndefined()
  })

  it("does not choose implicitly when multiple started connections share a provider", async () => {
    const config = registryConfig()
    const primary = buildCompatChannelConnectionsFromConfig(config, { now: 57 }).find(
      (candidate) => candidate.provider === "telegram",
    )
    if (!primary) throw new Error("telegram connection fixture expected")
    const secondary = {
      ...primary,
      connectionId: "telegram:secondary",
      displayName: "Telegram Secondary",
    }
    const registry = new ChannelRegistry({
      config,
      connections: [primary, secondary],
      factories: [recoveryFactory({ handler: vi.fn() })],
      now: () => 57,
    })

    await registry.startEnabled()

    expect(registry.getPendingResponseDeliveryOwner("telegram")).toBeUndefined()
  })

  it("connects registry owners to the returned startup recovery runtime", () => {
    const source = readFileSync("packages/core/src/channels/index.ts", "utf8")

    expect(source).toContain('registry.getPendingResponseDeliveryOwner("telegram")')
    expect(source).toContain('registry.getPendingResponseDeliveryOwner("slack")')
    expect(source).toContain("return createStartedChannelRecoveryRuntime({")
  })
})
