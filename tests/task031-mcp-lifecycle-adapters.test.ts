import { describe, expect, it } from "vitest"
import {
  type McpCatalogAdapterRow,
  createMcpConfigurationStore,
  createMcpRegistryApplyAdapter,
} from "../packages/core/src/capabilities/mcp-mutation-adapters.js"
import {
  type PersistedConfigFileSystem,
  readPersistedRawConfig,
} from "../packages/core/src/config/persisted-file.js"
import type { KnowbeeConfig } from "../packages/core/src/config/types.js"

const configFile = "/state/config.json5"
const raw = {
  mcp: {
    revision: 5,
    servers: {
      penpot: {
        enabled: true,
        transport: "stdio",
        command: "node",
        args: ["server.mjs"],
        cwd: "/workspace",
      },
    },
  },
}

function fixture(externalRevision = 0) {
  const files = new Map([[configFile, JSON.stringify(raw)]])
  const fileSystem: PersistedConfigFileSystem = {
    exists: (path) => files.has(path),
    makeDirectory: () => {},
    readText: (path) => files.get(path) ?? "",
    writeText: (path, content) => {
      files.set(path, content)
    },
    rename: (source, target) => {
      const content = files.get(source)
      if (content === undefined) throw new Error("missing")
      files.set(target, content)
      files.delete(source)
    },
    remove: (path) => {
      files.delete(path)
    },
  }
  let rows: McpCatalogAdapterRow[] = [
    {
      internalMcpId: "mcp:penpot",
      status: "enabled",
      displayName: "Penpot",
      risk: "safe",
      toolNames: ["inspect"],
      metadata: {},
      source: "manual",
      auditId: null,
      createdAt: 1,
      updatedAt: 5,
    },
  ]
  const store = createMcpConfigurationStore({
    paths: { configFile },
    initialConfig: raw as never,
    fileSystem,
    catalog: {
      list: () => rows,
      write: (row) => {
        rows = [...rows.filter((item) => item.internalMcpId !== row.internalMcpId), row]
      },
    },
    externalRevision: () => externalRevision,
  })
  return { files, store, rows: () => rows }
}

describe("task031 MCP lifecycle adapters", () => {
  it("uses the injected binding revision for optimistic concurrency", () => {
    const { store } = fixture(9)
    expect(store.currentRevision()).toBe(9)
    expect(
      store.persistLifecycle({
        internalMcpId: "mcp:penpot",
        action: "disable",
        expectedRevision: 5,
        targetRevision: 10,
      }),
    ).toMatchObject({
      ok: false,
      revision: 9,
      reasonCode: "capability_revision_conflict",
    })
  })

  it("disables without losing connection fields and restores both stores on rollback", () => {
    const { files, store, rows } = fixture()
    const result = store.persistLifecycle({
      internalMcpId: "mcp:penpot",
      action: "disable",
      expectedRevision: 5,
      targetRevision: 6,
    })
    expect(result).toMatchObject({ ok: true, revision: 6 })
    const persisted = readPersistedRawConfig({ configFile }, fixtureFileSystem(files)) as {
      mcp: { servers: Record<string, Record<string, unknown>> }
    }
    expect(persisted.mcp.servers.penpot).toMatchObject({
      enabled: false,
      command: "node",
      args: ["server.mjs"],
      cwd: "/workspace",
    })
    expect(rows()[0]).toMatchObject({ status: "disabled", updatedAt: 6 })
    if (!result.rollbackSnapshot) throw new Error("rollback snapshot missing")
    expect(store.rollback(result.rollbackSnapshot)).toEqual({ ok: true })
    expect(readPersistedRawConfig({ configFile }, fixtureFileSystem(files))).toEqual(raw)
    expect(rows()[0]).toMatchObject({ status: "enabled", updatedAt: 5 })
  })

  it("archives and removes only the selected persisted server", () => {
    const { files, store, rows } = fixture()
    expect(
      store.persistLifecycle({
        internalMcpId: "mcp:penpot",
        action: "delete",
        expectedRevision: 5,
        targetRevision: 6,
      }),
    ).toMatchObject({ ok: true })
    const persisted = readPersistedRawConfig({ configFile }, fixtureFileSystem(files)) as {
      mcp: { servers: Record<string, Record<string, unknown>> }
    }
    expect(persisted.mcp.servers.penpot).toBeUndefined()
    expect(rows()[0]).toMatchObject({ status: "archived", updatedAt: 6 })
  })

  it("verifies enabled, disabled and deleted registry projections at the target revision", async () => {
    let statuses = [{ name: "penpot", ready: true, toolCount: 2 }]
    const adapter = createMcpRegistryApplyAdapter({
      initialConfig: raw as unknown as KnowbeeConfig,
      initialRevision: 5,
      baseEnv: { PATH: "/bin" },
      registry: {
        statuses: () => statuses,
        reload: async (config) => {
          const server = config.mcp.servers?.penpot
          statuses = server
            ? [
                {
                  name: "penpot",
                  ready: server.enabled !== false,
                  toolCount: server.enabled === false ? 0 : 2,
                },
              ]
            : []
          return statuses
        },
      },
    })
    const signal = new AbortController().signal
    await adapter.apply(
      {
        configuration: { servers: { penpot: { ...raw.mcp.servers.penpot, enabled: false } } },
        targetRevision: 6,
      },
      signal,
    )
    await expect(
      adapter.verifyLifecycle(
        { internalMcpId: "mcp:penpot", action: "disable", targetRevision: 6 },
        signal,
      ),
    ).resolves.toEqual({ ok: true })
    await adapter.apply(
      { configuration: { servers: { penpot: raw.mcp.servers.penpot } }, targetRevision: 7 },
      signal,
    )
    await expect(
      adapter.verifyLifecycle(
        { internalMcpId: "mcp:penpot", action: "enable", targetRevision: 7 },
        signal,
      ),
    ).resolves.toEqual({ ok: true })
    await adapter.apply({ configuration: { servers: {} }, targetRevision: 8 }, signal)
    await expect(
      adapter.verifyLifecycle(
        { internalMcpId: "mcp:penpot", action: "delete", targetRevision: 8 },
        signal,
      ),
    ).resolves.toEqual({ ok: true })
  })
})

function fixtureFileSystem(files: Map<string, string>): PersistedConfigFileSystem {
  return {
    exists: (path) => files.has(path),
    makeDirectory: () => {},
    readText: (path) => files.get(path) ?? "",
    writeText: (path, content) => {
      files.set(path, content)
    },
    rename: (source, target) => {
      const content = files.get(source)
      if (content === undefined) throw new Error("missing")
      files.set(target, content)
      files.delete(source)
    },
    remove: (path) => {
      files.delete(path)
    },
  }
}
