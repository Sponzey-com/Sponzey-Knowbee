import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createApiMcpMutationRuntime } from "../packages/core/src/api/mcp-mutation-bootstrap.js"
import { createRuntimePaths } from "../packages/core/src/config/paths.js"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.js"
import { readPersistedRawConfig } from "../packages/core/src/config/persisted-file.js"
import { closeDb, getCapabilityMutationReceipt, getDb, listMcpServerCatalogEntries } from "../packages/core/src/db/index.js"
import { mcpRegistry } from "../packages/core/src/mcp/registry.js"
import { initializeToolDispatcher } from "../packages/core/src/tools/index.js"

const root = mkdtempSync(join(tmpdir(), "knowbee-task029-integration-"))
const fixture = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures/fake-mcp-server.mjs")
const workspace = dirname(fixture)
const paths = createRuntimePaths({ KNOWBEE_STATE_DIR: root }, { homeDir: root, exists: () => false })

beforeAll(() => {
  getDb({ paths })
  initializeToolDispatcher(DEFAULT_CONFIG)
})

afterAll(async () => {
  await mcpRegistry.closeAll()
  closeDb()
  rmSync(root, { recursive: true, force: true })
})

describe("task029 MCP mutation composition", () => {
  it("persists, applies and verifies a real fake-MCP create command", async () => {
    const config = {
      ...DEFAULT_CONFIG,
      profile: { ...DEFAULT_CONFIG.profile, workspace },
      security: { ...DEFAULT_CONFIG.security, allowedPaths: [workspace] },
      mcp: { servers: {} },
    }
    const runtime = createApiMcpMutationRuntime({ config, paths, mcpProcessEnv: {} , now: () => 100 })
    const receipt = await runtime.executeCreate({
      envelope: { actorRef: "api:owner", scope: "capability:write", mutationId: "mutation-live-fake", targetRevision: 1, purpose: "mcp_create", issuedAt: 100, nonce: "nonce-live-fake" },
      draft: { displayName: "Fake MCP", transport: "stdio", command: process.execPath, args: [fixture], cwd: workspace, required: true },
    })
    expect(receipt).toMatchObject({ state: "active", revision: 1 })
    expect(receipt.mcpRef).toMatch(/^mcp_v1_[a-f0-9]{24}$/u)
    expect(getCapabilityMutationReceipt("mutation-live-fake")).toMatchObject({ state: "active", target_revision: 1 })
    expect(listMcpServerCatalogEntries()).toEqual([expect.objectContaining({ display_name: "Fake MCP", status: "enabled", updated_at: 1 })])
    const persisted = readPersistedRawConfig(paths) as any
    expect(persisted.mcp.revision).toBe(1)
    const serverKey = Object.keys(persisted.mcp.servers)[0]
    expect(serverKey).toBeTruthy()
    expect(mcpRegistry.getStatuses()).toEqual([expect.objectContaining({ name: serverKey, ready: true, toolCount: 2 })])
    expect(JSON.stringify(receipt)).not.toMatch(/command|fixture|workspace|internal|env/)

    const disabled = await runtime.executeLifecycle({
      envelope: { actorRef: "api:owner", scope: "capability:write", mutationId: "mutation-live-disable", targetRevision: 2, purpose: "mcp_disable", issuedAt: 100, nonce: "nonce-live-disable" },
      mcpRef: receipt.mcpRef ?? "",
      action: "disable",
    })
    expect(disabled).toMatchObject({ state: "active", status: "disabled", revision: 2 })
    expect(mcpRegistry.getStatuses()).toEqual([expect.objectContaining({ name: serverKey, ready: false, toolCount: 0 })])

    const enabled = await runtime.executeLifecycle({
      envelope: { actorRef: "api:owner", scope: "capability:write", mutationId: "mutation-live-enable", targetRevision: 3, purpose: "mcp_enable", issuedAt: 100, nonce: "nonce-live-enable" },
      mcpRef: receipt.mcpRef ?? "",
      action: "enable",
    })
    expect(enabled).toMatchObject({ state: "active", status: "enabled", revision: 3 })
    expect(mcpRegistry.getStatuses()).toEqual([expect.objectContaining({ name: serverKey, ready: true, toolCount: 2 })])

    const deleted = await runtime.executeLifecycle({
      envelope: { actorRef: "api:owner", scope: "capability:write", mutationId: "mutation-live-delete", targetRevision: 4, purpose: "mcp_delete", issuedAt: 100, nonce: "nonce-live-delete" },
      mcpRef: receipt.mcpRef ?? "",
      action: "delete",
    })
    expect(deleted).toMatchObject({ state: "active", status: "deleted", deleted: true, revision: 4 })
    expect(mcpRegistry.getStatuses()).toEqual([])
    expect(listMcpServerCatalogEntries()).toEqual([])
    const finalPersisted = readPersistedRawConfig(paths) as any
    expect(finalPersisted.mcp.revision).toBe(4)
    expect(finalPersisted.mcp.servers).toEqual({})
  })
})
