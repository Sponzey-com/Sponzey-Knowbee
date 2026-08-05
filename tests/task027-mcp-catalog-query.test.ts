import { describe, expect, it } from "vitest"
import { buildMcpCatalogPage, buildMcpCatalogSnapshot } from "../packages/core/src/capabilities/mcp-catalog-query.js"
import { createMcpPublicRef } from "../packages/core/src/capabilities/mcp-public-reference.js"

const row = (id: string, name: string, overrides = {}) => ({ mcp_server_id: id, status: "enabled" as const, display_name: name, metadata_json: JSON.stringify({ transport: "stdio" }), updated_at: 7, ...overrides })
const runtime = (name: string, overrides = {}) => ({ name, transport: "stdio" as const, enabled: true, required: false, ready: true, toolCount: 1, registeredToolCount: 1, command: "/secret/bin/server", url: "https://token@example.test", error: "/private/path token=secret", tools: [{ name: "inspect", registeredName: `mcp__${name}__inspect`, description: "Inspect a design" }], ...overrides })

describe("task027 MCP catalog query", () => {
  it("merges exact catalog and runtime keys into a redacted user projection", () => {
    const snapshot = buildMcpCatalogSnapshot({
      rows: [row("mcp:penpot", "Penpot")],
      bindings: [{ catalog_id: "mcp:penpot", status: "enabled", updated_at: 8 }],
      runtimeStatuses: [runtime("penpot")],
      observedAt: 10,
      publicRefForMcpId: createMcpPublicRef,
    })
    expect(snapshot.items[0]).toMatchObject({ displayName: "Penpot", transport: "stdio", configuredStatus: "enabled", runtimeStatus: "ready", required: false, toolCount: 1, bindingCount: 1, issueCode: null, revision: 8 })
    expect(snapshot.items[0]?.tools).toEqual([{ name: "inspect", description: "Inspect a design" }])
    expect(JSON.stringify(snapshot)).not.toMatch(/command|registeredName|url|error|secret|private|mcp:penpot/)
  })

  it("keeps catalog-only and runtime-only entries with explicit structural status", () => {
    const snapshot = buildMcpCatalogSnapshot({
      rows: [row("mcp:stored", "Stored", { status: "disabled" })],
      bindings: [],
      runtimeStatuses: [runtime("live", { ready: false, required: true })],
      observedAt: 20,
      publicRefForMcpId: createMcpPublicRef,
    })
    expect(snapshot.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ displayName: "Stored", configuredStatus: "disabled", runtimeStatus: "inactive", issueCode: "mcp_inactive" }),
      expect.objectContaining({ displayName: "live", configuredStatus: "enabled", runtimeStatus: "unavailable", issueCode: "mcp_required_unavailable" }),
    ]))
  })

  it("keeps the public ref stable when a runtime-only server gains a catalog projection", () => {
    const before = buildMcpCatalogSnapshot({ rows: [], bindings: [], runtimeStatuses: [runtime("penpot")], observedAt: 1, publicRefForMcpId: createMcpPublicRef })
    const after = buildMcpCatalogSnapshot({ rows: [row("mcp:penpot", "Penpot")], bindings: [], runtimeStatuses: [runtime("penpot")], observedAt: 2, publicRefForMcpId: createMcpPublicRef })
    expect(before.items[0]?.mcpRef).toBe(after.items[0]?.mcpRef)
  })

  it("filters and paginates 500 entries deterministically", () => {
    const rows = Array.from({ length: 500 }, (_, index) => row(`mcp:s${index}`, `Server ${String(index).padStart(3, "0")}`))
    const first = buildMcpCatalogPage({ rows, bindings: [], runtimeStatuses: [], query: { limit: 100, search: "Server" }, observedAt: 30, publicRefForMcpId: createMcpPublicRef })
    const second = buildMcpCatalogPage({ rows, bindings: [], runtimeStatuses: [], query: { limit: 100, cursor: first.nextCursor ?? undefined }, observedAt: 30, publicRefForMcpId: createMcpPublicRef })
    expect(first.items).toHaveLength(100)
    expect(first.items[0]?.displayName).toBe("Server 000")
    expect(second.items[0]?.displayName).toBe("Server 100")
    expect(first.revision).toBe(7)
  })

  it("fails closed for invalid JSON, duplicate exact keys and public refs", () => {
    expect(() => buildMcpCatalogSnapshot({ rows: [row("mcp:a", "A", { metadata_json: "{" })], bindings: [], runtimeStatuses: [], observedAt: 1, publicRefForMcpId: createMcpPublicRef })).toThrow("mcp_catalog_metadata_invalid")
    expect(() => buildMcpCatalogSnapshot({ rows: [row("mcp:a", "A"), row("a", "B")], bindings: [], runtimeStatuses: [], observedAt: 1, publicRefForMcpId: createMcpPublicRef })).toThrow("mcp_catalog_key_collision")
    expect(() => buildMcpCatalogSnapshot({ rows: [row("mcp:a", "A"), row("mcp:b", "B")], bindings: [], runtimeStatuses: [], observedAt: 1, publicRefForMcpId: () => `mcp_v1_${"a".repeat(24)}` })).toThrow("mcp_public_ref_collision")
    expect(() => buildMcpCatalogSnapshot({ rows: [row("mcp:a", "Same"), row("mcp:b", "same")], bindings: [], runtimeStatuses: [], observedAt: 1, publicRefForMcpId: createMcpPublicRef })).toThrow("mcp_display_name_collision")
  })
})
