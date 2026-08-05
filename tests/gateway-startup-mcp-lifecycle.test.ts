import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { projectMcpClientCapability } from "../packages/core/src/control-plane/index.ts"
import {
  transitionMcpComponentState,
  type McpComponentState,
} from "../packages/core/src/contracts/mcp-component-state.ts"
import { DEFAULT_CONFIG, type KnowbeeConfig } from "../packages/core/src/config/types.ts"
import { mcpRegistry } from "../packages/core/src/mcp/registry.ts"
import {
  startMcpConnectionsInBackground,
  type McpStartupPort,
} from "../packages/core/src/runtime/mcp-startup-port.ts"
import {
  initializeToolDispatcher,
  toolDispatcher,
} from "../packages/core/src/tools/index.ts"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

function config(): KnowbeeConfig {
  return {
    ...DEFAULT_CONFIG,
    profile: {
      ...DEFAULT_CONFIG.profile,
      workspace: process.cwd(),
    },
    mcp: {
      servers: {
        optional_notes: {
          transport: "stdio",
          command: process.execPath,
          args: ["tests/fixtures/fake-mcp-server.mjs"],
          required: false,
        },
        required_browser: {
          transport: "stdio",
          command: process.execPath,
          args: ["tests/fixtures/fake-mcp-server.mjs"],
          required: true,
        },
      },
    },
  }
}

beforeAll(() => {
  initializeToolDispatcher(DEFAULT_CONFIG)
})

afterEach(async () => {
  await mcpRegistry.closeAll()
})

describe("MCP deferred startup lifecycle", () => {
  it("prepares configured servers without connecting or advertising tools", () => {
    const runtimeConfig = config()
    const prepared = mcpRegistry.prepareFromConfig(runtimeConfig, {
      PATH: "/bounded/bin",
    })

    expect(prepared).toMatchObject({
      status: "prepared",
      statuses: [
        {
          name: "optional_notes",
          connectionState: "pending",
          ready: false,
          registeredToolCount: 0,
        },
        {
          name: "required_browser",
          connectionState: "pending",
          ready: false,
          registeredToolCount: 0,
        },
      ],
    })
    expect(toolDispatcher.get("mcp__optional_notes__echo")).toBeUndefined()
    expect(toolDispatcher.get("mcp__required_browser__echo")).toBeUndefined()
    expect(mcpRegistry.getSummary()).toEqual({
      serverCount: 2,
      readyCount: 0,
      toolCount: 0,
      requiredFailures: 1,
    })

    const mcpCapability = projectMcpClientCapability({
      summary: mcpRegistry.getSummary(),
      statuses: mcpRegistry.getStatuses(),
    })
    expect(mcpCapability).toMatchObject({
      status: "error",
      enabled: false,
    })
  })

  it("rejects preparing over a live registry snapshot", () => {
    const runtimeConfig = config()
    expect(mcpRegistry.prepareFromConfig(runtimeConfig)).toMatchObject({
      status: "prepared",
    })
    expect(mcpRegistry.prepareFromConfig(runtimeConfig)).toEqual({
      status: "rejected",
      reasonCode: "registry_not_empty",
    })
  })

  for (const required of [false, true]) {
    it(`does not await a delayed configured connector when required=${required}`, async () => {
      let release: (() => void) | undefined
      let connectCalls = 0
      const completion = new Promise<void>((resolve) => {
        release = resolve
      })
      const port: McpStartupPort = {
        prepare() {
          return { status: "prepared", statuses: [] }
        },
        async connectConfigured() {
          connectCalls += 1
          await completion
          return []
        },
        async cancel() {},
        async close() {},
      }

      const launched = startMcpConnectionsInBackground(port)

      expect(launched.status).toBe("started")
      await Promise.resolve()
      expect(connectCalls).toBe(1)
      await expect(Promise.race([
        launched.completion.then(() => "completed"),
        Promise.resolve("gateway_not_waiting"),
      ])).resolves.toBe("gateway_not_waiting")
      release?.()
      await expect(launched.completion).resolves.toEqual({
        status: "completed",
        statuses: [],
      })
    })
  }

  it("starts deferred MCP only after the awaited Gateway required path", () => {
    const source = readFileSync(
      "packages/core/src/runtime/bootstrap.ts",
      "utf8",
    )
    const prepare = source.indexOf("mcpStartup.prepare(")
    const server = source.indexOf("await startServer(")
    const deferred = source.indexOf("startMcpConnectionsInBackground(mcpStartup)")

    expect(prepare).toBeGreaterThan(0)
    expect(server).toBeGreaterThan(prepare)
    expect(deferred).toBeGreaterThan(server)
    expect(source).not.toContain("await mcpRegistry.loadFromConfig")
  })

  it("does not register a late tool after close cancels a connector", async () => {
    const delayedConfig = {
      ...DEFAULT_CONFIG,
      profile: { ...DEFAULT_CONFIG.profile, workspace: process.cwd() },
      mcp: {
        servers: {
          delayed: {
            transport: "stdio" as const,
            command: process.execPath,
            args: [
              resolve("tests/fixtures/fake-mcp-server.mjs"),
              "delayed-tools",
            ],
            startupTimeoutSec: 2,
            toolTimeoutSec: 2,
          },
        },
      },
    }
    expect(mcpRegistry.prepareFromConfig(delayedConfig).status).toBe("prepared")
    const connecting = mcpRegistry.connectConfigured()
    await new Promise((resolveWait) => setTimeout(resolveWait, 30))

    await mcpRegistry.closeAll()
    await connecting

    expect(mcpRegistry.getStatuses()).toEqual([])
    expect(toolDispatcher.get("mcp__delayed__echo")).toBeUndefined()
  })

  it("does not let an old connector overwrite a reloaded server", async () => {
    const fixture = resolve("tests/fixtures/fake-mcp-server.mjs")
    const oldConfig = {
      ...DEFAULT_CONFIG,
      profile: { ...DEFAULT_CONFIG.profile, workspace: process.cwd() },
      mcp: {
        servers: {
          shared: {
            transport: "stdio" as const,
            command: process.execPath,
            args: [fixture, "delayed-partial-tools"],
            startupTimeoutSec: 2,
            toolTimeoutSec: 2,
          },
        },
      },
    }
    const newConfig = {
      ...oldConfig,
      mcp: {
        servers: {
          shared: {
            ...oldConfig.mcp.servers.shared,
            args: [fixture, "zero-tools"],
          },
        },
      },
    }
    expect(mcpRegistry.prepareFromConfig(oldConfig).status).toBe("prepared")
    const oldConnection = mcpRegistry.connectConfigured()
    await new Promise((resolveWait) => setTimeout(resolveWait, 30))

    await mcpRegistry.reloadFromConfig(newConfig)
    await oldConnection

    expect(mcpRegistry.getStatuses()).toEqual([
      expect.objectContaining({
        name: "shared",
        connectionState: "ready",
        toolCount: 0,
        registeredToolCount: 0,
      }),
    ])
    expect(toolDispatcher.get("mcp__shared__echo")).toBeUndefined()
  })
})

describe("MCP component state contract", () => {
  it("accepts the recovery path and rejects skipped or terminal transitions", () => {
    let state: McpComponentState = "pending"
    for (const [event, expected] of [
      ["connect_requested", "connecting"],
      ["connection_ready", "ready"],
      ["connection_degraded", "degraded"],
      ["retry_requested", "connecting"],
      ["connection_failed", "failed"],
      ["retry_requested", "connecting"],
      ["cancel_requested", "cancelled"],
    ] as const) {
      const result = transitionMcpComponentState(state, event)
      expect(result).toEqual({
        status: "accepted",
        previousState: state,
        event,
        nextState: expected,
      })
      state = expected
    }

    expect(transitionMcpComponentState("pending", "connection_ready")).toEqual({
      status: "rejected",
      reasonCode: "transition_not_allowed",
    })
    expect(transitionMcpComponentState("cancelled", "retry_requested")).toEqual({
      status: "rejected",
      reasonCode: "terminal_state_exit_forbidden",
    })
  })
})
