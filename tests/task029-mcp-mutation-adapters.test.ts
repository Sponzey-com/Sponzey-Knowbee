import { describe, expect, it } from "vitest"
import type { KnowbeeConfig } from "../packages/core/src/config/types.js"
import { readPersistedRawConfig, type PersistedConfigFileSystem } from "../packages/core/src/config/persisted-file.js"
import {
  createMcpConfigurationStore,
  createMcpRegistryApplyAdapter,
  type McpCatalogAdapterRow,
} from "../packages/core/src/capabilities/mcp-mutation-adapters.js"

function memoryFileSystem(initial: Record<string, string>) {
  const files = new Map(Object.entries(initial))
  const fileSystem: PersistedConfigFileSystem = {
    exists: (path) => files.has(path), makeDirectory: () => {}, readText: (path) => files.get(path) ?? "",
    writeText: (path, content) => { files.set(path, content) },
    rename: (source, target) => { const content = files.get(source); if (content === undefined) throw new Error("missing"); files.set(target, content); files.delete(source) },
    remove: (path) => { files.delete(path) },
  }
  return { files, fileSystem }
}

const configFile = "/state/config.json5"
const initialRaw = {
  unrelated: { keep: true },
  mcp: { revision: 5, servers: {
    penpot: { enabled: true, transport: "stdio", command: "node", args: ["old.mjs"], cwd: "/workspace", env: { LEGACY: "preserve" }, startupTimeoutSec: 19, enabledTools: ["inspect"] },
    other: { enabled: true, transport: "stdio", command: "other", args: [], env: { OTHER: "keep" }, toolTimeoutSec: 41 },
  } },
}

describe("task029 MCP persistence and runtime adapters", () => {
  it("atomically changes only the target server and restores config/catalog on rollback", () => {
    const { files, fileSystem } = memoryFileSystem({ [configFile]: JSON.stringify(initialRaw) })
    let rows: McpCatalogAdapterRow[] = [{ internalMcpId: "mcp:penpot", status: "enabled", displayName: "Penpot", risk: "safe", toolNames: ["inspect"], metadata: { transport: "stdio" }, source: "manual", auditId: null, createdAt: 1, updatedAt: 5 }]
    const store = createMcpConfigurationStore({ paths: { configFile }, initialConfig: { mcp: initialRaw.mcp as never }, fileSystem, catalog: { list: () => rows, write: (row) => { rows = [...rows.filter((item) => item.internalMcpId !== row.internalMcpId), row] } } })
    expect(store.listKnownIdentities()).toEqual(expect.arrayContaining([{ internalMcpId: "mcp:penpot", displayName: "Penpot" }, { internalMcpId: "mcp:other", displayName: "other" }]))
    const draft = { displayName: "Penpot Next", transport: "stdio" as const, command: "node", args: ["next.mjs"], cwd: "/workspace", required: true }
    expect(store.persist({ mode: "update", internalMcpId: "mcp:penpot", draft, expectedRevision: 4, targetRevision: 6 })).toMatchObject({ ok: false, revision: 5, reasonCode: "capability_revision_conflict" })
    const result = store.persist({ mode: "update", internalMcpId: "mcp:penpot", draft, expectedRevision: 5, targetRevision: 6 })
    expect(result).toMatchObject({ ok: true, revision: 6 })
    expect(store.persist({ mode: "update", internalMcpId: "mcp:penpot", draft, expectedRevision: 5, targetRevision: 6 })).toMatchObject({ ok: false, revision: 6, reasonCode: "capability_revision_conflict" })
    const written = readPersistedRawConfig({ configFile }, fileSystem) as any
    expect(written.unrelated).toEqual({ keep: true })
    expect(written.mcp.servers.penpot).toEqual({ enabled: true, transport: "stdio", command: "node", args: ["next.mjs"], cwd: "/workspace", required: true })
    expect(written.mcp.servers.other).toEqual(initialRaw.mcp.servers.other)
    expect(rows.find((row) => row.internalMcpId === "mcp:penpot")).toMatchObject({ displayName: "Penpot Next", updatedAt: 6 })
    expect(store.rollback(result.rollbackSnapshot!)).toEqual({ ok: true })
    expect(readPersistedRawConfig({ configFile }, fileSystem)).toEqual(initialRaw)
    expect(rows.find((row) => row.internalMcpId === "mcp:penpot")).toMatchObject({ displayName: "Penpot", updatedAt: 5 })
  })

  it("passes the bootstrap environment explicitly and verifies revision plus target health", async () => {
    let statuses = [{ name: "penpot", ready: true, toolCount: 1 }, { name: "other", ready: true, toolCount: 0 }]
    let receivedEnv: unknown
    let receivedConfig: KnowbeeConfig | undefined
    const initialConfig = { profile: { workspace: "/workspace" }, mcp: initialRaw.mcp } as unknown as KnowbeeConfig
    const adapter = createMcpRegistryApplyAdapter({ initialConfig, initialRevision: 5, baseEnv: { PATH: "/bin", TOKEN: "bootstrap-only" }, registry: {
      statuses: () => statuses,
      reload: async (config, baseEnv) => { receivedConfig = config; receivedEnv = baseEnv; statuses = Object.entries(config.mcp.servers ?? {}).map(([name, server]) => ({ name, ready: true, toolCount: name === "penpot" && server.args?.includes("next.mjs") ? 2 : name === "penpot" ? 1 : 0 })); return statuses },
    } })
    const before = adapter.capture()
    expect(await adapter.apply({ configuration: { servers: { penpot: { enabled: true, transport: "stdio", command: "node", args: ["next.mjs"] } } }, targetRevision: 6 }, new AbortController().signal)).toEqual({ ok: true })
    expect(receivedEnv).toEqual({ PATH: "/bin", TOKEN: "bootstrap-only" })
    expect(receivedConfig?.mcp.servers?.penpot?.args).toEqual(["next.mjs"])
    expect(await adapter.verify({ internalMcpId: "mcp:penpot", targetRevision: 6 }, new AbortController().signal)).toEqual({ ok: true })
    expect(await adapter.verify({ internalMcpId: "mcp:penpot", targetRevision: 5 }, new AbortController().signal)).toMatchObject({ ok: false, reasonCode: "mcp_health_revision_mismatch" })
    expect(await adapter.rollback(before, new AbortController().signal)).toEqual({ ok: true })
    expect(receivedConfig?.mcp.servers?.penpot?.args).toEqual(["old.mjs"])
  })

  it("fails closed for malformed config and compensates a catalog write failure", () => {
    const malformed = memoryFileSystem({ [configFile]: "{mcp:" })
    const emptyCatalog = { list: () => [] as McpCatalogAdapterRow[], write: () => {} }
    const malformedStore = createMcpConfigurationStore({ paths: { configFile }, initialConfig: { mcp: {} }, fileSystem: malformed.fileSystem, catalog: emptyCatalog })
    expect(() => malformedStore.currentRevision()).toThrow()

    const memory = memoryFileSystem({ [configFile]: JSON.stringify(initialRaw) })
    const originalRow: McpCatalogAdapterRow = { internalMcpId: "mcp:penpot", status: "enabled", displayName: "Penpot", risk: "safe", toolNames: ["inspect"], metadata: { transport: "stdio" }, source: "manual", auditId: null, createdAt: 1, updatedAt: 5 }
    let rows = [originalRow]; let failNext = true
    const store = createMcpConfigurationStore({ paths: { configFile }, initialConfig: { mcp: initialRaw.mcp as never }, fileSystem: memory.fileSystem, catalog: {
      list: () => rows,
      write: (row) => { rows = [row]; if (failNext) { failNext = false; throw new Error("db unavailable") } },
    } })
    const result = store.persist({ mode: "update", internalMcpId: "mcp:penpot", draft: { ...draftFromFixture(), displayName: "Changed" }, expectedRevision: 5, targetRevision: 6 })
    expect(result).toMatchObject({ ok: false, revision: 5, reasonCode: "mcp_persistence_failed" })
    expect(readPersistedRawConfig({ configFile }, memory.fileSystem)).toEqual(initialRaw)
    expect(rows).toEqual([originalRow])
  })
})

function draftFromFixture() {
  return { displayName: "Penpot", transport: "stdio" as const, command: "node", args: ["old.mjs"], cwd: "/workspace", required: false }
}
