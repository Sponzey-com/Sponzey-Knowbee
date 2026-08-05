import { describe, expect, it } from "vitest"
import {
  type McpCatalogAdapterRow,
  createMcpConfigurationStore,
  createMcpRegistryApplyAdapter,
} from "../packages/core/src/capabilities/mcp-mutation-adapters.js"
import type { PersistedConfigFileSystem } from "../packages/core/src/config/persisted-file.js"
import { readPersistedRawConfig } from "../packages/core/src/config/persisted-file.js"
import type { KnowbeeConfig, McpServerConfig } from "../packages/core/src/config/types.js"

function memoryFileSystem(configFile: string, raw: object): PersistedConfigFileSystem {
  const files = new Map([[configFile, JSON.stringify(raw)]])
  return {
    exists: (path) => files.has(path),
    makeDirectory: () => {},
    readText: (path) => files.get(path) ?? "",
    writeText: (path, content) => void files.set(path, content),
    rename: (source, target) => {
      const content = files.get(source)
      if (content === undefined) throw new Error("missing")
      files.set(target, content)
      files.delete(source)
    },
    remove: (path) => void files.delete(path),
  }
}

const configFile = "/state/config.json5"
const raw = {
  unrelated: { keep: true },
  mcp: {
    revision: 7,
    servers: {
      penpot: { enabled: true, transport: "stdio", command: "node", args: ["penpot.mjs"] },
      notes: { enabled: true, transport: "stdio", command: "node", args: ["notes.mjs"] },
    },
  },
}

describe("task032 MCP targeted recovery adapters", () => {
  it("persists only the recovery revision and restores the exact snapshot", () => {
    const fileSystem = memoryFileSystem(configFile, raw)
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
        updatedAt: 7,
      },
    ]
    const store = createMcpConfigurationStore({
      paths: { configFile },
      initialConfig: { mcp: raw.mcp as never },
      fileSystem,
      catalog: {
        list: () => rows,
        write: (row) => {
          rows = [...rows.filter((item) => item.internalMcpId !== row.internalMcpId), row]
        },
      },
    })

    const result = store.persistRecovery({
      internalMcpId: "mcp:penpot",
      expectedRevision: 7,
      targetRevision: 8,
    })
    expect(result).toMatchObject({ ok: true, revision: 8 })
    const written = readPersistedRawConfig({ configFile }, fileSystem) as typeof raw
    expect(written.mcp.servers).toEqual(raw.mcp.servers)
    expect(written.unrelated).toEqual(raw.unrelated)
    expect(rows[0]?.updatedAt).toBe(8)
    expect(result.rollbackSnapshot).toBeDefined()
    if (!result.rollbackSnapshot) throw new Error("rollback snapshot missing")
    expect(store.rollback(result.rollbackSnapshot)).toEqual({ ok: true })
    expect(readPersistedRawConfig({ configFile }, fileSystem)).toEqual(raw)
  })

  it("reloads and rolls back only the selected MCP while preserving peer evidence", async () => {
    let statuses = [
      { name: "notes", ready: true, toolCount: 1 },
      { name: "penpot", ready: false, toolCount: 0 },
    ]
    const targetCalls: string[] = []
    const initialConfig = {
      profile: { workspace: "/workspace" },
      mcp: { servers: raw.mcp.servers },
    } as unknown as KnowbeeConfig
    const adapter = createMcpRegistryApplyAdapter({
      initialConfig,
      initialRevision: 7,
      baseEnv: { PATH: "/bin" },
      registry: {
        statuses: () => statuses,
        reload: async () => statuses,
        reloadTarget: async ({ name, config }: { name: string; config: McpServerConfig }) => {
          targetCalls.push(name)
          statuses = statuses.map((status) =>
            status.name === name
              ? { ...status, ready: true, toolCount: config.args?.includes("penpot.mjs") ? 2 : 0 }
              : status,
          )
          const target = statuses.find((status) => status.name === name)
          if (!target) throw new Error("target status missing")
          return target
        },
      },
    })
    const before = adapter.captureTarget("mcp:penpot")

    expect(
      await adapter.applyTarget(
        {
          internalMcpId: "mcp:penpot",
          configuration: { servers: raw.mcp.servers },
          targetRevision: 8,
        },
        new AbortController().signal,
      ),
    ).toEqual({ ok: true })
    expect(
      await adapter.verifyTarget(
        { internalMcpId: "mcp:penpot", targetRevision: 8 },
        new AbortController().signal,
      ),
    ).toEqual({ ok: true, toolCount: 2 })
    expect(statuses.find((status) => status.name === "notes")).toEqual({
      name: "notes",
      ready: true,
      toolCount: 1,
    })
    expect(await adapter.rollbackTarget(before, new AbortController().signal)).toEqual({ ok: true })
    expect(targetCalls).toEqual(["penpot", "penpot"])
    expect(statuses.find((status) => status.name === "notes")).toEqual({
      name: "notes",
      ready: true,
      toolCount: 1,
    })
  })
})
