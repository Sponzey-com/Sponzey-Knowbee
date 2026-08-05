import { beforeEach, describe, expect, it, vi } from "vitest"
import { localAdapter } from "../packages/webui/src/api/adapters/local.js"

const draft = {
  displayName: "Penpot",
  transport: "stdio" as const,
  command: "node",
  args: ["server.mjs"],
  cwd: "/workspace",
  required: false,
}
const envelope = {
  scope: "capability:write" as const,
  mutationId: "m1",
  targetRevision: 8,
  purpose: "mcp_create" as const,
  issuedAt: 100,
  nonce: "n1",
}
const mcpRef = `mcp_v1_${"a".repeat(24)}`

describe("task030 MCP mutation adapter", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubGlobal("localStorage", { getItem: () => null })
  })

  it("sends draft and saved-ref probes with cancellation", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        state: "ready",
        ready: true,
        reasonCode: null,
        observedAt: 100,
        tools: [],
      }),
    })
    vi.stubGlobal("fetch", fetchMock)
    const controller = new AbortController()
    await localAdapter.probeMcpDraft(draft, controller.signal)
    await localAdapter.probeExistingMcp(mcpRef, controller.signal)
    expect(fetchMock.mock.calls[0]).toEqual([
      "/api/capabilities/mcp/probe",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ draft }),
        signal: controller.signal,
      }),
    ])
    expect(fetchMock.mock.calls[1]).toEqual([
      `/api/capabilities/mcp/${mcpRef}/probe`,
      expect.objectContaining({ method: "POST", body: "{}", signal: controller.signal }),
    ])
  })

  it("uses create and protected update endpoints without raw hidden metadata", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        mutationId: "m1",
        state: "active",
        reasonCode: null,
        allowedActions: [],
        revision: 8,
        mcpRef,
      }),
    })
    vi.stubGlobal("fetch", fetchMock)
    await localAdapter.createMcp({ envelope, draft })
    const update = {
      envelope: { ...envelope, purpose: "mcp_update" as const },
      change: { displayName: "Penpot Design", required: true },
    }
    await localAdapter.updateMcp(mcpRef, update)
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/capabilities/mcp")
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`/api/capabilities/mcp/${mcpRef}`)
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: "PATCH",
      body: JSON.stringify(update),
    })
    expect(fetchMock.mock.calls[1]?.[1]?.body).not.toMatch(/command|args|cwd|environment|secret/)
  })

  it("returns conflict receipts for user recovery", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        statusText: "Conflict",
        json: async () => ({
          mutationId: "m1",
          state: "rejected",
          reasonCode: "mutation_revision_conflict",
          allowedActions: [],
          revision: 7,
          mcpRef: null,
        }),
      }),
    )
    await expect(localAdapter.createMcp({ envelope, draft })).resolves.toMatchObject({
      state: "rejected",
      reasonCode: "mutation_revision_conflict",
    })
  })
})
